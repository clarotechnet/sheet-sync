-- Existing administrator-only write policies protect visibility status too.
alter table public.ranking_tecnicos add column ativo boolean not null default true;
