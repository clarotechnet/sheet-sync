-- Ajuste complementar da regra de instalacao:
-- todo Retorno Credenciada e uma revisita, mesmo quando o historico anterior
-- nao estiver disponivel no banco dentro da janela de 30 dias.
--
-- A janela de 30 dias continua sendo usada para identificar o tecnico da
-- atividade imediatamente anterior. Sem esse historico, tecnico_referencia e
-- usado como fallback. A regra existente de Visita Tecnica e preservada.

set local statement_timeout = '0';

drop trigger if exists trg_calc_revisita
on public.atividades;

create or replace function public.fn_calc_revisita()
returns trigger
language plpgsql
as $$
declare
  v_contrato text;
  v_contrato_novo text;
  v_contrato_anterior text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  v_contrato_novo := nullif(btrim(new.contrato), '');

  if tg_op = 'UPDATE' then
    v_contrato_anterior := nullif(btrim(old.contrato), '');
  end if;

  for v_contrato in
    select distinct c.contrato
    from unnest(array[v_contrato_novo, v_contrato_anterior]) as c(contrato)
    where c.contrato is not null
  loop
    update public.atividades a
    set
      is_revisita = false,
      ofensor_revisita = null
    where nullif(btrim(a.contrato), '') = v_contrato
      and lower(btrim(coalesce(a.tipo_atividade, ''))) in (
        'instalação',
        'instalacao'
      )
      and (
        a.is_revisita is distinct from false
        or a.ofensor_revisita is not null
      );

    with retornos as (
      select
        a.id,
        a.data_atividade,
        a.tecnico_referencia
      from public.atividades a
      where nullif(btrim(a.contrato), '') = v_contrato
        and lower(btrim(coalesce(a.tipo_atividade, ''))) = 'retorno credenciada'
    ),
    resultado as (
      select
        r.id,
        true as novo_is_revisita,
        coalesce(
          nullif(btrim(anterior.recurso), ''),
          nullif(btrim(r.tecnico_referencia), '')
        ) as novo_ofensor_revisita
      from retornos r
      left join lateral (
        select
          p.id,
          p.recurso
        from public.atividades p
        where nullif(btrim(p.contrato), '') = v_contrato
          and p.id <> r.id
          and p.data_atividade is not null
          and r.data_atividade is not null
          and p.data_atividade < r.data_atividade
          and p.data_atividade >= r.data_atividade - 30
          and lower(btrim(coalesce(p.tipo_atividade, ''))) in (
            'instalação',
            'instalacao',
            'retorno credenciada'
          )
        order by
          p.data_atividade desc,
          p.created_at desc nulls last,
          p.id desc
        limit 1
      ) anterior on true
    )
    update public.atividades a
    set
      is_revisita = r.novo_is_revisita,
      ofensor_revisita = r.novo_ofensor_revisita
    from resultado r
    where a.id = r.id
      and (
        a.is_revisita is distinct from r.novo_is_revisita
        or a.ofensor_revisita is distinct from r.novo_ofensor_revisita
      );

    -- Regra original de Visita Tecnica, mantida sem alteracao.
    with visitas as (
      select
        a.id,
        a.data_atividade::date as data_atividade,
        a.recurso,
        (
          lower(btrim(coalesce(a.status_atividade, ''))) in (
            'concluído',
            'concluido',
            'não concluído',
            'nao concluido'
          )
          and a.data_atividade is not null
        ) as atividade_valida
      from public.atividades a
      where nullif(btrim(a.contrato), '') = v_contrato
        and lower(btrim(coalesce(a.tipo_atividade, ''))) in (
          'visita tecnica',
          'visita técnica',
          'vt cump especial'
        )
    ),
    resultado as (
      select
        b.id,
        (
          b.atividade_valida
          and exists (
            select 1
            from visitas nx
            where nx.atividade_valida = true
              and nx.id <> b.id
              and nx.data_atividade > b.data_atividade
              and nx.data_atividade <= b.data_atividade + 9
          )
        ) as novo_is_revisita,
        b.recurso
      from visitas b
    )
    update public.atividades a
    set
      is_revisita = r.novo_is_revisita,
      ofensor_revisita = case
        when r.novo_is_revisita then r.recurso
        else null
      end
    from resultado r
    where a.id = r.id
      and (
        a.is_revisita is distinct from r.novo_is_revisita
        or a.ofensor_revisita is distinct from case
          when r.novo_is_revisita then r.recurso
          else null
        end
      );

    update public.atividades a
    set
      is_revisita = false,
      ofensor_revisita = null
    where nullif(btrim(a.contrato), '') = v_contrato
      and lower(btrim(coalesce(a.tipo_atividade, ''))) not in (
        'instalação',
        'instalacao',
        'retorno credenciada',
        'visita tecnica',
        'visita técnica',
        'vt cump especial'
      )
      and (
        a.is_revisita is distinct from false
        or a.ofensor_revisita is not null
      );
  end loop;

  return new;
end;
$$;

-- Backfill apenas dos Retornos Credenciada. Todos ficam marcados; a busca
-- lateral existe somente para escolher corretamente o tecnico ofensor.
with retornos as (
  select
    a.id,
    nullif(btrim(a.contrato), '') as contrato_normalizado,
    a.data_atividade,
    a.tecnico_referencia
  from public.atividades a
  where lower(btrim(coalesce(a.tipo_atividade, ''))) = 'retorno credenciada'
),
resultado as (
  select
    r.id,
    coalesce(
      nullif(btrim(anterior.recurso), ''),
      nullif(btrim(r.tecnico_referencia), '')
    ) as novo_ofensor_revisita
  from retornos r
  left join lateral (
    select
      p.id,
      p.recurso
    from public.atividades p
    where r.contrato_normalizado is not null
      and nullif(btrim(p.contrato), '') = r.contrato_normalizado
      and p.id <> r.id
      and p.data_atividade is not null
      and r.data_atividade is not null
      and p.data_atividade < r.data_atividade
      and p.data_atividade >= r.data_atividade - 30
      and lower(btrim(coalesce(p.tipo_atividade, ''))) in (
        'instalação',
        'instalacao',
        'retorno credenciada'
      )
    order by
      p.data_atividade desc,
      p.created_at desc nulls last,
      p.id desc
    limit 1
  ) anterior on true
)
update public.atividades a
set
  is_revisita = true,
  ofensor_revisita = r.novo_ofensor_revisita
from resultado r
where a.id = r.id
  and (
    a.is_revisita is distinct from true
    or a.ofensor_revisita is distinct from r.novo_ofensor_revisita
  );

create trigger trg_calc_revisita
after insert or update of
  contrato,
  data_atividade,
  status_atividade,
  tipo_atividade,
  recurso,
  tecnico_referencia
on public.atividades
for each row
execute function public.fn_calc_revisita();

comment on function public.fn_calc_revisita() is
'Preserva a regra de Visita Tecnica e marca todo Retorno Credenciada como revisita, atribuindo o tecnico anterior ou tecnico_referencia.';

-- Validacao depois da execucao:
-- select
--   count(*) filter (where tipo_atividade = 'Retorno Credenciada') as retornos,
--   count(*) filter (
--     where tipo_atividade = 'Retorno Credenciada'
--       and is_revisita = true
--   ) as retornos_marcados,
--   count(*) filter (
--     where tipo_atividade = 'Retorno Credenciada'
--       and is_revisita = true
--       and nullif(btrim(ofensor_revisita), '') is null
--   ) as retornos_sem_ofensor
-- from public.atividades
-- where data_atividade between date '2026-08-01' and date '2026-08-11'
--   and cidade in ('NATAL', 'PARNAMIRIM');
