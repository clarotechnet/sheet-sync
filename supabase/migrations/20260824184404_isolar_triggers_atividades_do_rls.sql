-- O INSERT/UPDATE externo continua protegido pelas policies de atividades.
-- Somente a funcao interna do trigger ignora o RLS ao consultar o historico
-- da propria tabela. Isso evita que a security barrier do RLS impeça o uso
-- eficiente do indice por contrato durante cada linha do upsert.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

do $migration$
begin
  if to_regprocedure('private.fn_calc_log_atividades()') is null then
    if to_regprocedure('public.fn_calc_log_atividades()') is null then
      raise exception
        'Funcao public.fn_calc_log_atividades() nao encontrada';
    end if;

    -- ALTER FUNCTION SET SCHEMA preserva o OID; o trigger existente continua
    -- chamando a mesma funcao sem precisar ser recriado.
    execute
      'alter function public.fn_calc_log_atividades() set schema private';
  end if;

  -- No Supabase, postgres possui BYPASSRLS. O search_path vazio exige que os
  -- objetos usados pela funcao sejam qualificados, como public.atividades.
  execute
    'alter function private.fn_calc_log_atividades() owner to postgres';
  execute
    'alter function private.fn_calc_log_atividades() security definer';
  execute
    $sql$
      alter function private.fn_calc_log_atividades()
      set search_path = ''
    $sql$;

  -- A funcao e exclusiva do trigger e nao pode ser chamada pela Data API.
  execute
    'revoke all on function private.fn_calc_log_atividades() '
    || 'from public, anon, authenticated';
end;
$migration$;

comment on function private.fn_calc_log_atividades() is
  'Calcula contador_log pelo historico; funcao interna do trigger, isolada do RLS.';
