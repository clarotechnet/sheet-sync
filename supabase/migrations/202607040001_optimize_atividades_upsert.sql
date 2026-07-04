-- Otimiza o upsert diario de public.atividades e a busca usada por
-- public.fn_calc_log_atividades().
--
-- Esta versao usa CREATE INDEX normal para rodar no SQL Editor do Supabase,
-- que executa a query dentro de uma transacao. Evite rodar durante importacao,
-- porque a criacao dos indices pode bloquear escritas temporariamente.
--
-- Antes de rodar o indice unico, confira se ja existem duplicados:
--
-- select numero_os1, numero_os, contrato, data_atividade, count(*)
-- from public.atividades
-- group by 1, 2, 3, 4
-- having count(*) > 1
-- order by count(*) desc;
--
-- Confira tambem chaves incompletas:
--
-- select id, numero_os1, numero_os, contrato, data_atividade
-- from public.atividades
-- where nullif(btrim(numero_os1), '') is null
--    or nullif(btrim(numero_os), '') is null
--    or nullif(btrim(contrato), '') is null
--    or data_atividade is null;
--
-- Se houver duplicados, limpe primeiro mantendo o registro mais recente:
--
-- with ranked as (
--   select
--     id,
--     row_number() over (
--       partition by numero_os1, numero_os, contrato, data_atividade
--       order by coalesce(created_at, data_atividade::timestamp) desc, id desc
--     ) as rn
--   from public.atividades
-- )
-- delete from public.atividades a
-- using ranked r
-- where a.id = r.id
--   and r.rn > 1;

create unique index if not exists atividades_servico_dia_uidx
on public.atividades (numero_os1, numero_os, contrato, data_atividade);

-- Nao usar coalesce(created_at, data_atividade::timestamp) no indice:
-- essa conversao pode falhar com 42P17 porque nao e IMMUTABLE.
create index if not exists atividades_fn_calc_log_lookup_idx
on public.atividades (
  (nullif(btrim(contrato), '')),
  data_atividade desc,
  created_at desc,
  id desc
)
include (contador_log, recurso)
where nullif(btrim(contrato), '') is not null;
