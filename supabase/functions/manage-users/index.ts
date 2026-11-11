import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://devkove.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://devkove.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

type Action = "list" | "create" | "update" | "delete";
type Payload = {
  action: Action;
  id?: string;
  full_name?: string;
  email?: string;
  password?: string;
  role?: "admin" | "supervisor" | "agent" | "citizen";
  is_active?: boolean;
};

const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, origin);
  if (origin && !allowedOrigins.has(origin)) return json({ error: "Origem não autorizada." }, 403, origin);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token || token === authHeader) return json({ error: "Sessão inválida." }, 401, origin);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Configuração administrativa indisponível no servidor.");

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão expirada ou inválida." }, 401, origin);

    const actorId = authData.user.id;
    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("id,role,is_active")
      .eq("id", actorId)
      .single();
    if (actorError || !actor?.is_active || actor.role !== "admin") {
      return json({ error: "Somente um administrador ativo pode gerenciar usuários." }, 403, origin);
    }

    const body = await req.json() as Payload;
    const validRoles = new Set(["admin", "supervisor", "agent", "citizen"]);
    const audit = async (action: string, entityId: string, metadata: Record<string, unknown> = {}) => {
      await admin.from("audit_logs").insert({
        actor_id: actorId, action, entity_type: "profile", entity_id: entityId, metadata,
      });
    };

    if (body.action === "list") {
      const [{ data: profiles, error: profilesError }, { data: authUsers, error: usersError }] = await Promise.all([
        admin.from("profiles").select("id,full_name,role,is_active,created_at,deleted_at").is("deleted_at", null).order("full_name").limit(1000),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);
      if (profilesError) throw profilesError;
      if (usersError) throw usersError;
      const emails = new Map((authUsers.users || []).map(user => [user.id, user.email || ""]));
      return json({ users: (profiles || []).map(profile => ({ ...profile, email: emails.get(profile.id) || "" })) }, 200, origin);
    }

    if (body.action === "create") {
      const fullName = body.full_name?.trim();
      const email = body.email?.trim().toLowerCase();
      const password = body.password || "";
      if (!fullName || fullName.length > 120) return json({ error: "Informe o nome completo (até 120 caracteres)." }, 400);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
      if (password.length < 10) return json({ error: "A senha inicial deve ter pelo menos 10 caracteres." }, 400);
      if (!body.role || !validRoles.has(body.role)) return json({ error: "Perfil inválido." }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error) throw error;
      const userId = data.user.id;
      const { error: profileError } = await admin.from("profiles").update({
        full_name: fullName, role: body.role, is_active: body.is_active ?? true,
      }).eq("id", userId);
      if (profileError) {
        await admin.auth.admin.deleteUser(userId);
        throw profileError;
      }
      await audit("user_created", userId, { email, role: body.role });
      return json({ success: true, id: userId }, 200, origin);
    }

    if (!body.id) return json({ error: "Usuário não informado." }, 400);
    if (body.action === "delete") {
      if (body.id === actorId) return json({ error: "Não é permitido excluir a própria conta administrativa." }, 400);
      const { data: target, error: targetError } = await admin.from("profiles").select("id,role").eq("id", body.id).is("deleted_at", null).single();
      if (targetError) throw targetError;
      if (target.role === "admin") {
        const { count, error: countError } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
        if (countError) throw countError;
        if ((count || 0) <= 1) return json({ error: "Não é possível excluir o último administrador ativo." }, 400);
      }
      const { error: profileDeleteError } = await admin.from("profiles").update({
        deleted_at: new Date().toISOString(), is_active: false,
        full_name: "Conta excluída", cpf: null, phone: null,
      }).eq("id", body.id).is("deleted_at", null);
      if (profileDeleteError) throw profileDeleteError;
      const { error: authDeleteError } = await admin.auth.admin.updateUserById(body.id, {
        email: `deleted+${body.id}@vagafacil.invalid`,
        password: crypto.randomUUID(),
        email_confirm: false,
        user_metadata: { full_name: "Conta excluída" },
      });
      if (authDeleteError) throw authDeleteError;
      await audit("user_deleted", body.id);
      return json({ success: true }, 200, origin);
    }

    if (body.action === "update") {
      const patch: Record<string, unknown> = {};
      if (body.full_name !== undefined) {
        const name = body.full_name.trim();
        if (!name || name.length > 120) return json({ error: "Nome inválido." }, 400);
        patch.full_name = name;
      }
      if (body.role !== undefined) {
        if (!validRoles.has(body.role)) return json({ error: "Perfil inválido." }, 400);
        if (body.id === actorId && body.role !== "admin") return json({ error: "Não é permitido remover o próprio perfil administrativo." }, 400);
        patch.role = body.role;
      }
      if (body.is_active !== undefined) {
        if (body.id === actorId && !body.is_active) return json({ error: "Não é permitido suspender a própria conta." }, 400);
        patch.is_active = body.is_active;
      }
      const { data: current, error: currentError } = await admin.from("profiles").select("role,is_active").eq("id", body.id).single();
      if (currentError) throw currentError;
      if (current.role === "admin" && (body.role !== undefined && body.role !== "admin" || body.is_active === false)) {
        const { count, error: countError } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
        if (countError) throw countError;
        if ((count || 0) <= 1) return json({ error: "Não é possível desativar ou rebaixar o último administrador ativo." }, 400);
      }

      const authPatch: { email?: string; password?: string; email_confirm?: boolean } = {};
      if (body.email !== undefined) {
        const email = body.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido." }, 400);
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      if (body.password) {
        if (body.password.length < 10) return json({ error: "A senha deve ter pelo menos 10 caracteres." }, 400);
        authPatch.password = body.password;
      }
      if (Object.keys(authPatch).length) {
        const { error } = await admin.auth.admin.updateUserById(body.id, authPatch);
        if (error) throw error;
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from("profiles").update(patch).eq("id", body.id);
        if (error) throw error;
      }
      await audit("user_updated", body.id, { fields: [...Object.keys(patch), ...Object.keys(authPatch)] });
      return json({ success: true });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerenciar usuário.";
    return json({ error: message }, 400, origin);
  }
});
