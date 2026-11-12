import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { parseGatilhosWorkbook, prepareGatilhosImport, validateGatilhosImportBatch } from '../src/utils/gatilhosImport.ts';

const headers = ['Id', 'Valor', 'Valor Instalador', 'Valor Auxiliar', 'Valor Deslocamento'];
const file = (name, data, options = {}) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([options.headers || headers, ...data]), options.sheet || 'Comiss.Sintético');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ['IGNORAR', 99999, 99999, 0, 0]]), 'Outra aba');
  return new File([XLSX.write(workbook, { type: 'buffer', bookType: name.endsWith('.xls') ? 'biff8' : 'xlsx' })], name);
};

test('four city files produce one combined batch without summing or overwriting IDs', async () => {
  const files = ['gatilhoNTL.xlsx', 'gatilhosFTZ.xlsx', 'gatilhosMRO.xlsx', 'gatilhoPE.xlsx'].map((name, index) => file(name, [[100 + index, 1000 + index, 100 + index, 20, 0]]));
  const batch = await prepareGatilhosImport(files);
  assert.deepEqual(batch.rows.map((row) => row.id_externo), ['100', '101', '102', '103']);
  assert.deepEqual(batch.rows.map((row) => row.valor), [1000, 1001, 1002, 1003]);
  assert.equal(batch.arquivoNome, files.map((file) => file.name).join(' | '));
  assert.ok(batch.rows.every((row) => !('valor_ajustado' in row) && !('colaborador_id' in row)));
});

test('single-file imports preserve Brazilian monetary values, zeros and leading-zero IDs', async () => {
  const batch = await prepareGatilhosImport([file('unico.xlsx', [['000123', 'R$ 8.543,19', '1.234,50', '0,00', 0], ['456.0', 9000, 50, 20, '15,25']])]);
  assert.deepEqual(batch.rows, [
    { id_externo: '000123', valor: 8543.19, valor_instalador: 1234.5, valor_auxiliar: 0, valor_deslocamento: 0 },
    { id_externo: '456', valor: 9000, valor_instalador: 50, valor_auxiliar: 20, valor_deslocamento: 15.25 },
  ]);
  assert.equal(batch.arquivoNome, 'unico.xlsx');
});

test('legacy XLS and normalized sheet/header labels are accepted', async () => {
  const data = await parseGatilhosWorkbook(file('legado.xls', [[12, 50, 40, 10, 0]], {
    sheet: 'COMISS SINTETICO', headers: ['ID', 'VALOR', 'VALOR INSTALADOR', 'VALOR AUXILIAR', 'VALOR DESLOCAMENTO'],
  }));
  assert.equal(data.length, 1); assert.equal(data[0].id_externo, '12'); assert.equal(data[0].valor, 50);
});

test('all copies of conflicting IDs are excluded while valid rows in the same files remain ready', async () => {
  const batch = await prepareGatilhosImport([file('natal.xlsx', [[100, 8000], [101, 5000]]), file('recife.xlsx', [[100, 9000], [102, 6000]])]);
  assert.deepEqual(batch.rows.map((row) => row.id_externo), ['101', '102']);
  assert.deepEqual(batch.conflitos, [{ idExterno: '100', nomes: [], arquivos: ['natal.xlsx', 'recife.xlsx'], ocorrencias: 2 }]);
  assert.equal(batch.totalArquivosAceitos, 2);
  assert.throws(() => validateGatilhosImportBatch(batch, false), /Confirme/);
  assert.doesNotThrow(() => validateGatilhosImportBatch(batch, true));
});

test('identical duplicate rows across files are not silently deduplicated or added together', async () => {
  const repeated = file('repetido.xlsx', [[100, 8000]]);
  const batch = await prepareGatilhosImport([repeated, repeated]);
  assert.equal(batch.rows.length, 0); assert.equal(batch.conflitos[0].ocorrencias, 2);
  assert.throws(() => validateGatilhosImportBatch(batch, true), /Nenhum ID sem conflito/);
});

test('duplicate IDs inside a file are detected after numeric normalization without losing unrelated rows', async () => {
  const batch = await prepareGatilhosImport([file('duplicado.xlsx', [[123, 8000], ['123.0', 9000], [124, 7000]])]);
  assert.deepEqual(batch.rows.map((row) => row.id_externo), ['124']);
  assert.deepEqual(batch.conflitos[0], { idExterno: '123', nomes: [], arquivos: ['duplicado.xlsx'], ocorrencias: 2 });
});

test('malformed files are reported without blocking preparation of other valid files', async () => {
  const batch = await prepareGatilhosImport([file('valido.xlsx', [[100, 8000]]), file('aba-incorreta.xlsx', [[200, 9000]], { sheet: 'Dados' })]);
  assert.equal(batch.rows.length, 1); assert.equal(batch.falhas[0].arquivo, 'aba-incorreta.xlsx');
  assert.match(batch.falhas[0].motivo, /aba "Comiss.Sintético" não foi encontrada/);
  assert.equal(batch.arquivoNome, 'valido.xlsx'); assert.equal(batch.totalArquivosAceitos, 1);
  assert.throws(() => validateGatilhosImportBatch(batch, false), /Confirme/);
});

test('missing columns and empty workbooks show the offending filename', async () => {
  const batch = await prepareGatilhosImport([file('sem-colunas.xlsx', [[100, 8000]], { headers: ['Id', 'Valor'] }), file('vazio.xlsx', [])]);
  assert.deepEqual(batch.falhas.map((failure) => failure.arquivo), ['sem-colunas.xlsx', 'vazio.xlsx']);
  assert.match(batch.falhas[0].motivo, /colunas esperadas/); assert.match(batch.falhas[1].motivo, /Nenhum resultado válido/);
  assert.equal(batch.rows.length, 0);
});

test('empty selection and unsupported file types are rejected before reading', async () => {
  await assert.rejects(prepareGatilhosImport([]), /Selecione pelo menos um arquivo/);
  let read = false;
  const batch = await prepareGatilhosImport([{ name: 'invalido.csv', arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } }]);
  assert.equal(batch.falhas[0].arquivo, 'invalido.csv'); assert.match(batch.falhas[0].motivo, /.xlsx ou .xls/);
  assert.equal(read, false);
});

test('file read failures include the filename', async () => {
  const batch = await prepareGatilhosImport([{ name: 'ilegivel.xlsx', arrayBuffer: async () => { throw new Error('Falha de leitura'); } }]);
  assert.deepEqual(batch.falhas, [{ arquivo: 'ilegivel.xlsx', motivo: 'Falha de leitura' }]);
});

test('the 5000-ID RPC limit applies to the whole batch, not to each individual file', async () => {
  const first = file('parte-1.xlsx', Array.from({ length: 2500 }, (_, index) => [index + 1, 1]));
  const second = file('parte-2.xlsx', Array.from({ length: 2500 }, (_, index) => [index + 2501, 2]));
  assert.equal((await prepareGatilhosImport([first, second])).rows.length, 5000);
  await assert.rejects(prepareGatilhosImport([first, second, file('excesso.xlsx', [[5001, 3]])]), /limite de 5000 IDs/);
});

test('the selected file list is snapshotted before asynchronous parsing starts', async () => {
  const first = file('primeiro.xlsx', [[1, 10]]), second = file('segundo.xlsx', [[2, 20]]);
  let unblock;
  const pending = new Promise((resolve) => { unblock = resolve; });
  const files = [{ name: first.name, arrayBuffer: async () => { await pending; return first.arrayBuffer(); } }, second];
  const result = prepareGatilhosImport(files);
  files.pop(); unblock();
  const batch = await result;
  assert.equal(batch.rows.length, 2); assert.equal(batch.arquivoNome, 'primeiro.xlsx | segundo.xlsx');
});

test('conflict names come only from collaborators linked to that exact ID, with both duo members', async () => {
  const link = (id, person, name, papel = 'INSTALADOR') => ({ id, id_externo: '100', colaborador_id: person, papel, colaborador: { id: person, nome: name } });
  const links = [link('L2', 'C2', 'AUXILIAR NOME COMPLETO', 'AUXILIAR'), link('L1', 'C1', 'INSTALADOR NOME COMPLETO'), link('L3', 'C1', 'INSTALADOR NOME COMPLETO'),
    { ...link('WRONG', 'C3', 'OUTRO TECNICO'), id_externo: '200' }, { ...link('MISMATCH', 'C4', 'NAO EMPRESTAR'), colaborador_id: 'C5' }];
  const batch = await prepareGatilhosImport([file('a.xlsx', [[100, 1], [300, 2]]), file('b.xlsx', [[100, 3], [300, 4]])], links);
  assert.deepEqual(batch.conflitos[0].nomes, ['INSTALADOR NOME COMPLETO', 'AUXILIAR NOME COMPLETO']);
  assert.deepEqual(batch.conflitos[1].nomes, []);
});

test('all conflicts are reported, and files contributing only conflicts are absent from the accepted source audit', async () => {
  const batch = await prepareGatilhosImport([file('a.xlsx', [[1, 10], [2, 20]]), file('b.xlsx', [[1, 11], [2, 21]]), file('c.xlsx', [[1, 12], [3, 30]])]);
  assert.deepEqual(batch.conflitos.map((conflict) => [conflict.idExterno, conflict.ocorrencias]), [['1', 3], ['2', 2]]);
  assert.deepEqual(batch.rows.map((row) => row.id_externo), ['3']);
  assert.equal(batch.arquivoNome, 'c.xlsx'); assert.equal(batch.totalArquivosAceitos, 1);
});

test('confirmation does not allow a conflicting ID to be reinserted into the outgoing rows', async () => {
  const batch = await prepareGatilhosImport([file('a.xlsx', [[1, 10], [2, 20]]), file('b.xlsx', [[1, 11]])]);
  batch.rows.push({ ...batch.rows[0], id_externo: '1' });
  assert.throws(() => validateGatilhosImportBatch(batch, true), /IDs vazios ou repetidos/);
});
