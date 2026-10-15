import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileRankingActivities } from '../src/utils/reconcileRankingActivities.ts';
import { calculateTechnicianRanking, resolveRankingReturns } from '../src/utils/technicianRanking.ts';

const technician = { login: 'Z641936', nome: 'WELLINGTON RIBEIRO DE OLIVEIRA SOBRINHO', cidade: 'RECIFE', supervisor: 'ELINO' };
const activity = (fields = {}) => ({
  id_atividade: 'TASK1', data_atividade: '2026-10-14', login_tecnico: technician.login, concluiu_atividade: null,
  recurso: technician.nome, contrato: '412855760', numero_wo: 'WO1', cidade: 'RECIFE', status_atividade: 'pendente',
  tipo_atividade: 'Instalacao', codigos_baixa: [], credenciada_anterior: null, ...fields,
});
const stored = (fields = {}) => ({
  id: 'DB1', contrato: '412855760', data_atividade: '2026-10-14', numero_os: 'WO1', numero_os1: 'TASK1',
  recurso: technician.nome, cidade: 'RECIFE', tipo_atividade: 'Instalação', status_atividade: 'concluído',
  cod_baixa_1: '409 - SERVICO CONCLUIDO', is_revisita: false, ofensor_revisita: null, ...fields,
});

test('contract 412855760 uses the completed management outcome in ranking details and the 409 percentage', () => {
  const source = [activity(), ...Array.from({ length: 4 }, (_, i) => activity({
    id_atividade: `OTHER${i}`, contrato: `OTHER${i}`, codigos_baixa: ['409 - SERVICO CONCLUIDO'], status_atividade: 'concluido',
  }))];
  const rows = reconcileRankingActivities(source, [stored()], [technician]);
  const [ranking] = calculateTechnicianRanking(rows, [technician]);
  assert.equal(ranking.contratos, 5);
  assert.equal(ranking.contratos409, 5);
  assert.equal(ranking.porcentagem, 100);
  assert.deepEqual(ranking.detalhes.find(row => row.contrato === '412855760').statuses, ['concluído']);
  assert.equal(source[0].status_atividade, 'pendente');
  assert.deepEqual(source[0].codigos_baixa, []);
});

test('a matching contract never borrows a different date, city, WO or technician outcome', () => {
  for (const change of [{ contrato: 'OTHER' }, { data_atividade: '2026-10-15' }, { cidade: 'NATAL' },
    { numero_os: 'OTHER' }, { recurso: 'OUTRO TECNICO' }, { recurso: null }]) {
    const source = activity();
    assert.equal(reconcileRankingActivities([source], [stored(change)], [technician])[0], source);
  }
});

test('the WO fallback needs the same type and known city when task IDs differ', () => {
  const source = activity();
  assert.equal(reconcileRankingActivities([source], [stored({ numero_os1: 'DIFFERENT', cidade: 'Recife/PE' })], [technician])[0].status_atividade, 'concluído');
  for (const change of [{ tipo_atividade: 'Visita Técnica' }, { cidade: null }, { numero_os: null }]) {
    assert.equal(reconcileRankingActivities([source], [stored({ numero_os1: 'DIFFERENT', ...change })], [technician])[0], source);
  }
});

test('an exact task ID distinguishes different tasks in the same contract and WO', () => {
  const records = [stored(), stored({ id: 'DB2', numero_os1: 'TASK2', status_atividade: 'cancelado', cod_baixa_1: '400' })];
  const [result] = reconcileRankingActivities([activity()], records, [technician]);
  assert.equal(result.status_atividade, 'concluído');
  assert.deepEqual(result.codigos_baixa, ['409 - SERVICO CONCLUIDO']);
});

test('conflicting matches remain unchanged instead of guessing a completed outcome', () => {
  const source = activity();
  const records = [stored(), stored({ id: 'DB2', status_atividade: 'cancelado', cod_baixa_1: '400' })];
  assert.equal(reconcileRankingActivities([source], records, [technician])[0], source);
  assert.equal(reconcileRankingActivities([source], records.map(row => ({ ...row, numero_os1: 'OTHER' })), [technician])[0], source);
});

test('registry names resolve a renamed display name without fuzzy matching', () => {
  const source = activity({ recurso: 'WELLINGTON RIBEIRO' });
  assert.equal(reconcileRankingActivities([source], [stored()], [technician])[0].status_atividade, 'concluído');
  assert.equal(reconcileRankingActivities([source], [stored({ recurso: 'WELLINGTON' })], [technician])[0], source);
});

test('management code 1 does not erase secondary 409 codes supplied by the ranking file', () => {
  const source = activity({ codigos_baixa: ['430 - RETIRADO', '409 - CONCLUIDO'] });
  const [result] = reconcileRankingActivities([source], [stored({ cod_baixa_1: '430 - RETIRADO' })], [technician]);
  assert.deepEqual(result.codigos_baixa, source.codigos_baixa);
  assert.equal(calculateTechnicianRanking([result], [technician])[0].contratos409, 1);
});

test('an older pending or started management snapshot cannot undo a closed ranking status', () => {
  for (const status_atividade of ['pendente', 'iniciado']) {
    const [result] = reconcileRankingActivities([activity({ status_atividade: 'concluído', codigos_baixa: ['409'] })],
      [stored({ status_atividade, cod_baixa_1: null })], [technician]);
    assert.equal(result.status_atividade, 'concluído');
    assert.deepEqual(result.codigos_baixa, ['409']);
  }
});

test('reconciliation preserves the existing return offender while including management-only contracts', () => {
  const returnSource = activity({ tipo_atividade: 'Retorno Credenciada' });
  const records = [stored({ tipo_atividade: 'Retorno Credenciada', is_revisita: true, ofensor_revisita: 'TECNICO ANTERIOR' }), stored({ id: 'MANAGEMENT ONLY', contrato: 'MANAGEMENT ONLY' })];
  const rows = reconcileRankingActivities([returnSource], records, [technician]);
  assert.equal(rows.length, 2);
  const returns = resolveRankingReturns(rows, records);
  assert.equal(returns[0].ofensor, 'TECNICO ANTERIOR');
  assert.deepEqual(returns[0].statuses, ['concluído']);
  assert.equal(calculateTechnicianRanking(rows, [technician], returns).find(row => row.login === technician.login).retornosCredenciados, 0);
});

test('Recife technicians and 409 contracts appear on October 15 without any ranking import', () => {
  const technicians = [
    { login: 'ZEDSON', nome: 'EDSON CASEMIRO DOS SANTOS', cidade: 'RECIFE', supervisor: 'ELINO' },
    { login: 'ZGLEIDSON', nome: 'GLEIDSON FARIAS LIRA', cidade: 'RECIFE', supervisor: 'WESLEY SOUZA' },
  ];
  const records = [
    stored({ id: 'TODAY1', data_atividade: '2026-10-15', recurso: 'EDSON CASEMIRO', contrato: '412856812' }),
    stored({ id: 'TODAY2', data_atividade: '2026-10-15', recurso: 'GLEIDSON FARIAS LIRA', contrato: '412828576' }),
  ];
  const rows = calculateTechnicianRanking(reconcileRankingActivities([], records, technicians), technicians);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.login).sort(), ['ZEDSON', 'ZGLEIDSON']);
  assert.ok(rows.every(row => row.cidade === 'RECIFE' && row.cadastrado && row.contratos === 1 && row.contratos409 === 1 && row.porcentagem === 100));
  assert.equal(rows.find(row => row.login === 'ZEDSON').supervisor, 'ELINO');
});

test('all activity statuses contribute to received contracts, not just the 409 numerator', () => {
  const records = [stored(), stored({ id: 'PENDING', contrato: 'PENDING', status_atividade: 'pendente', cod_baixa_1: null }),
    stored({ id: 'CANCELLED', contrato: 'CANCELLED', status_atividade: 'cancelado', cod_baixa_1: '400' })];
  const [row] = calculateTechnicianRanking(reconcileRankingActivities([], records, [technician]), [technician]);
  assert.equal(row.contratos, 3);
  assert.equal(row.contratos409, 1);
  assert.ok(Math.abs(row.porcentagem - 100 / 3) < 1e-9);
});

test('matching tasks in both sources are represented once without hiding management-only tasks', () => {
  const records = [stored(), stored({ id: 'NEW', numero_os1: 'NEW', contrato: 'NEW CONTRACT' })];
  const merged = reconcileRankingActivities([activity()], records, [technician]);
  assert.equal(merged.length, 2);
  const [row] = calculateTechnicianRanking(merged, [technician]);
  assert.equal(row.atividades, 2);
  assert.equal(row.contratos, 2);
  assert.equal(row.contratos409, 2);
});

test('a repeated contract is counted once per technician/day across the two sources', () => {
  const other = { ...technician, login: 'ZOTHER', nome: 'OUTRO TECNICO', supervisor: 'OUTRO SUPERVISOR' };
  const records = [stored(), stored({ id: 'TASK2', numero_os1: 'TASK2' }), stored({ id: 'NEXT DAY', data_atividade: '2026-10-15' }),
    stored({ id: 'OTHER TECHNICIAN', recurso: other.nome })];
  const rows = calculateTechnicianRanking(reconcileRankingActivities([activity()], records, [technician, other]), [technician, other]);
  assert.equal(rows.find(row => row.login === technician.login).contratos, 2);
  assert.equal(rows.find(row => row.login === other.login).contratos, 1);
});

test('inactive abbreviated technicians stay hidden and registrations without data never appear', () => {
  const inactive = { ...technician, nome: 'WELLINGTON RIBEIRO DE OLIVEIRA SOBRINHO', ativo: false };
  const empty = { ...technician, login: 'ZEMPTY', nome: 'TECNICO SEM DADOS' };
  const rows = calculateTechnicianRanking(reconcileRankingActivities([], [stored({ recurso: 'WELLINGTON RIBEIRO' })], [inactive, empty]), [inactive, empty]);
  assert.deepEqual(rows, []);
});

test('an abbreviated resource is matched only to a unique technician in its city', () => {
  const recife = { ...technician, nome: 'EDSON CASEMIRO DOS SANTOS' };
  const natal = { ...technician, login: 'ZNATAL', cidade: 'NATAL', nome: 'EDSON CASEMIRO DE OLIVEIRA' };
  const record = stored({ recurso: 'EDSON CASEMIRO' });
  const [merged] = reconcileRankingActivities([], [record], [recife, natal]);
  assert.equal(merged.login_tecnico, recife.login);
  const duplicate = { ...recife, login: 'ZSECOND', nome: 'EDSON CASEMIRO SILVA' };
  const [ambiguous] = calculateTechnicianRanking(reconcileRankingActivities([], [record], [recife, duplicate]), [recife, duplicate]);
  assert.equal(ambiguous.login, 'Não informado');
  assert.equal(ambiguous.supervisor, 'Não cadastrado');
});

test('exact names are not borrowed from a registration in a different city', () => {
  const natal = { ...technician, cidade: 'NATAL' };
  const [row] = calculateTechnicianRanking(reconcileRankingActivities([], [stored()], [natal]), [natal]);
  assert.equal(row.cadastrado, false);
  assert.equal(row.login, 'Não informado');
  assert.equal(row.cidade, 'RECIFE');
});

test('an imported identity snapshot still links renamed technicians to new management-only contracts', () => {
  const renamed = { ...technician, nome: 'NOME ATUALIZADO NO CADASTRO' };
  const merged = reconcileRankingActivities([activity()], [stored({ id: 'NEW', contrato: 'NEW' })], [renamed]);
  const [row] = calculateTechnicianRanking(merged, [renamed]);
  assert.equal(row.nome, renamed.nome);
  assert.equal(row.contratos, 2);
  assert.equal(row.login, technician.login);
});

test('trigger-assigned returns work without a ranking import and stay with the previous offender', () => {
  const executor = { ...technician, login: 'ZEXECUTOR', nome: 'TECNICO DO RETORNO' };
  const record = stored({ recurso: executor.nome, tipo_atividade: 'Retorno Credenciada', is_revisita: true, ofensor_revisita: technician.nome });
  const merged = reconcileRankingActivities([], [record], [technician, executor]);
  const returns = resolveRankingReturns(merged, [record]);
  const rows = calculateTechnicianRanking(merged, [technician, executor], returns);
  const offender = rows.find(row => row.login === technician.login);
  assert.equal(offender.contratos, 0);
  assert.equal(offender.retornosCredenciados, 1);
  assert.equal(rows.find(row => row.login === executor.login).retornosCredenciados, 0);
});

test('blank contracts and resources cannot create phantom technician rows or break return resolution', () => {
  const records = [stored({ contrato: null, tipo_atividade: 'Retorno Credenciada' }), stored({ id: 'BLANK', recurso: null })];
  assert.deepEqual(reconcileRankingActivities([], records, [technician]), []);
  assert.deepEqual(resolveRankingReturns([], records), []);
});

test('missing management records preserve the imported activity unchanged', () => {
  const source = activity();
  assert.equal(reconcileRankingActivities([source], [], [technician])[0], source);
});
