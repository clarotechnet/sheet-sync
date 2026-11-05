-- Target: lsxjqzrhgznhopqyapoc. Existing periods stay open until an administrator closes them.
create schema if not exists gatilhos_private;
revoke all on schema gatilhos_private from public, anon;
grant usage on schema gatilhos_private to authenticated;

create table public.gatilhos_fechamentos (
  periodo_inicio date primary key,
  periodo_fim date not null check (periodo_fim >= periodo_inicio),
  fechado_em timestamptz not null default now(),
  fechado_por uuid not null,
  total_ids integer not null check (total_ids > 0),
  faixas jsonb not null check (jsonb_typeof(faixas) = 'array')
);

create table public.gatilhos_resultados_fechados (
  periodo_inicio date not null references public.gatilhos_fechamentos(periodo_inicio) on delete restrict,
  id_externo text not null,
  resultado jsonb not null check (jsonb_typeof(resultado) = 'object'
    and resultado->>'id_externo' = id_externo and resultado->>'periodo_inicio' = periodo_inicio::text),
  vinculos jsonb not null check (jsonb_typeof(vinculos) = 'array'),
  primary key (periodo_inicio, id_externo)
);

alter table public.gatilhos_fechamentos enable row level security;
alter table public.gatilhos_resultados_fechados enable row level security;
revoke all on public.gatilhos_fechamentos, public.gatilhos_resultados_fechados from public, anon, authenticated, service_role;
grant select on public.gatilhos_fechamentos, public.gatilhos_resultados_fechados to authenticated, service_role;

create policy gatilhos_fechamentos_read on public.gatilhos_fechamentos for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved and p.role = 'admin'));
create policy gatilhos_resultados_fechados_read on public.gatilhos_resultados_fechados for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved and p.role = 'admin'));

create function gatilhos_private.rejeitar_alteracao_fechamento()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'O fechamento é imutável. Alterações de cadastro não modificam períodos fechados.' using errcode = '55000';
end;
$$;
revoke all on function gatilhos_private.rejeitar_alteracao_fechamento() from public, anon, authenticated, service_role;
create trigger gatilhos_fechamentos_imutaveis before update or delete or truncate on public.gatilhos_fechamentos
for each statement execute function gatilhos_private.rejeitar_alteracao_fechamento();
create trigger gatilhos_resultados_fechados_imutaveis before update or delete or truncate on public.gatilhos_resultados_fechados
for each statement execute function gatilhos_private.rejeitar_alteracao_fechamento();

create function gatilhos_private.proteger_resultados_fechados()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'TRUNCATE' then
    if exists (select 1 from public.gatilhos_fechamentos) then
      raise exception 'Não é permitido apagar resultados de períodos fechados.' using errcode = '55000';
    end if;
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if exists (select 1 from public.gatilhos_fechamentos f where f.periodo_inicio = old.periodo_inicio) then
      raise exception 'O período % está fechado e não permite alteração, exclusão ou reimportação.', old.periodo_inicio using errcode = '55000';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if exists (select 1 from public.gatilhos_fechamentos f where f.periodo_inicio = new.periodo_inicio) then
      raise exception 'O período % está fechado e não permite alteração, exclusão ou reimportação.', new.periodo_inicio using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function gatilhos_private.proteger_resultados_fechados() from public, anon, authenticated, service_role;
create trigger proteger_gatilhos_resultados_fechados before insert or update or delete on public.gatilhos_resultados
for each row execute function gatilhos_private.proteger_resultados_fechados();
create trigger proteger_gatilhos_resultados_truncate before truncate on public.gatilhos_resultados
for each statement execute function gatilhos_private.proteger_resultados_fechados();

create function gatilhos_private.fechar_periodo(p_periodo_inicio date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fechamento public.gatilhos_fechamentos%rowtype;
  v_total integer;
  v_inseridos integer;
  v_fim date;
  v_faixas jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved and p.role = 'admin') then
    raise exception 'Apenas administradores aprovados podem fechar períodos de gatilhos.' using errcode = '42501';
  end if;
  if p_periodo_inicio is null then
    raise exception 'Informe o período que será fechado.' using errcode = '22007';
  end if;

  -- Lock out imports, score edits and configuration changes until the complete snapshot commits.
  lock table public.gatilhos_fechamentos in share row exclusive mode;
  lock table public.gatilhos_resultados in share row exclusive mode;
  lock table public.gatilhos_vinculos, public.gatilhos_faixas, public.colaboradores_cadastrados in share mode;
  select * into v_fechamento from public.gatilhos_fechamentos where periodo_inicio = p_periodo_inicio;
  if found then return to_jsonb(v_fechamento) - 'faixas'; end if;

  select count(*)::integer, max(periodo_fim) into v_total, v_fim
  from public.gatilhos_resultados where periodo_inicio = p_periodo_inicio;
  if v_total = 0 then
    raise exception 'Nenhum resultado encontrado para fechar esse período.' using errcode = 'P0002';
  end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.tipo, f.nivel), '[]'::jsonb) into v_faixas from public.gatilhos_faixas f;
  insert into public.gatilhos_fechamentos(periodo_inicio, periodo_fim, fechado_por, total_ids, faixas)
  values (p_periodo_inicio, v_fim, (select auth.uid()), v_total, v_faixas) returning * into v_fechamento;

  insert into public.gatilhos_resultados_fechados(periodo_inicio, id_externo, resultado, vinculos)
  select r.periodo_inicio, r.id_externo,
    to_jsonb(r) || jsonb_build_object(
      'pontuacao', s.pontos, 'tipo', equipe.tipo, 'cidade', equipe.cidade,
      'nomes', coalesce(equipe.nomes, '[]'::jsonb),
      'nome_exibicao', coalesce(equipe.nome_exibicao, 'ID ' || r.id_externo || ' não vinculado'),
      'vinculado', equipe.tipo is not null and equipe.cidade is not null and coalesce(jsonb_array_length(equipe.vinculos), 0) > 0,
      'faixa_atual', case when atual.id is null then 'null'::jsonb else to_jsonb(atual) end,
      'proxima_faixa', case when proxima.id is null then 'null'::jsonb else to_jsonb(proxima) end,
      'premio', coalesce(atual.premio, 0)
    ), coalesce(equipe.vinculos, '[]'::jsonb)
  from public.gatilhos_resultados r
  cross join lateral (select coalesce(r.valor_ajustado, r.valor) as pontos) s
  left join lateral (
    select
      jsonb_agg(jsonb_build_object('id', v.id, 'id_externo', v.id_externo, 'colaborador_id', v.colaborador_id,
        'cidade', v.cidade, 'tipo', v.tipo, 'papel', v.papel,
        'colaborador', jsonb_build_object('id', c.id, 'nome', c.nome, 'cpf', c.cpf, 'setor', c.setor))
        order by case when v.papel = 'INSTALADOR' then 0 else 1 end, v.id) as vinculos,
      jsonb_agg(c.nome order by case when v.papel = 'INSTALADOR' then 0 else 1 end, v.id) as nomes,
      string_agg(c.nome, ' / ' order by case when v.papel = 'INSTALADOR' then 0 else 1 end, v.id) as nome_exibicao,
      (array_agg(v.tipo order by case when v.papel = 'INSTALADOR' then 0 else 1 end, v.id))[1] as tipo,
      (array_agg(v.cidade order by case when v.papel = 'INSTALADOR' then 0 else 1 end, v.id))[1] as cidade
    from public.gatilhos_vinculos v join public.colaboradores_cadastrados c on c.id = v.colaborador_id
    where v.id_externo = r.id_externo
  ) equipe on true
  left join lateral (select f.* from public.gatilhos_faixas f where f.tipo = equipe.tipo and f.pontos <= s.pontos order by f.pontos desc limit 1) atual on true
  left join lateral (select f.* from public.gatilhos_faixas f where f.tipo = equipe.tipo and f.pontos > s.pontos order by f.pontos limit 1) proxima on true
  where r.periodo_inicio = p_periodo_inicio;
  get diagnostics v_inseridos = row_count;
  if v_inseridos <> v_total then raise exception 'O fechamento não foi concluído integralmente.'; end if;
  return to_jsonb(v_fechamento) - 'faixas';
end;
$$;
revoke all on function gatilhos_private.fechar_periodo(date) from public, anon, authenticated, service_role;
grant execute on function gatilhos_private.fechar_periodo(date) to authenticated;

create function public.fechar_periodo_gatilhos(p_periodo_inicio date)
returns jsonb language sql security invoker set search_path = '' as $$
  select gatilhos_private.fechar_periodo(p_periodo_inicio);
$$;
revoke all on function public.fechar_periodo_gatilhos(date) from public, anon, authenticated, service_role;
grant execute on function public.fechar_periodo_gatilhos(date) to authenticated;

comment on table public.gatilhos_fechamentos is 'Fechamentos manuais imutáveis; as faixas são copiadas na mesma transação dos resultados.';
comment on table public.gatilhos_resultados_fechados is 'Retrato do fechamento, incluindo equipe, tipo, cidade, pontos, prêmio, CPF, nome e setor; não depende dos cadastros atuais.';
