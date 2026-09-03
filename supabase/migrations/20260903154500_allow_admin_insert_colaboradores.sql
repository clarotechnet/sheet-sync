grant insert on table public.colaboradores_cadastrados to authenticated;

drop policy if exists colaboradores_cadastrados_admin_insert
on public.colaboradores_cadastrados;

create policy colaboradores_cadastrados_admin_insert
on public.colaboradores_cadastrados
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
);
