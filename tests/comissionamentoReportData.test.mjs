import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCommissionReport, commissionReportMonths, defaultCommissionReportMonths, executionMonth, formatReportMonth, selectCommissionReportSales } from '../src/utils/comissionamentoReportData.ts';

const filters = { months: ['2026-08', '2026-09', '2026-10'], cities: [], fronts: [], products: [], logins: [], technicians: [] };
const record = (fields = {}) => ({
  nome: 'ANA SILVA', login_criador: 'Z123', alocacao: 'RECIFE', frente: 'VISITA TECNICA',
  proposta: 'MESH', status: 'CONFIRMADA', data_exec: '2026-09-01', data: '2026-08-01', data_agen: '2026-10-01',
  ...fields,
});

test('counts only confirmed rows in the execution month, including month boundaries', () => {
  const report = buildCommissionReport([
    record(), record({ data_exec: '2026-08-31' }), record({ data_exec: '2026-10-01T00:00:00Z' }),
    record({ status: 'CANCELADA' }), record({ status: 'PENDENTE' }),
  ], filters);
  assert.deepEqual(report.totals.counts, [1, 1, 1]);
  assert.equal(report.totals.total, 3);
});

test('missing and invalid execution dates are excluded without falling back to other dates', () => {
  const report = buildCommissionReport([record({ data_exec: null }), record({ data_exec: '2026-02-30' }), record()], filters);
  assert.equal(report.totals.total, 1);
  assert.equal(report.excludedWithoutExecution, 2);
});

test('multiple filter selections reconcile both matrices with the grand total', () => {
  const report = buildCommissionReport([
    record(), record({ alocacao: 'FORTALEZA', nome: 'BRUNO', login_criador: 'Z456' }),
    record({ alocacao: 'NATAL' }), record({ proposta: 'STREAMING' }), record({ frente: 'DESCONEXAO' }),
  ], { ...filters, cities: ['recife', 'Fortaleza'], products: ['MESH'], fronts: ['VISITA TECNICA'] }, 'frente', 'nome');
  assert.equal(report.totals.total, 2);
  assert.equal(report.groups.reduce((sum, row) => sum + row.total, 0), 2);
  assert.equal(report.ranking.reduce((sum, row) => sum + row.total, 0), 2);
  assert.deepEqual(report.totals.counts, [0, 2, 0]);
});

test('month options include months with zero volume through the current month', () => {
  assert.deepEqual(commissionReportMonths([record({ data_exec: '2026-08-31' })], new Date(2026, 9, 13)), [
    '2026-07', '2026-08', '2026-09', '2026-10',
  ]);
});

test('an inconsistent year cannot interrupt the calendar or hide valid 2026 months', () => {
  const today = new Date(2026, 9, 13);
  const months = commissionReportMonths([
    record({ data_exec: '0206-09-28' }), record({ data_exec: '2026-07-05' }),
    record({ data_exec: '2026-08-05' }), record({ data_exec: '2026-09-05' }),
    record({ data_exec: '2026-10-05' }), record({ data_exec: '2027-07-18' }),
  ], today);
  assert.deepEqual(months, ['2026-07', '2026-08', '2026-09', '2026-10', '2027-07']);
  assert.deepEqual(defaultCommissionReportMonths(today), months.slice(0, 4));
  assert.equal(executionMonth('0206-09-28'), null);
  assert.equal(formatReportMonth('0206-09'), '09/0206');
  assert.equal(formatReportMonth('2026-09'), '09/26');
});

test('the July-October period reconciles the observed monthly volumes and flags anomalous dates', () => {
  const today = new Date(2026, 9, 13);
  const data = [
    ...[379, 295, 302, 84].flatMap((count, index) => Array.from({ length: count }, () => record({ data_exec: `2026-${String(index + 7).padStart(2, '0')}-05` }))),
    ...Array.from({ length: 3 }, () => record({ data_exec: '0206-09-28' })),
    ...Array.from({ length: 2 }, () => record({ data_exec: '2027-07-18' })),
    ...Array.from({ length: 7 }, () => record({ data_exec: null })),
  ];
  const report = buildCommissionReport(data, { ...filters, months: defaultCommissionReportMonths(today) }, 'alocacao', 'login_criador', today);
  assert.deepEqual(report.totals.counts, [379, 295, 302, 84]);
  assert.equal(report.totals.total, 1060);
  assert.equal(report.excludedInvalidYear, 3);
  assert.equal(report.excludedWithoutExecution, 7);
  assert.equal(report.futureExecutions, 2);
});

test('default months cross the year boundary without selecting a distant future entry', () => {
  const today = new Date(2027, 0, 10);
  assert.deepEqual(defaultCommissionReportMonths(today), ['2026-10', '2026-11', '2026-12', '2027-01']);
});

test('Fortaleza July detail contains exactly the 72 confirmed sales represented by its cell', () => {
  const sales = Array.from({ length: 72 }, (_, index) => record({ id: `FTZ${index}`, contrato: `412${index}`, alocacao: 'FORTALEZA', data_exec: '2026-07-15', tipo_venda: 'WIFI MESH', valores: 25 }));
  const data = [...sales, record({ alocacao: 'FORTALEZA', data_exec: '2026-08-01' }), record({ data_exec: '2026-07-15' }),
    record({ alocacao: 'FORTALEZA', data_exec: '2026-07-15', status: 'PENDENTE' })];
  const selected = { ...filters, months: ['2026-07', '2026-08'] };
  const report = buildCommissionReport(data, selected);
  const group = report.groups.find(row => row.label === 'FORTALEZA');
  const detail = selectCommissionReportSales(data, selected, { field: 'alocacao', key: group.key, month: '2026-07' });
  assert.equal(group.counts[0], 72);
  assert.deepEqual(detail, sales);
  assert.equal(detail[0], sales[0]);
  assert.equal(detail[0].tipo_venda, 'WIFI MESH');
  assert.equal(detail[0].valores, 25);
});

test('every monthly cell and total reconciles with its detail for cities, fronts, logins and technicians', () => {
  const data = [record(), record({ alocacao: 'FORTALEZA', nome: 'BRUNO', login_criador: 'Z456', frente: 'INSTALACAO', data_exec: '2026-08-31' }),
    record({ alocacao: 'Fortaleza', nome: 'BRUNO', login_criador: 'Z456', frente: 'INSTALACAO', data_exec: '2026-10-01' }),
    record({ alocacao: null, frente: null, login_criador: null }), record({ status: 'CANCELADA' })];
  for (const groupBy of ['alocacao', 'frente']) for (const rankingBy of ['login_criador', 'nome']) {
    const report = buildCommissionReport(data, filters, groupBy, rankingBy);
    for (const [field, rows] of [[groupBy, report.groups], [rankingBy, report.ranking]]) {
      for (const row of rows) {
        assert.equal(selectCommissionReportSales(data, filters, { field, key: row.key }).length, row.total);
        report.months.forEach((month, index) => assert.equal(selectCommissionReportSales(data, filters, { field, key: row.key, month }).length, row.counts[index]));
      }
    }
    assert.equal(selectCommissionReportSales(data, filters).length, report.totals.total);
    report.months.forEach((month, index) => assert.equal(selectCommissionReportSales(data, filters, { month }).length, report.totals.counts[index]));
  }
});

test('sale details honor every selected filter and never widen the selected months', () => {
  const selected = { ...filters, cities: ['RECIFE', 'FORTALEZA'], fronts: ['VISITA TECNICA'], products: ['MESH'], logins: ['Z123'], technicians: ['ANA SILVA'] };
  const expected = [record(), record({ alocacao: 'FORTALEZA' })];
  const data = [...expected, record({ alocacao: 'NATAL' }), record({ frente: 'INSTALACAO' }), record({ proposta: 'STREAMING' }),
    record({ login_criador: 'Z456' }), record({ nome: 'BRUNO' }), record({ data_exec: '2026-07-31' })];
  assert.deepEqual(selectCommissionReportSales(data, selected), expected);
  assert.equal(selectCommissionReportSales(data, selected, { month: '2026-07' }).length, 0);
});

test('detail uses execution month only and omits pending, cancelled, invalid or missing execution rows', () => {
  const expected = record({ status: ' confirmada ', data_exec: '2026-09-30T23:30:00-03:00', data: '2026-07-01', data_agen: '2026-10-01' });
  const data = [expected, record({ status: 'PENDENTE' }), record({ status: 'CANCELADA' }), record({ data_exec: null }),
    record({ data_exec: '2026-02-30' }), record({ data_exec: '0206-09-15' })];
  assert.deepEqual(selectCommissionReportSales(data, filters, { month: '2026-09' }), [expected]);
  assert.deepEqual(selectCommissionReportSales(data, filters, { month: '2026-10' }), []);
});

test('separate sales on the same contract remain separate to match the report count', () => {
  const data = [record({ id: 'A', contrato: '412840312', proposta: 'MESH' }), record({ id: 'B', contrato: '412840312', proposta: 'STREAMING' })];
  const detail = selectCommissionReportSales(data, filters);
  assert.equal(detail.length, buildCommissionReport(data, filters).totals.total);
  assert.deepEqual(detail.map(row => row.id), ['A', 'B']);
});
