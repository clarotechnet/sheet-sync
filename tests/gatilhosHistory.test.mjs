import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLiveGatilhosRanking, readClosedGatilhos } from '../src/utils/gatilhosHistory.ts';
import { buildGatilhosReport } from '../src/utils/gatilhosReportData.ts';

const original = () => {
  const colaborador = { id: 'C1', nome: 'TECNICO ORIGINAL', cpf: '00000000191', setor: 'INSTALACAO' };
  const auxiliar = { id: 'C2', nome: 'AUXILIAR ORIGINAL', cpf: '00000000272', setor: 'AUXILIAR' };
  const result = { id_externo: '100', periodo_inicio: '2026-10-01', periodo_fim: '2026-10-31',
    valor: 8543.19, valor_ajustado: 9000, valor_instalador: 100, valor_auxiliar: 20, valor_deslocamento: 0 };
  const link = { id: 'L1', id_externo: '100', colaborador_id: 'C1', papel: 'INSTALADOR', tipo: 'DUPLA', cidade: 'RECIFE', colaborador };
  return { resultados: [result, { ...result, periodo_inicio: '2026-11-01', periodo_fim: '2026-11-30' }],
    vinculos: [link, { ...link, id: 'L2', colaborador_id: 'C2', papel: 'AUXILIAR', colaborador: auxiliar }],
    faixas: [{ id: 'F1', tipo: 'DUPLA', nivel: 1, pontos: 8000, premio: 300 },
      { id: 'F2', tipo: 'DUPLA', nivel: 2, pontos: 9000, premio: 400 },
      { id: 'F3', tipo: 'INDIVIDUAL_CARRO', nivel: 1, pontos: 8000, premio: 700 }], colaboradores: [], tecnicosFrente: [] };
};

test('October retains its duo, score and prize while November follows the current solo registry', () => {
  const state = original();
  const meta = { periodo_inicio: '2026-10-01', total_ids: 1, faixas: structuredClone(state.faixas) };
  const rows = structuredClone([{ periodo_inicio: '2026-10-01', id_externo: '100',
    resultado: buildLiveGatilhosRanking(state, '2026-10-01')[0], vinculos: state.vinculos }]);
  state.vinculos = [state.vinculos[0]];
  state.vinculos[0].tipo = 'INDIVIDUAL_CARRO'; state.vinculos[0].cidade = 'FORTALEZA';
  state.vinculos[0].colaborador.nome = 'TECNICO NOVO'; state.vinculos[0].colaborador.cpf = '11111111111';
  state.vinculos[0].colaborador.setor = 'OUTRO SETOR'; state.faixas.forEach((faixa) => { faixa.premio = 999; });
  const closed = readClosedGatilhos(meta, rows);
  assert.equal(closed.ranking[0].tipo, 'DUPLA'); assert.equal(closed.ranking[0].cidade, 'RECIFE');
  assert.equal(closed.ranking[0].nome_exibicao, 'TECNICO ORIGINAL / AUXILIAR ORIGINAL');
  assert.equal(closed.ranking[0].pontuacao, 9000); assert.equal(closed.ranking[0].premio, 400);
  assert.equal(closed.faixas[1].premio, 400);
  const live = buildLiveGatilhosRanking(state, '2026-11-01');
  assert.equal(live[0].tipo, 'INDIVIDUAL_CARRO'); assert.equal(live[0].nome_exibicao, 'TECNICO NOVO');
  assert.equal(live[0].premio, 999);
  const report = buildGatilhosReport(closed.ranking, closed.vinculos, {
    periodo: { inicio: '2026-10-01', fim: '2026-10-31' }, tipo: 'TODOS', cidade: 'TODAS', busca: '',
  });
  assert.equal(report.linhas.length, 1); assert.equal(report.linhas[0].membros.length, 2);
  assert.equal(report.linhas[0].membros[0].nome, 'TECNICO ORIGINAL');
  assert.equal(report.linhas[0].membros[0].cpf, '000.000.001-91');
  assert.equal(report.linhas[0].membros[0].setor, 'INSTALACAO');
  assert.equal(report.totais.premio, 400);
});

test('closed snapshots reject missing IDs, duplicates and another period instead of recomputing live data', () => {
  const state = original(), resultado = buildLiveGatilhosRanking(state, '2026-10-01')[0];
  const meta = { periodo_inicio: '2026-10-01', total_ids: 1, faixas: state.faixas };
  const row = { periodo_inicio: '2026-10-01', id_externo: '100', resultado, vinculos: state.vinculos };
  assert.throws(() => readClosedGatilhos(meta, []), /incompleto/);
  assert.throws(() => readClosedGatilhos({ ...meta, total_ids: 2 }, [row, row]), /incompleto/);
  assert.throws(() => readClosedGatilhos(meta, [{ ...row, periodo_inicio: '2026-11-01' }]), /incompleto/);
  assert.throws(() => readClosedGatilhos(meta, [{ ...row, resultado: { ...resultado, id_externo: 'WRONG' } }]), /incompleto/);
  assert.throws(() => readClosedGatilhos(meta, [{ ...row, vinculos: null }]), /incompleto/);
});

test('even an unlinked ID is preserved as unlinked at close; later links cannot change its report', () => {
  const state = original(); state.vinculos = [];
  const resultado = buildLiveGatilhosRanking(state, '2026-10-01')[0];
  const closed = readClosedGatilhos({ periodo_inicio: '2026-10-01', total_ids: 1, faixas: state.faixas },
    [{ periodo_inicio: '2026-10-01', id_externo: '100', resultado, vinculos: [] }]);
  assert.equal(closed.ranking[0].vinculado, false); assert.equal(closed.ranking[0].premio, 0);
  assert.equal(closed.vinculos.length, 0);
});

test('a zero adjusted score remains zero and live calculations do not mutate the link order', () => {
  const state = original(); state.resultados[0].valor_ajustado = 0;
  state.vinculos.reverse(); const order = state.vinculos.map((v) => v.id);
  const ranking = buildLiveGatilhosRanking(state, '2026-10-01');
  assert.equal(ranking[0].pontuacao, 0); assert.equal(ranking[0].premio, 0);
  assert.deepEqual(state.vinculos.map((v) => v.id), order);
  assert.equal(buildLiveGatilhosRanking(state, '2025-01-01').length, 0);
});
