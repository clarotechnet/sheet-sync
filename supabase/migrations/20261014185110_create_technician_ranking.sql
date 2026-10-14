-- Dedicated ranking tables; existing operational activities are not changed.
create table public.ranking_tecnicos (
  id uuid primary key default gen_random_uuid(),
  login text not null unique check (login = upper(btrim(login)) and login <> '' and login !~ '[[:space:]]'),
  nome text not null check (btrim(nome) <> ''),
  cidade text not null check (btrim(cidade) <> ''),
  supervisor text not null check (btrim(supervisor) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table public.ranking_tecnico_atividades (
  id_atividade text primary key check (btrim(id_atividade) <> ''),
  data_atividade date not null check (data_atividade >= date '1900-01-01'),
  login_tecnico text,
  concluiu_atividade text,
  recurso text not null default '',
  contrato text,
  numero_wo text,
  cidade text,
  status_atividade text not null default '',
  tipo_atividade text not null default '',
  codigos_baixa jsonb not null default '[]'::jsonb check (jsonb_typeof(codigos_baixa) = 'array'),
  credenciada_anterior text,
  arquivo_nome text,
  importado_em timestamptz not null default now(),
  importado_por uuid default auth.uid()
);

create index ranking_tecnico_atividades_periodo_idx on public.ranking_tecnico_atividades (data_atividade, id_atividade);
create index ranking_tecnico_atividades_login_idx on public.ranking_tecnico_atividades (login_tecnico, data_atividade);
create index ranking_tecnicos_supervisor_idx on public.ranking_tecnicos (supervisor, cidade);

alter table public.ranking_tecnicos enable row level security;
alter table public.ranking_tecnico_atividades enable row level security;
revoke all on public.ranking_tecnicos, public.ranking_tecnico_atividades from public, anon, authenticated;
grant select, insert, update, delete on public.ranking_tecnicos, public.ranking_tecnico_atividades to authenticated;

create policy ranking_tecnicos_read on public.ranking_tecnicos for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved = true));
create policy ranking_tecnicos_admin on public.ranking_tecnicos for all to authenticated
using ((select private.is_approved_admin())) with check ((select private.is_approved_admin()));
create policy ranking_tecnico_atividades_read on public.ranking_tecnico_atividades for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved = true));
create policy ranking_tecnico_atividades_admin on public.ranking_tecnico_atividades for all to authenticated
using ((select private.is_approved_admin())) with check ((select private.is_approved_admin()));

create function private.touch_ranking_tecnico()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
create trigger ranking_tecnicos_updated before update on public.ranking_tecnicos
for each row execute function private.touch_ranking_tecnico();

create function public.importar_ranking_tecnicos(p_dados jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_total integer;
begin
  if not (select private.is_approved_admin()) then
    raise exception 'Apenas administradores aprovados podem importar cadastros.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'array' or jsonb_array_length(p_dados) = 0 or jsonb_array_length(p_dados) > 5000 then
    raise exception 'Envie entre 1 e 5000 cadastros.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_dados) as item(login text) group by upper(btrim(item.login)) having count(*) > 1) then
    raise exception 'O arquivo contém logins repetidos.' using errcode = '22023';
  end if;
  insert into public.ranking_tecnicos (login, nome, cidade, supervisor)
  select upper(btrim(item.login)), btrim(item.nome), btrim(item.cidade), btrim(item.supervisor)
  from jsonb_to_recordset(p_dados) as item(login text, nome text, cidade text, supervisor text)
  on conflict (login) do update set nome = excluded.nome, cidade = excluded.cidade, supervisor = excluded.supervisor;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create function public.importar_ranking_tecnico_atividades(p_dados jsonb, p_arquivo_nome text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_total integer;
begin
  if not (select private.is_approved_admin()) then
    raise exception 'Apenas administradores aprovados podem importar atividades.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'array' or jsonb_array_length(p_dados) = 0 or jsonb_array_length(p_dados) > 20000 then
    raise exception 'Envie entre 1 e 20000 atividades por arquivo.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_dados) as item(id_atividade text) group by btrim(item.id_atividade) having count(*) > 1) then
    raise exception 'O arquivo contém IDs de atividade repetidos.' using errcode = '22023';
  end if;
  insert into public.ranking_tecnico_atividades (
    id_atividade, data_atividade, login_tecnico, concluiu_atividade, recurso, contrato, numero_wo,
    cidade, status_atividade, tipo_atividade, codigos_baixa, credenciada_anterior, arquivo_nome, importado_em, importado_por
  )
  select btrim(item.id_atividade), item.data_atividade, nullif(upper(btrim(item.login_tecnico)), ''),
    nullif(upper(btrim(item.concluiu_atividade)), ''), coalesce(btrim(item.recurso), ''), nullif(btrim(item.contrato), ''),
    nullif(btrim(item.numero_wo), ''), nullif(btrim(item.cidade), ''), coalesce(btrim(item.status_atividade), ''),
    coalesce(btrim(item.tipo_atividade), ''), coalesce(item.codigos_baixa, '[]'::jsonb), nullif(btrim(item.credenciada_anterior), ''),
    nullif(btrim(p_arquivo_nome), ''), now(), (select auth.uid())
  from jsonb_to_recordset(p_dados) as item(
    id_atividade text, data_atividade date, login_tecnico text, concluiu_atividade text, recurso text,
    contrato text, numero_wo text, cidade text, status_atividade text, tipo_atividade text, codigos_baixa jsonb, credenciada_anterior text
  )
  on conflict (id_atividade) do update set data_atividade = excluded.data_atividade, login_tecnico = excluded.login_tecnico,
    concluiu_atividade = excluded.concluiu_atividade, recurso = excluded.recurso, contrato = excluded.contrato,
    numero_wo = excluded.numero_wo, cidade = excluded.cidade, status_atividade = excluded.status_atividade,
    tipo_atividade = excluded.tipo_atividade, codigos_baixa = excluded.codigos_baixa, credenciada_anterior = excluded.credenciada_anterior,
    arquivo_nome = excluded.arquivo_nome, importado_em = excluded.importado_em, importado_por = excluded.importado_por;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.importar_ranking_tecnicos(jsonb) from public, anon, authenticated;
revoke all on function public.importar_ranking_tecnico_atividades(jsonb, text) from public, anon, authenticated;
grant execute on function public.importar_ranking_tecnicos(jsonb) to authenticated;
grant execute on function public.importar_ranking_tecnico_atividades(jsonb, text) to authenticated;
