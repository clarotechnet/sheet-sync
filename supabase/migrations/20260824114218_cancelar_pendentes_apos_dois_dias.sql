-- Cancela atividades que continuam pendentes depois de dois dias completos.
-- A idade e calculada pela data_atividade no fuso de Sao Paulo:
-- no dia 24, atividades do dia 21 ou anteriores sao canceladas; as do dia 22
-- ainda completaram somente dois dias e permanecem pendentes.

create extension if not exists pg_cron with schema pg_catalog;

create index if not exists atividades_pendentes_data_idx
on public.atividades (data_atividade, id)
where lower(btrim(coalesce(status_atividade, ''))) = 'pendente';

-- Impede que uma importacao futura restaure como pendente uma atividade antiga.
create or replace function public.fn_normalizar_pendente_vencida()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if lower(btrim(coalesce(new.status_atividade, ''))) = 'pendente'
     and new.data_atividade is not null
     and new.data_atividade < v_hoje - 2 then
    new.status_atividade := 'cancelado';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_normalizar_pendente_vencida() from public;
revoke all on function public.fn_normalizar_pendente_vencida() from anon;
revoke all on function public.fn_normalizar_pendente_vencida() from authenticated;

drop trigger if exists trg_normalizar_pendente_vencida
on public.atividades;

create trigger trg_normalizar_pendente_vencida
before insert or update of status_atividade, data_atividade
on public.atividades
for each row
execute function public.fn_normalizar_pendente_vencida();

-- A troca de pendente para cancelado nao altera o calculo de revisita: ambos
-- sao estados invalidos como atividade ofensora. Separar os triggers evita
-- recalcular todo o historico do contrato durante o cancelamento em lote.
drop trigger if exists trg_calc_revisita
on public.atividades;

drop trigger if exists trg_calc_revisita_insert
on public.atividades;

drop trigger if exists trg_calc_revisita_update
on public.atividades;

create trigger trg_calc_revisita_insert
after insert
on public.atividades
for each row
execute function public.fn_calc_revisita();

create trigger trg_calc_revisita_update
after update of
  contrato,
  data_atividade,
  status_atividade,
  tipo_atividade,
  recurso,
  tecnico_referencia
on public.atividades
for each row
when (
  old.contrato is distinct from new.contrato
  or old.data_atividade is distinct from new.data_atividade
  or old.tipo_atividade is distinct from new.tipo_atividade
  or old.recurso is distinct from new.recurso
  or old.tecnico_referencia is distinct from new.tecnico_referencia
  or (
    lower(btrim(coalesce(old.status_atividade, ''))) in (
      'concluido',
      'concluído',
      'nao concluido',
      'não concluído'
    )
  ) is distinct from (
    lower(btrim(coalesce(new.status_atividade, ''))) in (
      'concluido',
      'concluído',
      'nao concluido',
      'não concluído'
    )
  )
)
execute function public.fn_calc_revisita();

-- Processa em lotes para nao concentrar milhares de updates em uma transacao.
create or replace function public.fn_cancelar_atividades_pendentes(
  p_limite integer default 500
)
returns integer
language plpgsql
set search_path = public
set statement_timeout = '8min'
as $$
declare
  v_atualizadas integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  with pendentes_vencidas as (
    select a.id
    from public.atividades a
    where lower(btrim(coalesce(a.status_atividade, ''))) = 'pendente'
      and a.data_atividade is not null
      and a.data_atividade < v_hoje - 2
    order by a.data_atividade, a.id
    limit least(greatest(coalesce(p_limite, 500), 1), 2000)
    for update skip locked
  ),
  atualizadas as (
    update public.atividades a
    set status_atividade = 'cancelado'
    from pendentes_vencidas p
    where a.id = p.id
    returning a.id
  )
  select count(*)::integer
  into v_atualizadas
  from atualizadas;

  return v_atualizadas;
end;
$$;

revoke all on function public.fn_cancelar_atividades_pendentes(integer) from public;
revoke all on function public.fn_cancelar_atividades_pendentes(integer) from anon;
revoke all on function public.fn_cancelar_atividades_pendentes(integer) from authenticated;

-- Roda a cada cinco minutos. Enquanto houver passivo, limpa 500 linhas por
-- execucao; depois disso, normalmente o job encontra poucas ou nenhuma linha.
select cron.schedule(
  'cancelar-atividades-pendentes-apos-dois-dias',
  '*/5 * * * *',
  $cron$select public.fn_cancelar_atividades_pendentes(500);$cron$
);

comment on function public.fn_cancelar_atividades_pendentes(integer) is
'Cancela em lotes atividades pendentes cuja data_atividade passou de dois dias completos no fuso America/Sao_Paulo.';

-- Validacao depois de aplicar a migration:
-- select status_atividade, data_atividade, count(*)
-- from public.atividades
-- where lower(btrim(coalesce(status_atividade, ''))) = 'pendente'
--   and data_atividade < (now() at time zone 'America/Sao_Paulo')::date - 2
-- group by status_atividade, data_atividade
-- order by data_atividade;
--
-- Historico do job:
-- select status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid = (
--   select jobid
--   from cron.job
--   where jobname = 'cancelar-atividades-pendentes-apos-dois-dias'
-- )
-- order by start_time desc
-- limit 20;
