-- Mantém o estacionamento aberto após o vencimento até encerramento explícito.
-- Permite que o titular ou um administrador encerre a sessão.

create or replace function public.finish_parking_session(p_session_id uuid)
returns public.parking_sessions
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.parking_sessions;
  v_is_admin boolean := false;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.role = 'admin'::public.app_role and p.is_active
  ) into v_is_admin;

  update public.parking_sessions s
  set status = case
        when s.expires_at <= now() then 'expired'::public.parking_status
        else 'finished'::public.parking_status
      end,
      ended_at = now()
  where s.id = p_session_id
    and s.status = 'active'
    and (s.user_id = v_user_id or v_is_admin)
  returning * into v_session;

  if not found then
    raise exception 'Estacionamento em andamento não encontrado ou sem permissão para encerrá-lo.' using errcode = 'P0002';
  end if;

  return v_session;
end;
$function$;

do $$
declare
  v_definition text;
  v_expiry_update text := $block$  update public.parking_sessions s set status = 'expired'
  where s.status = 'active' and s.expires_at <= now();$block$;
begin
  select pg_get_functiondef(
    'public.start_parking_session(uuid,uuid,public.parking_category,double precision,double precision,double precision)'::regprocedure
  ) into v_definition;

  if position(v_expiry_update in v_definition) > 0 then
    v_definition := replace(v_definition, v_expiry_update, '');
    execute v_definition;
  elsif position('update public.parking_sessions s set status = ''expired''' in v_definition) > 0 then
    raise exception 'Rotina automática de expiração não foi removida; migração cancelada.';
  end if;
end
$$;

-- Recupera sessões marcadas como vencidas pelo comportamento anterior,
-- desde que nunca tenham recebido um encerramento explícito.
update public.parking_sessions
set status = 'active'
where status = 'expired' and ended_at is null;

grant execute on function public.finish_parking_session(uuid) to authenticated;
