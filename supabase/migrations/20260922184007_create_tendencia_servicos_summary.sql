create or replace function public.get_tendencia_servicos(
  p_inicio date,
  p_fim date
)
returns table (
  escopo text,
  mes date,
  cidade text,
  tipo_atividade text,
  tipo_os1 text,
  status_resumo text,
  quantidade bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      a.data_atividade,
      date_trunc('month', a.data_atividade)::date as mes,
      upper(coalesce(nullif(btrim(a.cidade), ''), 'NÃO INFORMADA')) as cidade,
      coalesce(nullif(btrim(a.tipo_atividade), ''), 'Não informado') as tipo_atividade,
      coalesce(nullif(btrim(a.tipo_os1), ''), 'Não informado') as tipo_os1,
      lower(btrim(coalesce(a.status_atividade, ''))) as status_atividade,
      lower(btrim(coalesce(a.status_execucao, ''))) as status_execucao,
      case
        when coalesce(a.cod_baixa_1, '') ~ '^\s*\d+'
          then (regexp_match(a.cod_baixa_1, '^\s*(\d+)'))[1]::integer
        else null
      end as codigo_baixa
    from public.atividades a
    where a.data_atividade between p_inicio and p_fim
  ),
  classificada as (
    select
      base.*,
      case
        when status_atividade in ('cancelado', 'cancelada', 'não concluído', 'nao concluido')
          then 'Cancelado'
        when codigo_baixa is not null then
          case
            when codigo_baixa >= 409 or status_execucao = 'executado no sistema netsms'
              then 'Produtiva'
            when status_execucao in ('cancelado no sistema netsms', 'liberado no sistema netsms')
              then 'Cancelado'
            else 'Improdutiva'
          end
        else 'Pendente'
      end as status_resumo
    from base
  ),
  resumo as (
    select
      'total'::text as escopo,
      mes,
      cidade,
      tipo_atividade,
      tipo_os1,
      status_resumo,
      count(*)::bigint as quantidade
    from classificada
    group by mes, cidade, tipo_atividade, tipo_os1, status_resumo

    union all

    select
      'comparavel'::text as escopo,
      mes,
      cidade,
      tipo_atividade,
      tipo_os1,
      status_resumo,
      count(*)::bigint as quantidade
    from classificada
    where extract(day from data_atividade) <= extract(day from p_fim)
    group by mes, cidade, tipo_atividade, tipo_os1, status_resumo
  )
  select
    resumo.escopo,
    resumo.mes,
    resumo.cidade,
    resumo.tipo_atividade,
    resumo.tipo_os1,
    resumo.status_resumo,
    resumo.quantidade
  from resumo
  order by resumo.escopo, resumo.mes, resumo.cidade, resumo.tipo_atividade, resumo.tipo_os1, resumo.status_resumo;
$$;

comment on function public.get_tendencia_servicos(date, date) is
  'Resumo agregado de atividades para análise de volume e status, com recorte total e mensal comparável.';

revoke all on function public.get_tendencia_servicos(date, date) from public;
revoke all on function public.get_tendencia_servicos(date, date) from anon;
grant execute on function public.get_tendencia_servicos(date, date) to authenticated;
