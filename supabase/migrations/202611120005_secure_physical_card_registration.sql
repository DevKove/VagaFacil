-- A escrita ocorre sob o usuário autenticado, protegida por RLS.
drop index if exists public.physical_card_sessions_active_plate_uidx;
drop index if exists public.physical_card_sessions_active_space_uidx;

drop policy if exists "Operations insert physical card sessions" on public.physical_card_sessions;
create policy "Operations insert physical card sessions"
  on public.physical_card_sessions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.current_app_role() in ('admin','agent')
  );
grant insert on public.physical_card_sessions to authenticated;

create or replace function public.register_physical_card_session(
  p_plate text,
  p_category public.parking_category default 'conventional',
  p_zone_id uuid default null,
  p_space_id uuid default null,
  p_started_at timestamptz default now(),
  p_notes text default null
)
returns public.physical_card_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_active boolean;
  v_plate text := upper(regexp_replace(coalesce(p_plate, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_category public.parking_category := coalesce(p_category, 'conventional');
  v_zone_id uuid := p_zone_id;
  v_space public.parking_spaces;
  v_rule public.parking_rules;
  v_duration integer;
  v_expiry timestamptz;
  v_record public.physical_card_sessions;
begin
  if v_actor is null then
    raise exception 'Autenticação necessária.' using errcode = '28000';
  end if;

  select p.role, p.is_active into v_role, v_active
  from public.profiles p where p.id = v_actor;
  if not found or not v_active or v_role not in ('admin','agent') then
    raise exception 'Somente agentes e administradores ativos podem registrar cartões físicos.' using errcode = '42501';
  end if;

  if v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Informe uma placa válida no padrão ABC1D23 ou ABC1234.' using errcode = '22023';
  end if;
  if p_started_at is null or p_started_at > now() then
    raise exception 'O início deve ser informado e não pode estar no futuro.' using errcode = '22023';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception 'As observações devem ter no máximo 500 caracteres.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_plate, 0));
  if p_space_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_space_id::text, 0));
  end if;

  select * into v_rule
  from public.parking_rules r
  where r.enabled
    and r.effective_from <= (p_started_at at time zone r.timezone)::date
  order by r.effective_from desc, r.created_at desc
  limit 1;
  if not found then
    raise exception 'Não há regra de duração configurada para a data informada.' using errcode = 'P0001';
  end if;

  if p_space_id is not null then
    select * into v_space
    from public.parking_spaces s
    where s.id = p_space_id and s.active;
    if not found then
      raise exception 'A vaga selecionada não existe ou está inativa.' using errcode = 'P0002';
    end if;
    if v_zone_id is not null and v_space.zone_id is distinct from v_zone_id then
      raise exception 'A vaga selecionada não pertence à zona informada.' using errcode = '22023';
    end if;
    v_zone_id := coalesce(v_zone_id, v_space.zone_id);
    v_category := v_space.category;
  end if;

  v_duration := case
    when v_category in ('elderly','accessible') then least(v_rule.special_minutes, 120)
    else least(v_rule.conventional_minutes, 60)
  end;
  v_expiry := p_started_at + make_interval(mins => v_duration);

  if exists (
    select 1 from public.physical_card_sessions s
    where s.plate_snapshot = v_plate and s.status = 'active' and s.expires_at > now()
  ) then
    raise exception 'Já existe um cartão físico em andamento para esta placa.' using errcode = '23505';
  end if;
  if p_space_id is not null and exists (
    select 1 from public.physical_card_sessions s
    where s.space_id = p_space_id and s.status = 'active' and s.expires_at > now()
  ) then
    raise exception 'Já existe um registro ativo para esta vaga.' using errcode = '23505';
  end if;

  insert into public.physical_card_sessions
    (plate_snapshot, category, zone_id, space_id, started_at, expires_at, status, created_by, notes)
  values
    (v_plate, v_category, v_zone_id, p_space_id, p_started_at, v_expiry,
     case when v_expiry > now() then 'active' else 'expired' end, v_actor, nullif(btrim(p_notes), ''))
  returning * into v_record;

  return v_record;
end;
$$;

revoke all on function public.register_physical_card_session(text, public.parking_category, uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.register_physical_card_session(text, public.parking_category, uuid, uuid, timestamptz, text) to authenticated;