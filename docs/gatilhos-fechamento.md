# Fechamento de periodos de gatilhos

## Banco de destino

Projeto de atividades: `lsxjqzrhgznhopqyapoc`.

Migracao: `supabase/migrations/20261105115011_freeze_gatilhos_closed_periods.sql`.
Ela depende das tabelas do modulo Gatilhos e da migracao de periodos/ajustes
`20261002154700_preserve_gatilhos_periods_and_score_adjustments.sql`.

Aplicar somente no projeto de atividades, depois de confirmar o destino e o
schema existente. Nao executar as fixtures de teste no Supabase. Nao enviar
outras migracoes pendentes sem revisa-las. A migracao nao fecha nenhum periodo
automaticamente nem altera equipes ou pontuacoes existentes.

## Uso

1. Revisar equipes, colaboradores, pontuacoes e faixas do periodo ainda aberto.
2. Selecionar o periodo em Gatilhos e usar **Fechar periodo** como administrador.
3. Confirmar o fechamento de todos os IDs, independentemente dos filtros visuais.

O fechamento copia os resultados, equipes, nomes, CPFs, setores, cidades, tipos,
pontuacoes ajustadas, faixas e premios na mesma transacao. A copia nao tem
dependencia dos cadastros atuais. Ranking, equipes, faixas e exportacoes de um
periodo fechado usam essa copia.

Alteracoes futuras de cadastro continuam permitidas nos periodos abertos.
Resultados fechados nao aceitam ajuste, exclusao nem reimportacao, inclusive
por chamadas diretas a API. Nao ha opcao de reabertura.

O fechamento registra os dados **como estao no momento da confirmacao**. Nao
reconstroi automaticamente equipes antigas que ja tenham sido alteradas.

## Validacao local

- `node --test tests/*.test.mjs`
- `npm run build`
- `tests/gatilhosClosure.sql`: fixture destrutiva apenas para cluster PostgreSQL
  novo e descartavel, banco `gatilhos_closure_test`, porta `55459`. Testa as
  migracoes reais, snapshots, RPCs, permissoes, RLS e imutabilidade.
- Com Vite na porta 8080 e Playwright disponivel:
  `node tests/gatilhosClosure.browser.mjs <modulo-playwright> <pasta-capturas>`.
  Todos os acessos HTTP e WebSocket ao Supabase sao simulados; nenhum dado real
  e usado ou alterado.

Sem a migracao, a tela avisa que o fechamento esta indisponivel e nao permite
marcar periodos como fechados. Falhas de leitura de um fechamento existente
bloqueiam a consulta/exportacao; os dados atuais nao substituem a copia antiga.
