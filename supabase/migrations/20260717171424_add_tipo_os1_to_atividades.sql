-- Armazena a classificacao importada da coluna "Tipo O.S 1" do arquivo.
-- O campo nao faz parte da chave unica do servico e pode ser atualizado no upsert.
alter table public.atividades
add column if not exists tipo_os1 text;

comment on column public.atividades.tipo_os1 is
'Valor importado da coluna "Tipo O.S 1" do arquivo de atividades.';
