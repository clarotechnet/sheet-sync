-- O dashboard de atividades e acessivel somente depois que o usuario passa
-- pela aprovacao do administrador. As mesmas regras abaixo protegem a leitura
-- e preservam o upsert da importacao (SELECT + INSERT + UPDATE).

alter table public.atividades enable row level security;

grant select, insert, update on table public.atividades to authenticated;

drop policy if exists atividades_aprovados_select
on public.atividades;

create policy atividades_aprovados_select
on public.atividades
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
  )
);

drop policy if exists atividades_aprovados_insert
on public.atividades;

create policy atividades_aprovados_insert
on public.atividades
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
  )
);

drop policy if exists atividades_aprovados_update
on public.atividades;

create policy atividades_aprovados_update
on public.atividades
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
  )
);
