-- Endurecimento de autorização sem depender das proteções visuais do React.
-- A Data API continua usando a anon key; a autorização real fica no RLS.

-- 1) Atividades: usuários aprovados podem ler; somente admins aprovados escrevem.
alter table public.atividades enable row level security;
grant select, insert, update on table public.atividades to authenticated;

drop policy if exists atividades_aprovados_select on public.atividades;
create policy atividades_aprovados_select
on public.atividades
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
  )
);

drop policy if exists atividades_aprovados_insert on public.atividades;
drop policy if exists atividades_admin_insert on public.atividades;
create policy atividades_admin_insert
on public.atividades
for insert
to authenticated
with check ((select private.is_approved_admin()));

drop policy if exists atividades_aprovados_update on public.atividades;
drop policy if exists atividades_admin_update on public.atividades;
create policy atividades_admin_update
on public.atividades
for update
to authenticated
using ((select private.is_approved_admin()))
with check ((select private.is_approved_admin()));

-- 2) Profiles: criação vem do trigger de auth; clientes não inserem perfis diretamente.
-- Mantém explicitamente a administração de usuários: admin aprovado enxerga e altera todos os perfis.
revoke insert, delete on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all
on public.profiles
for select
to authenticated
using ((select private.is_approved_admin()));

drop policy if exists profiles_admin_update_all on public.profiles;
create policy profiles_admin_update_all
on public.profiles
for update
to authenticated
using ((select private.is_approved_admin()))
with check ((select private.is_approved_admin()));

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    role,
    approved,
    approved_at
  )
  values (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    'user',
    false,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

alter function private.handle_new_auth_user() owner to postgres;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_sheet_sync on auth.users;
create trigger on_auth_user_created_sheet_sync
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- 3) Comissionamento: a tela já é admin-only; o banco passa a impor a mesma regra.
-- A tabela é legada e não possui migration de criação neste repositório, então o bloco
-- só atua quando ela já existe (como no banco atual).
do $migration$
begin
  if to_regclass('public.comissionamento') is not null then
    execute 'alter table public.comissionamento enable row level security';
    execute 'revoke all on table public.comissionamento from anon';
    execute 'grant select, insert, update, delete on table public.comissionamento to authenticated';
    execute 'drop policy if exists comissionamento_admin_all on public.comissionamento';
    execute $policy$
      create policy comissionamento_admin_all
      on public.comissionamento
      for all
      to authenticated
      using ((select private.is_approved_admin()))
      with check ((select private.is_approved_admin()))
    $policy$;
  end if;
end;
$migration$;
