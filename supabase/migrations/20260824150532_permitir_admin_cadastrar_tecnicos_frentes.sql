-- O modulo de Comissionamento e exclusivo de administradores. Estas policies
-- permitem listar e cadastrar colaboradores sem liberar a tabela para outros
-- usuarios autenticados.

alter table public.tecnicos_frentes enable row level security;

grant select, insert on table public.tecnicos_frentes to authenticated;

-- Funciona tanto para id UUID quanto para id serial/identity.
do $$
declare
  v_id_sequence regclass := to_regclass(
    pg_get_serial_sequence('public.tecnicos_frentes', 'id')
  );
begin
  if v_id_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to authenticated',
      v_id_sequence
    );
  end if;
end;
$$;

drop policy if exists tecnicos_frentes_admin_select
on public.tecnicos_frentes;

create policy tecnicos_frentes_admin_select
on public.tecnicos_frentes
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
);

drop policy if exists tecnicos_frentes_admin_insert
on public.tecnicos_frentes;

create policy tecnicos_frentes_admin_insert
on public.tecnicos_frentes
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
