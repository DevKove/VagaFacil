-- Libera o início de estacionamento em qualquer dia e horário.
-- Mantém os limites de duração por categoria, sem truncar o prazo pelo horário comercial.
do $$
declare
  v_definition text;
  v_schedule_block text;
  v_expiry_block text;
begin
  select pg_get_functiondef(
    'public.start_parking_session(uuid,uuid,public.parking_category,double precision,double precision,double precision)'::regprocedure
  ) into v_definition;

  v_schedule_block := $block$  select exists (
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
$block$;

  v_expiry_block := $block$  v_local_expiry := least(
    v_local_now + make_interval(mins => v_duration_minutes),
    v_local_now::date + v_end_time
  );
$block$;

  if position(v_schedule_block in v_definition) = 0 then
    raise exception 'Bloco de restrição de calendário não encontrado; migração cancelada.';
  end if;
  if position(v_expiry_block in v_definition) = 0 then
    raise exception 'Bloco de expiração não encontrado; migração cancelada.';
  end if;

  v_definition := replace(v_definition, v_schedule_block, '');
  v_definition := replace(
    v_definition,
    v_expiry_block,
    '  v_local_expiry := v_local_now + make_interval(mins => v_duration_minutes);' || chr(10)
  );
  execute v_definition;
end
$$;
