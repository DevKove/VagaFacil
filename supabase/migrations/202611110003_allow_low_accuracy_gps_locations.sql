-- Aceita localizações GPS aproximadas sem impor um limite arbitrário de precisão.
-- Valores negativos e não finitos continuam inválidos.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.start_parking_session(uuid,uuid,public.parking_category,double precision,double precision,double precision)'::regprocedure
  ) into v_definition;

  if position('p_accuracy_m > 100000' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'p_accuracy_m < 0 or p_accuracy_m > 100000',
      'p_accuracy_m < 0 or p_accuracy_m::text in (''NaN'', ''Infinity'', ''-Infinity'')'
    );
    execute v_definition;
  elsif position(
    'p_accuracy_m::text in (''NaN'', ''Infinity'', ''-Infinity'')'
    in v_definition
  ) = 0 then
    raise exception 'Validação de precisão GPS não reconhecida; migração cancelada.';
  end if;
end
$$;
