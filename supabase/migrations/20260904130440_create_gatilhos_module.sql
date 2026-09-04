create table public.gatilhos_resultados (
  id_externo text primary key check (btrim(id_externo) <> ''),
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  valor_instalador numeric(14, 2) not null default 0 check (valor_instalador >= 0),
  valor_auxiliar numeric(14, 2) not null default 0 check (valor_auxiliar >= 0),
  valor_deslocamento numeric(14, 2) not null default 0 check (valor_deslocamento >= 0),
  periodo_inicio date not null,
  periodo_fim date not null check (periodo_fim >= periodo_inicio),
  arquivo_nome text,
  importado_em timestamptz not null default now(),
  importado_por uuid default auth.uid()
);

create table public.gatilhos_vinculos (
  id uuid primary key default gen_random_uuid(),
  id_externo text not null check (btrim(id_externo) <> ''),
  colaborador_id uuid not null references public.colaboradores_cadastrados(id) on delete restrict,
  cidade text check (cidade in ('FORTALEZA', 'MOSSORÓ', 'NATAL/PARNAMIRIM', 'RECIFE')),
  tipo text check (tipo in ('DUPLA', 'INDIVIDUAL_CARRO', 'MOTO', 'DESCONEXAO')),
  papel text not null default 'INSTALADOR' check (papel in ('INSTALADOR', 'AUXILIAR')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id_externo, colaborador_id)
);

create index gatilhos_vinculos_id_externo_idx
  on public.gatilhos_vinculos (id_externo);

create index gatilhos_vinculos_colaborador_id_idx
  on public.gatilhos_vinculos (colaborador_id);

create index gatilhos_vinculos_cidade_tipo_idx
  on public.gatilhos_vinculos (cidade, tipo);

create table public.gatilhos_faixas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('DUPLA', 'INDIVIDUAL_CARRO', 'MOTO', 'DESCONEXAO')),
  nivel smallint not null check (nivel between 1 and 4),
  pontos numeric(14, 2) not null check (pontos > 0),
  premio numeric(14, 2) not null check (premio >= 0),
  unique (tipo, nivel),
  unique (tipo, pontos)
);

insert into public.gatilhos_faixas (tipo, nivel, pontos, premio)
values
  ('DUPLA', 1, 8000, 300),
  ('DUPLA', 2, 9000, 400),
  ('DUPLA', 3, 10000, 500),
  ('DUPLA', 4, 11000, 600),
  ('INDIVIDUAL_CARRO', 1, 7000, 300),
  ('INDIVIDUAL_CARRO', 2, 8000, 400),
  ('INDIVIDUAL_CARRO', 3, 9000, 600),
  ('INDIVIDUAL_CARRO', 4, 10000, 700),
  ('MOTO', 1, 5000, 150),
  ('MOTO', 2, 6000, 250),
  ('MOTO', 3, 7000, 350),
  ('MOTO', 4, 8000, 450),
  ('DESCONEXAO', 1, 5000, 150),
  ('DESCONEXAO', 2, 6000, 250),
  ('DESCONEXAO', 3, 7000, 350),
  ('DESCONEXAO', 4, 8000, 450);

alter table public.gatilhos_resultados enable row level security;
alter table public.gatilhos_vinculos enable row level security;
alter table public.gatilhos_faixas enable row level security;

grant select, insert, update, delete on table public.gatilhos_resultados to authenticated;
grant select, insert, update, delete on table public.gatilhos_vinculos to authenticated;
grant select, insert, update, delete on table public.gatilhos_faixas to authenticated;

create policy gatilhos_resultados_admin_all
on public.gatilhos_resultados
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
);

create policy gatilhos_vinculos_admin_all
on public.gatilhos_vinculos
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
);

create policy gatilhos_faixas_admin_all
on public.gatilhos_faixas
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  )
);

create or replace function public.substituir_gatilhos_resultados(
  p_dados jsonb,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_arquivo_nome text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_importado_em timestamptz := now();
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  ) then
    raise exception 'Apenas administradores aprovados podem substituir a carga de gatilhos.'
      using errcode = '42501';
  end if;

  if p_periodo_inicio is null or p_periodo_fim is null or p_periodo_fim < p_periodo_inicio then
    raise exception 'Período da carga inválido.' using errcode = '22007';
  end if;

  if p_dados is null or jsonb_typeof(p_dados) <> 'array' or jsonb_array_length(p_dados) = 0 then
    raise exception 'A carga deve conter ao menos um resultado.' using errcode = '22023';
  end if;

  if jsonb_array_length(p_dados) > 5000 then
    raise exception 'A carga excede o limite de 5000 resultados.' using errcode = '22023';
  end if;

  insert into public.gatilhos_resultados (
    id_externo,
    valor,
    valor_instalador,
    valor_auxiliar,
    valor_deslocamento,
    periodo_inicio,
    periodo_fim,
    arquivo_nome,
    importado_em,
    importado_por
  )
  select
    btrim(item.id_externo),
    coalesce(item.valor, 0),
    coalesce(item.valor_instalador, 0),
    coalesce(item.valor_auxiliar, 0),
    coalesce(item.valor_deslocamento, 0),
    p_periodo_inicio,
    p_periodo_fim,
    nullif(btrim(p_arquivo_nome), ''),
    v_importado_em,
    (select auth.uid())
  from jsonb_to_recordset(p_dados) as item(
    id_externo text,
    valor numeric,
    valor_instalador numeric,
    valor_auxiliar numeric,
    valor_deslocamento numeric
  )
  on conflict (id_externo) do update
  set valor = excluded.valor,
      valor_instalador = excluded.valor_instalador,
      valor_auxiliar = excluded.valor_auxiliar,
      valor_deslocamento = excluded.valor_deslocamento,
      periodo_inicio = excluded.periodo_inicio,
      periodo_fim = excluded.periodo_fim,
      arquivo_nome = excluded.arquivo_nome,
      importado_em = excluded.importado_em,
      importado_por = excluded.importado_por;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function public.salvar_gatilho_vinculo(
  p_id_externo text,
  p_cidade text,
  p_tipo text,
  p_colaboradores uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quantidade integer;
  v_distintos integer;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.approved = true
      and p.role = 'admin'
  ) then
    raise exception 'Apenas administradores aprovados podem alterar vínculos de gatilhos.'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_id_externo), '') is null then
    raise exception 'Informe o ID externo.' using errcode = '22023';
  end if;

  if p_cidade is null or p_cidade not in ('FORTALEZA', 'MOSSORÓ', 'NATAL/PARNAMIRIM', 'RECIFE') then
    raise exception 'Cidade inválida.' using errcode = '22023';
  end if;

  if p_tipo is null or p_tipo not in ('DUPLA', 'INDIVIDUAL_CARRO', 'MOTO', 'DESCONEXAO') then
    raise exception 'Tipo de equipe inválido.' using errcode = '22023';
  end if;

  v_quantidade := coalesce(array_length(p_colaboradores, 1), 0);
  select count(distinct colaborador_id)
  into v_distintos
  from unnest(p_colaboradores) as membro(colaborador_id);

  if (p_tipo = 'DUPLA' and v_quantidade <> 2)
    or (p_tipo <> 'DUPLA' and v_quantidade <> 1)
    or v_distintos <> v_quantidade then
    raise exception 'Duplas exigem dois colaboradores distintos; os demais tipos exigem um.'
      using errcode = '22023';
  end if;

  delete from public.gatilhos_vinculos
  where id_externo = btrim(p_id_externo);

  insert into public.gatilhos_vinculos (
    id_externo,
    colaborador_id,
    cidade,
    tipo,
    papel
  )
  select
    btrim(p_id_externo),
    colaborador_id,
    p_cidade,
    p_tipo,
    case when ordem = 1 then 'INSTALADOR' else 'AUXILIAR' end
  from unnest(p_colaboradores) with ordinality as membro(colaborador_id, ordem);
end;
$$;

revoke all on function public.substituir_gatilhos_resultados(jsonb, date, date, text)
  from public, anon;
grant execute on function public.substituir_gatilhos_resultados(jsonb, date, date, text)
  to authenticated;

revoke all on function public.salvar_gatilho_vinculo(text, text, text, uuid[])
  from public, anon;
grant execute on function public.salvar_gatilho_vinculo(text, text, text, uuid[])
  to authenticated;

comment on table public.gatilhos_resultados is
  'Retrato substituível da aba Comiss.Sintético; mantém somente a carga mais recente.';

comment on table public.gatilhos_vinculos is
  'Vínculo persistente entre o ID externo do relatório e um ou dois colaboradores cadastrados.';

comment on table public.gatilhos_faixas is
  'Metas de pontos e premiações por tipo de equipe.';
