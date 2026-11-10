-- Regras transacionais do estacionamento rotativo.
-- A duração máxima é de 60 minutos, somente em dias úteis, das 09h às 18h.
create unique index if not exists parking_sessions_one_active_vehicle_idx
  on public.parking_sessions (vehicle_id) where status = 'active';

create unique index if not exists parking_sessions_one_active_space_idx
  on public.parking_sessions (space_id) where status = 'active' and space_id is not null;

insert into public.parking_rules
  (name, timezone, weekdays, start_time, end_time, conventional_minutes, special_minutes, grace_minutes, enabled, effective_from)
select 'Regra padrão VagaFácil', 'America/Sao_Paulo', array[1,2,3,4,5]::smallint[],
       time '09:00', time '18:00', 60, 60, 0, true, current_date
where not exists (select 1 from public.parking_rules);

create or replace function public.start_parking_session(
  p_vehicle_id uuid,
  p_space_id uuid default null
)
returns public.parking_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_role public.app_role;
  v_profile_active boolean;
  v_vehicle public.vehicles;
  v_space public.parking_spaces;
  v_rule public.parking_rules;
  v_local_now timestamp;
  v_local_expiry timestamp;
  v_category public.parking_category := 'conventional';
  v_session public.parking_sessions;
  v_holiday boolean := false;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;

  select p.role, p.is_active into v_profile_role, v_profile_active
  from public.profiles p where p.id = v_user_id for update;

  if not found or not v_profile_active or v_profile_role <> 'citizen' then
    raise exception 'Apenas cidadãos com conta ativa podem registrar estacionamento.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text, 0));

  select * into v_vehicle from public.vehicles v
  where v.id = p_vehicle_id and v.owner_id = v_user_id for update;
  if not found then
    raise exception 'Veículo não encontrado ou não pertence à sua conta.' using errcode = 'P0002';
  end if;

  select * into v_rule from public.parking_rules r
  where r.enabled and r.effective_from <= (now() at time zone r.timezone)::date
  order by r.effective_from desc, r.created_at desc limit 1;
  if not found then
    raise exception 'As regras de estacionamento ainda não foram configuradas.' using errcode = 'P0001';
  end if;

  v_local_now := now() at time zone v_rule.timezone;

  if not (extract(isodow from v_local_now)::integer = any(v_rule.weekdays)) then
    raise exception 'O estacionamento rotativo funciona apenas nos dias úteis configurados.' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.holidays h
    where h.holiday_date = v_local_now::date and h.free_parking
  ) into v_holiday;
  if v_holiday then
    raise exception 'Hoje é feriado com estacionamento rotativo suspenso.' using errcode = 'P0001';
  end if;

  if v_local_now::time < v_rule.start_time or v_local_now::time >= v_rule.end_time then
    raise exception 'O registro está disponível somente entre % e %.', v_rule.start_time, v_rule.end_time using errcode = 'P0001';
  end if;

  if p_space_id is not null then
    select * into v_space from public.parking_spaces s
    where s.id = p_space_id and s.active for update;
    if not found then
      raise exception 'Vaga inexistente ou indisponível.' using errcode = 'P0002';
    end if;
    v_category := v_space.category;
  end if;

  update public.parking_sessions s
  set status = 'expired'
  where s.vehicle_id = p_vehicle_id and s.status = 'active' and s.expires_at <= now();

  if exists (
    select 1 from public.parking_sessions s
    where s.vehicle_id = p_vehicle_id and s.status = 'active'
  ) then
    raise exception 'Este veículo já possui um estacionamento ativo.' using errcode = '23505';
  end if;

  if p_space_id is not null and exists (
    select 1 from public.parking_sessions s
    where s.space_id = p_space_id and s.status = 'active'
  ) then
    raise exception 'Esta vaga já está ocupada.' using errcode = '23505';
  end if;

  v_local_expiry := least(
    v_local_now + make_interval(mins => least(v_rule.conventional_minutes, 60)),
    date_trunc('day', v_local_now) + v_rule.end_time
  );

  insert into public.parking_sessions
    (user_id, vehicle_id, space_id, plate_snapshot, category, started_at, expires_at, status)
  values
    (v_user_id, v_vehicle.id, p_space_id, v_vehicle.plate, v_category, now(),
     v_local_expiry at time zone v_rule.timezone, 'active')
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.finish_parking_session(p_session_id uuid)
returns public.parking_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.parking_sessions;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;

  update public.parking_sessions s
  set status = case when s.expires_at <= now() then 'expired'::public.parking_status
                    else 'finished'::public.parking_status end,
      ended_at = now()
  where s.id = p_session_id
    and s.user_id = v_user_id
    and s.status = 'active'
  returning * into v_session;

  if not found then
    raise exception 'Estacionamento ativo não encontrado para esta conta.' using errcode = 'P0002';
  end if;

  return v_session;
end;
$$;

revoke all on function public.start_parking_session(uuid, uuid) from public, anon;
revoke all on function public.finish_parking_session(uuid) from public, anon;
grant execute on function public.start_parking_session(uuid, uuid) to authenticated;
grant execute on function public.finish_parking_session(uuid) to authenticated;

revoke insert, update, delete on public.parking_sessions from anon, authenticated;
grant select on public.parking_sessions to authenticated;
