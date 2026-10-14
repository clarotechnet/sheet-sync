import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateTechnicianRanking, parseRankingActivities, parseRankingTechnicians, hasCode409, resolveRankingReturns } from '../src/utils/technicianRanking.ts';

const technician = { login: 'Z100', nome: 'NOME COMPLETO DO TECNICO', cidade: 'RECIFE', supervisor: 'SUPERVISOR A' };
const activity = (fields = {}) => ({ id_atividade: '1', data_atividade: '2026-10-14', login_tecnico: 'Z100', concluiu_atividade: null,
  recurso: 'NOME ABREVIADO', contrato: 'C1', numero_wo: 'WO1', cidade: 'RECIFE', status_atividade: 'concluído',
  tipo_atividade: 'Instalacao', codigos_baixa: [], credenciada_anterior: null, ...fields });

test('counts a contract once per technician/day and recognizes 409 in secondary tasks', () => {
  const [row] = calculateTechnicianRanking([
    activity({ codigos_baixa: ['430 - EQUIPAMENTO RETIRADO', '409 - Serviço concluído'] }),
    activity({ id_atividade: '2', numero_wo: 'WO2', codigos_baixa: ['409 - Serviço concluído'] }),
    activity({ id_atividade: '3', contrato: 'C2', status_atividade: 'pendente' }),
  ], [technician]);
  assert.equal(row.atividades, 3);
  assert.equal(row.contratos, 2);
  assert.equal(row.contratos409, 1);
  assert.equal(row.porcentagem, 50);
  assert.equal(row.nome, technician.nome);
  assert.equal(row.supervisor, technician.supervisor);
});

test('separates repeated contracts on different dates and between technicians', () => {
  const rows = calculateTechnicianRanking([activity(), activity({ id_atividade: '2', data_atividade: '2026-10-15' }), activity({ id_atividade: '3', login_tecnico: 'Z200' })], [technician]);
  assert.equal(rows.find((row) => row.login === 'Z100').contratos, 2);
  assert.equal(rows.find((row) => row.login === 'Z200').contratos, 1);
});

test('the return type alone never attributes a return to its executor', () => {
  const [row] = calculateTechnicianRanking([activity({ tipo_atividade: 'Retorno Credenciada' }), activity({ id_atividade: '2', tipo_atividade: 'Retorno Credenciada', contrato: null })], [technician]);
  assert.equal(row.contratos, 1);
  assert.equal(row.retornosCredenciados, 0);
  assert.equal(row.detalhes[0].retornoCredenciada, true);
});

const storedReturn = (fields = {}) => ({ id: 'db1', contrato: 'C1', data_atividade: '2026-10-14', numero_os: 'WO1',
  cidade: 'RECIFE', tipo_atividade: 'Retorno Credenciada', is_revisita: true, ofensor_revisita: technician.nome, ...fields });
const executor = { ...technician, login: 'Z200', nome: 'TECNICO DO RETORNO', supervisor: 'SUPERVISOR B' };
const returnActivity = (fields = {}) => activity({ login_tecnico: executor.login, recurso: executor.nome, tipo_atividade: 'Retorno Credenciada', ...fields });

test('attributes the return to the trigger offender even without a current-period installation', () => {
  const activities = [returnActivity()];
  const returns = resolveRankingReturns(activities, [storedReturn()]);
  const rows = calculateTechnicianRanking(activities, [technician, executor], false, returns);
  const previous = rows.find(row => row.login === 'Z100'), current = rows.find(row => row.login === 'Z200');
  assert.equal(previous.retornosCredenciados, 1);
  assert.equal(previous.contratos, 0);
  assert.equal(previous.porcentagem, null);
  assert.equal(current.retornosCredenciados, 0);
  assert.equal(current.contratos, 1);
  assert.deepEqual(previous.retornosDetalhes[0].atendentes, [executor.nome]);
  assert.equal(previous.supervisor, 'SUPERVISOR A');
});

test('deduplicates return tasks on one day and follows a new offender on a later return', () => {
  const activities = [returnActivity(), returnActivity({ id_atividade: '2' }), returnActivity({ id_atividade: '3', data_atividade: '2026-10-15' })];
  const returns = resolveRankingReturns(activities, [storedReturn(), storedReturn({ id: 'db2', data_atividade: '2026-10-15', ofensor_revisita: executor.nome })]);
  assert.equal(returns.length, 2);
  const rows = calculateTechnicianRanking(activities, [technician, executor], false, returns);
  assert.equal(rows.find(row => row.login === 'Z100').retornosCredenciados, 1);
  assert.equal(rows.find(row => row.login === 'Z200').retornosCredenciados, 1);
  assert.equal(rows.find(row => row.login === 'Z200').contratos, 2);
});

test('keeps technical-visit revisits out of the accredited-return metric', () => {
  assert.equal(resolveRankingReturns([activity({ tipo_atividade: 'Visita Técnica' })], [storedReturn({ tipo_atividade: 'Visita Técnica' })]).length, 0);
  const [unresolved] = resolveRankingReturns([returnActivity()], [storedReturn({ tipo_atividade: 'Visita Técnica' })]);
  assert.equal(unresolved.ofensor, null);
  assert.match(unresolved.pendencia, /não localizado/);
});

test('missing or conflicting attribution stays pending rather than using the current technician', () => {
  for (const records of [[], [storedReturn({ is_revisita: false })], [storedReturn({ ofensor_revisita: null })],
    [storedReturn(), storedReturn({ id: 'db2', ofensor_revisita: executor.nome })]]) {
    const returns = resolveRankingReturns([returnActivity()], records);
    assert.equal(returns[0].ofensor, null);
    assert.ok(returns[0].pendencia);
    const rows = calculateTechnicianRanking([returnActivity()], [technician, executor], false, returns);
    assert.equal(rows.reduce((sum,row)=>sum+row.retornosCredenciados,0),0);
  }
});

test('matches the exact contract/date/WO/city and does not borrow an offender from another return', () => {
  for (const change of [{ contrato:'OTHER' }, { data_atividade:'2026-10-13' }, { numero_os:'OTHER' }, { cidade:'NATAL' }]) {
    assert.equal(resolveRankingReturns([returnActivity()], [storedReturn(change)])[0].ofensor, null);
  }
  assert.equal(resolveRankingReturns([returnActivity()], [storedReturn({ cidade:'Recife/PE' })])[0].ofensor, technician.nome);
});

test('an offender absent from the registry is visible without guessing a login or supervisor', () => {
  const activities=[returnActivity()];
  const returns=resolveRankingReturns(activities, [storedReturn({ ofensor_revisita:'TECNICO ANTERIOR SEM CADASTRO' })]);
  const rows=calculateTechnicianRanking(activities,[executor],false,returns);
  const previous=rows.find(row=>row.nome==='TECNICO ANTERIOR SEM CADASTRO');
  assert.equal(previous.retornosCredenciados,1);
  assert.equal(previous.login,'Não informado');
  assert.equal(previous.supervisor,'Não cadastrado');
  assert.equal(rows.find(row=>row.login==='Z200').retornosCredenciados,0);
});

test('editing a display name preserves the offender identity through an exact source login', () => {
  const activities=[activity({ recurso:technician.nome, contrato:'INSTALLATION' }),returnActivity()];
  const returns=resolveRankingReturns(activities,[storedReturn()]);
  const renamed={...technician,nome:'NOVO NOME COMPLETO DO TECNICO'};
  const rows=calculateTechnicianRanking(activities,[renamed,executor],false,returns);
  const original=rows.find(row=>row.login==='Z100');
  assert.equal(original.nome,renamed.nome);
  assert.equal(original.retornosCredenciados,1);
  assert.equal(original.contratos,1);
  assert.equal(rows.length,2);
});

test('does not confuse 409 with 4090 or other codes', () => {
  assert.equal(hasCode409(['4090', '1409', '430 - Retirado']), false);
  assert.equal(hasCode409(['409 - CONCLUÍDO']), true);
});

test('an unmapped login stays visible and an empty technician has no percentage base', () => {
  const rows = calculateTechnicianRanking([activity({ login_tecnico: 'Z200' })], [technician], true);
  assert.equal(rows.find((row) => row.login === 'Z200').supervisor, 'Não cadastrado');
  assert.equal(rows.find((row) => row.login === 'Z100').porcentagem, null);
  const changed = calculateTechnicianRanking([activity()], [{ ...technician, supervisor: 'SUPERVISOR B' }]);
  assert.equal(changed[0].supervisor, 'SUPERVISOR B');
});

const headers = ['Recurso', 'Login do Técnico', 'Data', 'Contrato', 'Status da Atividade', 'ID da Atividade', 'Tipo de Atividade', 'Tipo de Atividade', 'Cód de Baixa 1', 'Cód de Baixa 2', 'Credenciada/parceira anterior'];
const sourceRow = ['NOME', 'Z100', '14/10/26', 'C1', 'concluído', '100', 'Normal', 'Retorno Credenciada', '430 - RETIRADO', '409 - CONCLUÍDO', 'PARCEIRA'];

test('imports duplicate type headers, all task codes, and Brazilian dates without dropping rows', () => {
  const [row] = parseRankingActivities([headers, sourceRow]);
  assert.equal(row.tipo_atividade, 'Retorno Credenciada');
  assert.equal(row.data_atividade, '2026-10-14');
  assert.deepEqual(row.codigos_baixa, ['430 - RETIRADO', '409 - CONCLUÍDO']);
  assert.throws(() => parseRankingActivities([headers, sourceRow, sourceRow]), /aparece mais de uma vez/);
  assert.throws(() => parseRankingActivities([headers, sourceRow.map((value, index) => index === 2 ? '31/02/2026' : value)]), /Data inválidos/);
});

test('normalizes city/UF, preserves logins, and rejects duplicate registrations', () => {
  const header = ['Login', 'Nome', 'Cidade', 'Supervisor'];
  const row = ['z100', 'NOME COMPLETO', 'Recife/PE', 'supervisor'];
  assert.deepEqual(parseRankingTechnicians([header, row]), [{ login: 'Z100', nome: 'NOME COMPLETO', cidade: 'RECIFE', supervisor: 'SUPERVISOR' }]);
  assert.throws(() => parseRankingTechnicians([header, row, row]), /aparece mais de uma vez/);
});
