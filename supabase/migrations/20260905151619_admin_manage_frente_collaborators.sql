grant insert on public.tecnicos_frentes to authenticated;
grant update (nome, frente) on public.tecnicos_frentes to authenticated;

-- Keep creation subject to the existing approved-admin insert policy.
drop policy if exists "Authenticated users can insert tecnicos_frentes"
on public.tecnicos_frentes;

-- Verify creation and name/front edits without retaining any test records.
do $$
declare
  admin_id uuid;
  member_id uuid;
  test_id uuid := gen_random_uuid();
  test_name text := '__frente_verification_' || test_id::text;
  sample_front text;
  sample_city text;
  affected integer;
  saved_claims text := current_setting('request.jwt.claims', true);
  saved_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select id into admin_id from public.profiles where role = 'admin' and approved limit 1;
  select id into member_id from public.profiles where role = 'user' limit 1;
  select frente, cidade into sample_front, sample_city from public.tecnicos_frentes limit 1;
  if admin_id is not null and sample_front is not null then
    perform set_config('request.jwt.claim.sub', admin_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.tecnicos_frentes (id, nome, cidade, frente)
      values (test_id, test_name, sample_city, sample_front);
      update public.tecnicos_frentes set nome = test_name || '_edited', frente = sample_front
      where id = test_id and nome = test_name and frente = sample_front;
      get diagnostics affected = row_count;
      if affected <> 1 or (select nome from public.tecnicos_frentes where id = test_id) <> test_name || '_edited' then
        raise exception 'Administrator create/edit verification failed';
      end if;
      update public.tecnicos_frentes set nome = test_name where id = test_id and nome = test_name;
      get diagnostics affected = row_count;
      if affected <> 0 then raise exception 'Stale edit verification failed'; end if;
      raise exception using errcode = 'PT001', message = 'Rollback collaborator test';
    exception when sqlstate 'PT001' then null;
    end;
    execute 'reset role';
  end if;
  if member_id is not null and sample_front is not null then
    perform set_config('request.jwt.claim.sub', member_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', member_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.tecnicos_frentes (id, nome, cidade, frente)
      values (test_id, test_name, sample_city, sample_front);
      raise exception 'Member insert was not blocked';
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end if;
  perform set_config('request.jwt.claims', coalesce(saved_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(saved_sub, ''), true);
end;
$$;
