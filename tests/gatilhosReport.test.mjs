import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGatilhosReport, formatReportCpf } from '../src/utils/gatilhosReportData.ts';
import { createGatilhosReportPdf, createGatilhosReportWorkbook, downloadGatilhosReport, gatilhosReportFilename } from '../src/utils/gatilhosReportExport.ts';

const context = { periodo: { inicio: '2026-10-01', fim: '2026-10-31' }, tipo: 'TODOS', cidade: 'TODAS', busca: '' };
const item = (fields = {}) => ({ id_externo: '100', valor: 8543.19, pontuacao: 9000, valor_ajustado: 9000, ajuste_motivo: 'Reconhecimento',
  valor_instalador: 94, valor_auxiliar: 29, valor_deslocamento: 0, periodo_inicio: '2026-10-01', periodo_fim: '2026-10-31',
  cidade: 'RECIFE', tipo: 'DUPLA', nomes: ['NOME ANTIGO'], nome_exibicao: 'NOME ANTIGO', vinculado: true,
  faixa_atual: { nivel: 2, pontos: 9000, premio: 400 }, premio: 400, ...fields });
const link = (fields = {}) => ({ id: 'L1', id_externo: '100', colaborador_id: 'C1', papel: 'INSTALADOR', tipo: 'DUPLA', cidade: 'RECIFE',
  colaborador: { id: 'C1', nome: 'COLABORADOR UM NOME COMPLETO', cpf: '00000000191', setor: 'INSTALACAO' }, ...fields });
const auxiliary = () => link({ id: 'L2', colaborador_id: 'C2', papel: 'AUXILIAR', colaborador: { id: 'C2', nome: 'COLABORADOR DOIS NOME COMPLETO', cpf: '00000000272', setor: 'AUXILIAR' } });
const now = new Date('2026-11-03T15:00:00Z');

test('a duo stays on one team row with aligned registered names, CPFs and sectors and one prize', () => {
  const report = buildGatilhosReport([item(), item()], [auxiliary(), link(), link()], context, now);
  assert.equal(report.linhas.length, 1);
  assert.equal(report.linhas[0].equipe, true);
  assert.deepEqual(report.linhas[0].membros.map(member => member.nome), ['COLABORADOR UM NOME COMPLETO', 'COLABORADOR DOIS NOME COMPLETO']);
  assert.deepEqual(report.linhas[0].membros.map(member => member.cpf), ['000.000.001-91', '000.000.002-72']);
  assert.deepEqual(report.linhas[0].membros.map(member => member.setor), ['INSTALACAO', 'AUXILIAR']);
  assert.equal(report.totais.premio, 400);
  assert.equal(report.totais.pontos, 9000);
  assert.equal(report.totais.colaboradores, 2);
  assert.equal(report.totais.equipes, 1);
});

test('CPF formatting preserves leading zeros and does not invent missing digits', () => {
  assert.equal(formatReportCpf('00000000191'), '000.000.001-91');
  assert.equal(formatReportCpf('000.000.001-91'), '000.000.001-91');
  assert.equal(formatReportCpf('1234'), '1234');
  assert.equal(formatReportCpf(null), 'Não informado');
});

test('personal data is never borrowed by name or from a mismatched collaborator ID', () => {
  const report = buildGatilhosReport([item()], [link({ colaborador_id: 'WRONG' }), link({ id_externo: 'OTHER' })], context, now);
  assert.equal(report.linhas[0].membros[0].nome, 'Cadastro não disponível');
  assert.equal(report.linhas[0].membros[0].cpf, 'Não informado');
  const unlinked = buildGatilhosReport([item({ vinculado: false })], [], context, now);
  assert.deepEqual(unlinked.linhas[0].membros, []);
  assert.equal(unlinked.totais.ids, 1);
});

test('the active period and visible selection are captured before asynchronous export', () => {
  const records = [item(), item({ periodo_inicio: '2026-09-01' })], links = [link()];
  const selected = { ...context, periodo: { ...context.periodo }, busca: 'COLABORADOR' };
  const report = buildGatilhosReport(records, links, selected, now);
  links[0].colaborador.nome = 'CHANGED'; records[0].pontuacao = 0; selected.periodo.inicio = '2027-01-01';
  assert.equal(report.linhas.length, 1);
  assert.equal(report.linhas[0].membros[0].nome, 'COLABORADOR UM NOME COMPLETO');
  assert.equal(report.linhas[0].pontuacao, 9000);
  assert.equal(report.contexto.periodo.inicio, '2026-10-01');
  assert.equal(report.geradoEm, now.toISOString());
});

test('an adjusted zero score and zero monetary components remain real zeros', () => {
  const report = buildGatilhosReport([item({ pontuacao: 0, valor_ajustado: 0, premio: 0, faixa_atual: null })], [link()], context, now);
  assert.equal(report.linhas[0].pontuacao, 0);
  assert.equal(report.linhas[0].ajustado, true);
  assert.equal(report.linhas[0].valorImportado, 8543.19);
  assert.equal(report.linhas[0].deslocamento, 0);
  assert.equal(report.totais.premio, 0);
});

test('Excel uses one ID per row with both members, text CPF cells and numeric points, prizes and dates', () => {
  const report = buildGatilhosReport([item()], [link(), auxiliary()], context, now);
  const workbook = createGatilhosReportWorkbook(report), sheet = workbook.Sheets.Gatilhos;
  assert.equal(sheet.E8.v, 'COLABORADOR UM NOME COMPLETO');
  assert.equal(sheet.I8.v, 'COLABORADOR DOIS NOME COMPLETO');
  assert.equal(sheet.F8.t, 's'); assert.equal(sheet.F8.v, '000.000.001-91');
  assert.equal(sheet.J8.v, '000.000.002-72');
  assert.equal(sheet.G8.v, 'INSTALACAO'); assert.equal(sheet.K8.v, 'AUXILIAR');
  assert.equal(sheet.N8.t, 'n'); assert.equal(sheet.N8.v, 9000);
  assert.equal(sheet.R8.v, 400); assert.equal(sheet.R9.f, 'SUM(R8:R8)'); assert.equal(sheet.R9.v, 400);
  assert.equal(sheet.V8.t, 'n'); assert.equal(sheet.V8.z, 'dd/mm/yyyy');
  assert.deepEqual(sheet['!autofilter'], { ref: 'A7:W8' });
});

test('Excel keeps data starting with equals as literal text instead of executable formulas', () => {
  const unsafe = link({ colaborador: { ...link().colaborador, nome: '=1+1', setor: '@SOMETHING' } });
  const sheet = createGatilhosReportWorkbook(buildGatilhosReport([item()], [unsafe], context, now)).Sheets.Gatilhos;
  assert.equal(sheet.E8.t, 's'); assert.equal(sheet.E8.v, '=1+1'); assert.equal(sheet.E8.f, undefined);
});

test('PDF pagination retains all IDs and complete team CPFs without splitting a team into payment rows', () => {
  const ranking = Array.from({ length: 30 }, (_, index) => item({ id_externo: `${100 + index}` }));
  const links = ranking.flatMap(row => [link({ id_externo: row.id_externo }), { ...auxiliary(), id_externo: row.id_externo }]);
  const report = buildGatilhosReport(ranking, links, context, now);
  const pdf = createGatilhosReportPdf(report), output = pdf.output();
  assert.ok(pdf.getNumberOfPages() > 2);
  ranking.forEach(row => assert.ok(output.includes(row.id_externo), row.id_externo));
  assert.ok(output.includes('000.000.001-91')); assert.ok(output.includes('000.000.002-72'));
  assert.ok(output.includes('EQUIPE'));
  assert.equal(report.totais.premio, 30 * 400);
});

test('empty exports are rejected and filenames never contain a CPF', () => {
  assert.throws(() => downloadGatilhosReport(buildGatilhosReport([], [], context, now), 'pdf'), /Nenhum resultado/);
  const filename = gatilhosReportFilename(buildGatilhosReport([item({ id_externo: '../100' })], [], context, now));
  assert.ok(!filename.includes('/')); assert.ok(!filename.includes('000.000.001'));
});
