import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCommissionReport, commissionReportMonths, defaultCommissionReportMonths, executionMonth, formatReportMonth } from '../src/utils/comissionamentoReportData.ts';

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
