-- Registra a posição do dispositivo no instante de início do estacionamento.
alter table public.parking_sessions
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_captured_at timestamptz;

comment on column public.parking_sessions.latitude is 'Latitude capturada pelo navegador no início do estacionamento.';
comment on column public.parking_sessions.longitude is 'Longitude capturada pelo navegador no início do estacionamento.';
comment on column public.parking_sessions.location_accuracy_m is 'Precisão estimada da geolocalização em metros.';
comment on column public.parking_sessions.location_captured_at is 'Data/hora em que o navegador capturou a localização.';

-- Categorias especiais do usuário e prazo regulamentar de até 2 horas.
alter table public.parking_sessions
  add column if not exists beneficiary_category public.parking_category
  not null default 'conventional';

update public.parking_rules
set special_minutes = 120
where special_minutes <> 120;

drop function if exists public.start_parking_session(uuid, uuid);

drop function if exists public.start_parking_session(uuid, uuid, public.parking_category);

create or replace function public.start_parking_session(
  p_vehicle_id uuid,
  p_space_id uuid default null,
  p_beneficiary_category public.parking_category default 'conventional',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null
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
  v_beneficiary_category public.parking_category := coalesce(p_beneficiary_category, 'conventional');
  v_session public.parking_sessions;
  v_holiday boolean := false;
  v_end_time time;
  v_duration_minutes integer;
begin
  if v_user_id is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    raise exception 'A localização do dispositivo é obrigatória para registrar o estacionamento.' using errcode = '22023';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 100000) then
    raise exception 'Precisão da localização inválida.' using errcode = '22023';
  end if;
  if v_beneficiary_category not in ('conventional', 'elderly', 'accessible') then
    raise exception 'Categoria de usuário inválida.' using errcode = '22023';
  end if;
  select p.role, p.is_active into v_profile_role, v_profile_active
  from public.profiles p where p.id = v_user_id for update;
  if not found or not v_profile_active or v_profile_role <> 'citizen' then
    raise exception 'Apenas cidadãos com conta ativa podem registrar estacionamento.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
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
  select exists (
    select 1 from public.holidays h
    where h.holiday_date = v_local_now::date and h.free_parking
  ) into v_holiday;
  if v_holiday then
    raise exception 'Hoje é feriado com estacionamento rotativo suspenso.' using errcode = 'P0001';
  end if;
  if extract(isodow from v_local_now)::integer = 6 then
    v_end_time := v_rule.saturday_end;
    if v_rule.saturday_start is null or v_rule.saturday_end is null
       or v_local_now::time < v_rule.saturday_start or v_local_now::time >= v_rule.saturday_end then
      raise exception 'Aos sábados, o registro está disponível somente entre % e %.',
        v_rule.saturday_start, v_rule.saturday_end using errcode = 'P0001';
    end if;
  else
    if not (extract(isodow from v_local_now)::integer = any(v_rule.weekdays)) then
      raise exception 'O estacionamento rotativo não funciona neste dia.' using errcode = 'P0001';
    end if;
    v_end_time := v_rule.end_time;
    if v_local_now::time < v_rule.start_time or v_local_now::time >= v_rule.end_time then
      raise exception 'O registro está disponível somente entre % e %.',
        v_rule.start_time, v_rule.end_time using errcode = 'P0001';
    end if;
  end if;
  if p_space_id is not null then
    select * into v_space from public.parking_spaces s
    where s.id = p_space_id and s.active for update;
    if not found then
      raise exception 'Vaga inexistente ou indisponível.' using errcode = 'P0002';
    end if;
    v_category := v_space.category;
  end if;
  update public.parking_sessions s set status = 'expired'
  where s.status = 'active' and s.expires_at <= now();
  if exists (select 1 from public.parking_sessions s where s.user_id = v_user_id and s.status = 'active') then
    raise exception 'Você já possui um estacionamento em andamento.' using errcode = '23505';
  end if;
  if exists (select 1 from public.parking_sessions s where s.vehicle_id = p_vehicle_id and s.status = 'active') then
    raise exception 'Este veículo já possui um estacionamento ativo.' using errcode = '23505';
  end if;
  if p_space_id is not null and exists (select 1 from public.parking_sessions s where s.space_id = p_space_id and s.status = 'active') then
    raise exception 'Esta vaga já está ocupada.' using errcode = '23505';
  end if;
  v_duration_minutes := case
    when v_beneficiary_category in ('elderly', 'accessible') then least(v_rule.special_minutes, 120)
    else least(v_rule.conventional_minutes, 60)
  end;
  v_local_expiry := least(
    v_local_now + make_interval(mins => v_duration_minutes),
    date_trunc('day', v_local_now) + v_end_time
  );
  insert into public.parking_sessions
    (user_id, vehicle_id, space_id, plate_snapshot, category, beneficiary_category,
     latitude, longitude, location_accuracy_m, location_captured_at, started_at, expires_at, status)
  values
    (v_user_id, v_vehicle.id, p_space_id, v_vehicle.plate, v_category, v_beneficiary_category,
     p_latitude, p_longitude, p_accuracy_m, now(), now(), v_local_expiry at time zone v_rule.timezone, 'active')
  returning * into v_session;
  return v_session;
end;
$$;
revoke all on function public.start_parking_session(uuid, uuid, public.parking_category, double precision, double precision, double precision) from public, anon;
grant execute on function public.start_parking_session(uuid, uuid, public.parking_category, double precision, double precision, double precision) to authenticated;

