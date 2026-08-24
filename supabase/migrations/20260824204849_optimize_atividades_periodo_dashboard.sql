-- Atende o filtro inicial e a paginacao do dashboard por periodo.
-- Use CREATE INDEX normal porque o SQL Editor executa dentro de transacao.
-- Execute sem uma importacao em andamento para evitar bloquear escritas.

create index if not exists atividades_dashboard_periodo_idx
on public.atividades (data_atividade desc, id desc);
