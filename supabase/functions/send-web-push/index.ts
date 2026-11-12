import { createClient } from "npm:@supabase/supabase-js@2";
import { ApplicationServer, importVapidKeys, Urgency } from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://devkove.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão não autenticada." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const exportedVapidKeys = Deno.env.get("VAPID_KEYS");
    const contactInformation = Deno.env.get("VAPID_SUBJECT") || "https://devkove.github.io/VagaFacil/";

    if (!supabaseUrl || !serviceRoleKey || !exportedVapidKeys) {
      console.error("Configuração de Web Push incompleta.");
      return json({ error: "Notificações push ainda não configuradas no servidor." }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role,is_active,deleted_at")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== "admin" || !profile.is_active || profile.deleted_at) {
      return json({ error: "Somente administradores ativos podem emitir alertas." }, 403);
    }

    const { notificationId } = await req.json();
    if (typeof notificationId !== "string" || !/^[0-9a-f-]{36}$/i.test(notificationId)) {
      return json({ error: "Identificador de notificação inválido." }, 400);
    }

    const { data: notice, error: noticeError } = await admin
      .from("notifications")
      .select("id,user_id,title,body,kind")
      .eq("id", notificationId)
      .eq("kind", "admin_manual_alert")
      .maybeSingle();

    if (noticeError) throw noticeError;
    if (!notice) return json({ error: "Alerta não encontrado." }, 404);

    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("id,subscription")
      .eq("user_id", notice.user_id);

    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return json({ sent: 0, total: 0, message: "O usuário ainda não ativou notificações neste aparelho." });

    const vapidKeys = await importVapidKeys(JSON.parse(exportedVapidKeys));
    const applicationServer = await ApplicationServer.new({ contactInformation, vapidKeys });
    const payload = JSON.stringify({
      title: notice.title || "Alerta do VagaFácil",
      body: notice.body,
      url: "/",
      tag: `vagafacil-${notice.id}`,
    });

    let sent = 0;
    const expiredIds: string[] = [];
    const results = await Promise.allSettled(subscriptions.map(async (row) => {
      const subscriber = applicationServer.subscribe(row.subscription);
      try {
        await subscriber.pushTextMessage(payload, {
          ttl: 60 * 60,
          urgency: Urgency.High,
          topic: notice.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/410|404|gone|not found/i.test(message)) expiredIds.push(row.id);
        console.error("Falha ao enviar push:", message);
        throw error;
      }
    }));

    if (expiredIds.length) {
      await admin.from("push_subscriptions").delete().in("id", expiredIds);
    }

    const failed = results.filter((result) => result.status === "rejected").length;
    return json({ sent, failed, total: subscriptions.length });
  } catch (error) {
    console.error("send-web-push:", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao enviar notificação." }, 500);
  }
});
