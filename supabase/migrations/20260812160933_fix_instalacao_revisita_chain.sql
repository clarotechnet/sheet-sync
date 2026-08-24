-- Corrige somente a cadeia de revisitas da frente de instalacao.
--
-- Regra:
--   * a linha atual de "Retorno Credenciada" e a revisita;
--   * a referencia e a atividade imediatamente anterior do mesmo contrato;
--   * a atividade anterior pode ser "Instalacao" ou "Retorno Credenciada";
--   * todo "Retorno Credenciada" e uma revisita;
--   * o intervalo de 1 a 30 dias localiza a atividade anterior;
--   * ofensor_revisita recebe o recurso da atividade anterior ou, quando o
--     historico nao esta no banco, o tecnico_referencia calculado no registro;
--   * um retorno pode ser a referencia do proximo retorno da cadeia.
--
-- A regra existente de Visita Tecnica e preservada: a atividade anterior
-- continua sendo marcada quando houver outra Visita Tecnica em ate 9 dias.
--
-- Execute fora do horario de importacao. O SQL Editor do Supabase executa a
-- consulta dentro de uma transacao, por isso os indices nao usam CONCURRENTLY.

set local statement_timeout = '0';

-- Este indice tambem atende fn_calc_log_atividades e evita varrer a tabela
-- inteira ao procurar o historico de um contrato.
create index if not exists atividades_fn_calc_log_lookup_idx
on public.atividades (
  (nullif(btrim(contrato), '')),
  data_atividade desc,
  created_at desc,
  id desc
)
include (contador_log, recurso)
where nullif(btrim(contrato), '') is not null;

-- O trigger fica desligado durante o backfill para que cada linha atualizada
-- nao provoque um novo recalculo do contrato inteiro.
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

  -- Em uma alteracao de contrato, recalcula tanto o contrato novo quanto o
  -- anterior para nao deixar classificacoes antigas gravadas.
  for v_contrato in
    select distinct c.contrato
    from unnest(array[v_contrato_novo, v_contrato_anterior]) as c(contrato)
    where c.contrato is not null
  loop
    -- Instalacao e somente a origem da cadeia; ela nao e o evento de revisita.
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

    -- Marca o Retorno Credenciada atual e aponta para o tecnico da atividade
    -- imediatamente anterior da cadeia de instalacao.
    with retornos as (
      select
        a.id,
        a.contrato,
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
          and lower(btrim(coalesce(p.status_atividade, ''))) in (
            'concluído',
            'concluido',
            'não concluído',
            'nao concluido'
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

    -- Mantem a regra anterior de Visita Tecnica sem alterar sua semantica.
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

    -- Evita flags antigas caso uma atividade deixe de pertencer a uma das
    -- categorias calculadas pela funcao.
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

-- Backfill da cadeia de instalacao. Visita Tecnica nao e atualizada aqui.
update public.atividades a
set
  is_revisita = false,
  ofensor_revisita = null
where lower(btrim(coalesce(a.tipo_atividade, ''))) in (
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
    nullif(btrim(a.contrato), '') as contrato_normalizado,
    a.data_atividade,
    a.tecnico_referencia
  from public.atividades a
  where lower(btrim(coalesce(a.tipo_atividade, ''))) = 'retorno credenciada'
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
      and lower(btrim(coalesce(p.status_atividade, ''))) in (
        'concluído',
        'concluido',
        'não concluído',
        'nao concluido'
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
'Calcula revisitas: preserva Visita Tecnica, marca todo Retorno Credenciada e atribui o tecnico anterior da cadeia de instalacao quando disponivel.';

-- Validacao sugerida depois da execucao:
--
-- select
--   contrato,
--   data_atividade,
--   tipo_atividade,
--   recurso,
--   is_revisita,
--   ofensor_revisita
-- from public.atividades
-- where contrato in ('4241615', '4244185')
-- order by contrato, data_atividade, created_at, id;
