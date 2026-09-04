create or replace function public.substituir_gatilhos_resultados(
  p_dados jsonb,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_arquivo_nome text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_importado_em timestamptz := now();
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  ) then
    raise exception 'Apenas administradores aprovados podem atualizar a carga de gatilhos.'
      using errcode = '42501';
  end if;

  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_fim < p_periodo_inicio then
    raise exception 'Período da carga inválido.' using errcode = '22007';
  end if;

  if p_dados is null or jsonb_typeof(p_dados) <> 'array' or jsonb_array_length(p_dados) = 0 then
    raise exception 'A carga deve conter ao menos um resultado.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_dados) > 5000 then
    raise exception 'A carga excede o limite de 5000 resultados.' using errcode = '22023';
  end if;

  insert into public.gatilhos_resultados (
    id_externo,
    valor,
    valor_instalador,
    valor_auxiliar,
    valor_deslocamento,
    periodo_inicio,
    periodo_fim,
    arquivo_nome,
    importado_em,
    importado_por
  )
  select
    btrim(item.id_externo),
    coalesce(item.valor, 0),
    coalesce(item.valor_instalador, 0),
    coalesce(item.valor_auxiliar, 0),
    coalesce(item.valor_deslocamento, 0),
    p_periodo_inicio,
    p_periodo_fim,
    nullif(btrim(p_arquivo_nome), ''),
    v_importado_em,
    (select auth.uid())
  from jsonb_to_recordset(p_dados) as item(
    id_externo text,
    valor numeric,
    valor_instalador numeric,
    valor_auxiliar numeric,
    valor_deslocamento numeric
  )
  on conflict (id_externo) do update
  set valor = excluded.valor,
      valor_instalador = excluded.valor_instalador,
      valor_auxiliar = excluded.valor_auxiliar,
      valor_deslocamento = excluded.valor_deslocamento,
      periodo_inicio = excluded.periodo_inicio,
      periodo_fim = excluded.periodo_fim,
      arquivo_nome = excluded.arquivo_nome,
      importado_em = excluded.importado_em,
      importado_por = excluded.importado_por;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;
