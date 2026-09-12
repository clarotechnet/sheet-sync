create table if not exists public.colaboradores_cadastrados (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  setor text not null check (btrim(setor) <> ''),
  created_at timestamptz not null default now()
);

create index if not exists colaboradores_cadastrados_nome_idx
  on public.colaboradores_cadastrados (nome);

create index if not exists colaboradores_cadastrados_setor_idx
  on public.colaboradores_cadastrados (setor);

alter table public.colaboradores_cadastrados enable row level security;

revoke all on table public.colaboradores_cadastrados from anon;
grant select on table public.colaboradores_cadastrados to authenticated;

drop policy if exists colaboradores_cadastrados_admin_select
on public.colaboradores_cadastrados;

create policy colaboradores_cadastrados_admin_select
on public.colaboradores_cadastrados
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

comment on table public.colaboradores_cadastrados is
  'Cadastro administrativo de colaboradores. Dados pessoais devem ser importados pelo sistema, nunca versionados em migrations.';
