-- Run only on a disposable local PostgreSQL cluster, never on a Supabase project.
-- psql -h 127.0.0.1 -p 55459 -U postgres -d gatilhos_closure_test -v ON_ERROR_STOP=1 -f tests/gatilhosClosure.sql
do $$ begin
  if current_database() <> 'gatilhos_closure_test' or current_setting('port') <> '55459' then
    raise exception 'This fixture requires the isolated gatilhos_closure_test database on port 55459.';
  end if;
end $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated;
create table public.profiles(id uuid primary key, approved boolean, role text);
create table public.colaboradores_cadastrados(id uuid primary key default gen_random_uuid(), nome text, cpf text, setor text);
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.colaboradores_cadastrados to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002'), ('00000000-0000-0000-0000-000000000003');
insert into public.profiles values
 ('00000000-0000-0000-0000-000000000001', true, 'admin'),
 ('00000000-0000-0000-0000-000000000002', true, 'user'),
 ('00000000-0000-0000-0000-000000000003', false, 'admin');
\ir ../supabase/migrations/20260904130440_create_gatilhos_module.sql
\ir ../supabase/migrations/20261002154700_preserve_gatilhos_periods_and_score_adjustments.sql
\ir ../supabase/migrations/20261105115011_freeze_gatilhos_closed_periods.sql

-- These helpers run as the caller so permission failures are tested, not bypassed.
create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if; end $$;
create function public.test_rejected(command text, expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'Expected %, got %: %', expected, sqlstate, sqlerrm;
  end;
  raise exception 'Expected rejection: %', command;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.colaboradores_cadastrados values
 ('10000000-0000-0000-0000-000000000001', 'TECNICO ORIGINAL', '00000000191', 'INSTALACAO'),
 ('10000000-0000-0000-0000-000000000002', 'AUXILIAR ORIGINAL', '00000000272', 'AUXILIAR');
select public.substituir_gatilhos_resultados('[{"id_externo":"100","valor":8543.19}]', '2026-10-01', '2026-10-31', 'outubro.xlsx');
select public.substituir_gatilhos_resultados('[{"id_externo":"100","valor":8543.19}]', '2026-11-01', '2026-11-30', 'novembro.xlsx');
select public.salvar_gatilho_vinculo('100', 'RECIFE', 'DUPLA', array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']::uuid[]);
select public.ajustar_gatilho_pontuacao('100', '2026-10-01', 9000, 'Reconhecimento');
select public.test_assert((select count(*) = 0 from public.gatilhos_fechamentos), 'No automatic closing');
select public.fechar_periodo_gatilhos('2026-10-01');
select public.test_assert((select count(*) = 1 from public.gatilhos_resultados_fechados), 'One snapshot row');
select public.test_assert((select resultado->>'tipo' = 'DUPLA' and (resultado->>'premio')::numeric = 400 and (resultado->>'pontuacao')::numeric = 9000 and jsonb_array_length(vinculos) = 2 from public.gatilhos_resultados_fechados), 'Duo and adjusted prize frozen');
create temporary table before_close as select * from public.gatilhos_resultados_fechados;
create temporary table before_meta as select * from public.gatilhos_fechamentos;

select public.salvar_gatilho_vinculo('100', 'FORTALEZA', 'INDIVIDUAL_CARRO', array['10000000-0000-0000-0000-000000000001']::uuid[]);
update public.colaboradores_cadastrados set nome = 'NOME NOVO', cpf = '11111111111', setor = 'SETOR NOVO';
update public.gatilhos_faixas set premio = 999;
select public.ajustar_gatilho_pontuacao('100', '2026-11-01', 10000, 'Novo periodo');
select public.substituir_gatilhos_resultados('[{"id_externo":"100","valor":9999}]', '2026-11-01', '2026-11-30', 'novo.xlsx');
select public.fechar_periodo_gatilhos('2026-10-01');
select public.test_assert(not exists ((select * from before_close) except (select * from public.gatilhos_resultados_fechados)), 'Closed snapshot never follows live configuration');
select public.test_assert(not exists ((select * from before_meta) except (select * from public.gatilhos_fechamentos)), 'Repeated closure is idempotent');
select public.test_assert((select vinculos->0->'colaborador'->>'nome' = 'TECNICO ORIGINAL' and vinculos->0->'colaborador'->>'cpf' = '00000000191' and vinculos->1->'colaborador'->>'setor' = 'AUXILIAR' from public.gatilhos_resultados_fechados), 'Report identity stays original');
select public.test_assert((select valor = 9999 and valor_ajustado = 10000 from public.gatilhos_resultados where periodo_inicio = '2026-11-01'), 'New period remains editable');

select public.test_rejected($q$select public.ajustar_gatilho_pontuacao('100', '2026-10-01', 99999, 'No')$q$, '55000');
select public.test_rejected($q$select public.substituir_gatilhos_resultados('[{"id_externo":"100","valor":1}]', '2026-10-01', '2026-10-31', 'no.xlsx')$q$, '55000');
select public.test_rejected($q$select public.substituir_gatilhos_resultados('[{"id_externo":"NEW","valor":1}]', '2026-10-01', '2026-10-31', 'no.xlsx')$q$, '55000');
select public.test_rejected($q$delete from public.gatilhos_resultados where periodo_inicio = '2026-10-01'$q$, '55000');
select public.test_rejected($q$update public.gatilhos_resultados set periodo_inicio = '2026-09-01' where periodo_inicio = '2026-10-01'$q$, '55000');
select public.test_rejected($q$update public.gatilhos_resultados set periodo_inicio = '2026-10-01' where periodo_inicio = '2026-11-01'$q$, '55000');
select public.test_rejected($q$update public.gatilhos_resultados_fechados set resultado = '{}'::jsonb$q$, '42501');
select public.test_rejected($q$insert into public.gatilhos_resultados_fechados select * from public.gatilhos_resultados_fechados$q$, '42501');
select public.test_rejected($q$delete from public.gatilhos_fechamentos$q$, '42501');
select public.test_rejected($q$select public.fechar_periodo_gatilhos(null)$q$, '22007');
select public.test_rejected($q$select public.fechar_periodo_gatilhos('2025-01-01')$q$, 'P0002');
select public.test_assert((select count(*) = 1 from public.gatilhos_fechamentos), 'Failed close has no partial records');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.test_rejected($q$select public.fechar_periodo_gatilhos('2026-11-01')$q$, '42501');
select public.test_assert((select count(*) = 0 from public.gatilhos_fechamentos), 'Non-admin cannot read snapshots');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_rejected($q$select public.fechar_periodo_gatilhos('2026-11-01')$q$, '42501');
reset role;
set role anon;
select public.test_rejected($q$select public.fechar_periodo_gatilhos('2026-11-01')$q$, '42501');
reset role;
set role service_role;
select public.test_rejected($q$delete from public.gatilhos_fechamentos$q$, '42501');
select public.test_rejected($q$select public.fechar_periodo_gatilhos('2026-11-01')$q$, '42501');
reset role;
select public.test_rejected('truncate public.gatilhos_resultados', '55000');
select public.test_rejected('truncate public.gatilhos_resultados_fechados', '55000');
select public.test_rejected('update public.gatilhos_fechamentos set total_ids = 0', '55000');
select public.test_rejected('delete from public.gatilhos_resultados_fechados', '55000');
select public.test_assert(not has_function_privilege('anon', 'public.fechar_periodo_gatilhos(date)', 'execute'), 'No anonymous close privilege');
select 'All gatilhos closure SQL assertions passed' as result;
