-- The profile is the source of truth for approval and administrator access.
-- This private, identity-bound lookup avoids recursive RLS on profiles.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_approved_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.approved = true
  );
$$;

revoke all on function private.is_approved_admin() from public, anon, authenticated;
grant execute on function private.is_approved_admin() to authenticated;

alter table public.profiles enable row level security;

drop policy if exists profiles_admin_select_all on public.profiles;
create policy profiles_admin_select_all
on public.profiles for select to authenticated
using ((select private.is_approved_admin()));

drop policy if exists profiles_admin_update_all on public.profiles;
create policy profiles_admin_update_all
on public.profiles for update to authenticated
using ((select private.is_approved_admin()))
with check ((select private.is_approved_admin()));

-- Keep self-service profile edits without allowing self-promotion or approval.
create or replace function private.guard_profile_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.id is distinct from old.id then
      raise exception 'O identificador do usuario nao pode ser alterado.' using errcode = '42501';
    end if;

    if (new.role is distinct from old.role
        or new.approved is distinct from old.approved
        or new.approved_at is distinct from old.approved_at
        or new.created_at is distinct from old.created_at)
       and not private.is_approved_admin() then
      raise exception 'Apenas administradores aprovados podem alterar permissoes.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_permissions() from public, anon, authenticated;
drop trigger if exists guard_profile_permissions on public.profiles;
create trigger guard_profile_permissions
before update on public.profiles
for each row execute function private.guard_profile_permissions();

-- Verify real authenticated RLS with token claims that have no admin role.
-- Every test update is rolled back inside the exception block.
do $$
declare
  admin_id uuid;
  member_id uuid;
  total_profiles integer;
  visible_profiles integer;
  affected integer;
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select count(*) into total_profiles from public.profiles;
  select id into member_id from public.profiles where role = 'user' limit 1;

  for admin_id in select id from public.profiles where role = 'admin' and approved loop
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated', 'app_metadata', json_build_object())::text, true);
    execute 'set local role authenticated';
    select count(*) into visible_profiles from public.profiles;
    if visible_profiles <> total_profiles or not private.is_approved_admin() then
      raise exception 'Administrator RLS verification failed';
    end if;

    if member_id is not null then
      begin
        update public.profiles set approved = false, approved_at = null where id = member_id;
        get diagnostics affected = row_count;
        if affected <> 1 then raise exception 'Revoke verification failed'; end if;
        update public.profiles set approved = true, approved_at = now() where id = member_id;
        get diagnostics affected = row_count;
        if affected <> 1 then raise exception 'Approval verification failed'; end if;
        update public.profiles set role = 'admin' where id = member_id;
        get diagnostics affected = row_count;
        if affected <> 1 then raise exception 'Promotion verification failed'; end if;
        raise exception using errcode = 'PT001', message = 'Rollback permission test';
      exception when sqlstate 'PT001' then null;
      end;
    end if;
    execute 'reset role';
  end loop;

  if member_id is not null then
    -- An outdated admin claim must not grant a regular member admin access.
    perform set_config('request.jwt.claim.sub', member_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated', 'app_metadata', json_build_object('role', 'admin'))::text, true);
    execute 'set local role authenticated';
    select count(*) into visible_profiles from public.profiles;
    if visible_profiles <> 1 or private.is_approved_admin() then
      raise exception 'Member read isolation verification failed';
    end if;
    begin
      update public.profiles set role = 'admin' where id = member_id;
      raise exception 'Self-promotion was not blocked';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.profiles set approved = not approved where id = member_id;
      raise exception 'Self-approval was not blocked';
    exception when insufficient_privilege then null;
    end;
    update public.profiles set approved = true where id <> member_id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Member write isolation verification failed'; end if;
    execute 'reset role';
  end if;

  perform set_config('request.jwt.claims', coalesce(saved_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true);
end;
$$;
