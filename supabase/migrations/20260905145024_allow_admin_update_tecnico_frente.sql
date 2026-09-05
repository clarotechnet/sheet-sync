alter table public.tecnicos_frentes enable row level security;
grant update (frente) on public.tecnicos_frentes to authenticated;

drop policy if exists "Authenticated users can update tecnicos_frentes" on public.tecnicos_frentes;
drop policy if exists tecnicos_frentes_admin_update on public.tecnicos_frentes;
create policy tecnicos_frentes_admin_update
on public.tecnicos_frentes for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.approved = true and p.role = 'admin'
  )
);

-- Exercise the new policy; roll back the test change before completing.
do $$
declare
  admin_id uuid;
  member_id uuid;
  technician_id uuid;
  original_front text;
  new_front text;
  affected integer;
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select id into admin_id from public.profiles where role = 'admin' and approved limit 1;
  select id into member_id from public.profiles where role = 'user' limit 1;
  select id, frente into technician_id, original_front from public.tecnicos_frentes limit 1;
  select frente into new_front from public.tecnicos_frentes where frente <> original_front limit 1;

  if admin_id is not null and technician_id is not null and new_front is not null then
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.tecnicos_frentes set frente = new_front where id = technician_id and frente = original_front;
      get diagnostics affected = row_count;
      if affected <> 1 or (select frente from public.tecnicos_frentes where id = technician_id) <> new_front then
        raise exception 'Administrator front update verification failed';
      end if;
      raise exception using errcode = 'PT001', message = 'Rollback front test';
    exception when sqlstate 'PT001' then null;
    end;
    execute 'reset role';
  end if;

  if member_id is not null and technician_id is not null then
    perform set_config('request.jwt.claim.sub', member_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    update public.tecnicos_frentes set frente = original_front where id = technician_id;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Member front update isolation failed'; end if;
    execute 'reset role';
  end if;
  perform set_config('request.jwt.claims', coalesce(saved_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true);
end;
$$;
