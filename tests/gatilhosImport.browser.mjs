// Uses the real page, hook and XLSX parser, with authentication and Supabase traffic mocked.
// node tests/gatilhosImport.browser.mjs <playwright-module> <optional-screenshot-directory> <optional-base-url>
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

const { chromium } = await import(process.argv[2] || 'playwright');
const baseUrl = process.argv[4] || 'http://127.0.0.1:8081';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.routeWebSocket('**/*.supabase.co/**', (ws) => ws.close());
// Keep the actual SDK, but point it at a same-origin fake API with no external network dependency.
await context.route('**/src/integrations/supabase/externalClient.ts*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `import { createClient } from '/node_modules/.vite/deps/@supabase_supabase-js.js';
    export const externalSupabase = createClient('${baseUrl}/mock-supabase', 'test-only-key');`,
}));
const admin = '00000000-0000-0000-0000-000000000001';
await context.route('**/src/contexts/AuthContext.tsx*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `export const AuthProvider = ({ children }) => children;
    export const useAuth = () => ({ user: { id: '${admin}' },
      profile: { id: '${admin}', email: 'qa@example.invalid', display_name: 'Admin QA', role: 'admin', approved: true },
      isAdmin: true, isApproved: true, isLoading: false, signOut: async () => {} });`,
}));
await context.addInitScript(() => {
  localStorage.setItem('technet-sidebar-collapsed', 'true');
});
const row = (id, fields = {}) => ({ id_externo: id, valor: 50, valor_instalador: 0, valor_auxiliar: 0, valor_deslocamento: 0,
  valor_ajustado: null, periodo_inicio: '2026-11-01', periodo_fim: '2026-11-11', importado_em: '2026-11-12T12:00:00Z', ...fields });
const oldClosed = row('100', { periodo_inicio: '2026-10-01', periodo_fim: '2026-10-31', valor: 123 });
const otherCity = row('999', { valor: 999 });
const records = [structuredClone(oldClosed), structuredClone(otherCity), row('100', { valor_ajustado: 9000 })];
const calls = [];
let hold = null, serverError = null;
await context.route('https://**', (route) => route.abort());
await context.route(`${baseUrl}/mock-supabase/**`, async (route) => {
  const url = new URL(route.request().url());
  let body = [], status = 200;
  if (url.pathname.endsWith('/profiles')) body = { id: admin, email: 'qa@example.invalid', display_name: 'Admin QA', role: 'admin', approved: true };
  else if (url.pathname.endsWith('/gatilhos_fechamentos')) body = [{ periodo_inicio: '2026-10-01', periodo_fim: '2026-10-31', fechado_em: '2026-11-01T12:00:00Z', fechado_por: admin, total_ids: 1, faixas: [] }];
  else if (url.pathname.endsWith('/gatilhos_resultados')) body = records;
  else if (url.pathname.endsWith('/gatilhos_vinculos')) body = [
    { id: 'L1', id_externo: '100', colaborador_id: 'C1', papel: 'INSTALADOR', tipo: 'DUPLA', cidade: 'RECIFE', colaborador: { id: 'C1', nome: 'INSTALADOR NOME COMPLETO' } },
    { id: 'L2', id_externo: '100', colaborador_id: 'C2', papel: 'AUXILIAR', tipo: 'DUPLA', cidade: 'RECIFE', colaborador: { id: 'C2', nome: 'AUXILIAR NOME COMPLETO' } },
  ];
  else if (url.pathname.endsWith('/substituir_gatilhos_resultados')) {
    const payload = route.request().postDataJSON();
    calls.push(payload);
    if (hold) await hold;
    if (serverError) { status = 400; body = { message: serverError }; }
    else {
      for (const imported of payload.p_dados) {
        let previous = records.find((item) => item.periodo_inicio === payload.p_periodo_inicio && item.id_externo === imported.id_externo);
        if (!previous) { previous = row(imported.id_externo); records.push(previous); }
        Object.assign(previous, imported, { periodo_inicio: payload.p_periodo_inicio, periodo_fim: payload.p_periodo_fim, arquivo_nome: payload.p_arquivo_nome });
      }
      body = payload.p_dados.length;
    }
  }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
const file = (name, id, sheet = 'Comiss.Sintético') => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Id', 'Valor', 'Valor Instalador', 'Valor Auxiliar', 'Valor Deslocamento'], [id, 1000, 100, 20, 0]]), sheet);
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(workbook, { type: 'buffer', bookType: name.endsWith('.xls') ? 'biff8' : 'xlsx' }) };
};
const files = ['gatilhoNTL.xlsx', 'gatilhosFTZ.xlsx', 'gatilhosMRO.xlsx', 'gatilhoPE.xlsx'].map((name, index) => file(name, 100 + index));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const dialog = page.getByRole('dialog');
const input = dialog.locator('input[type="file"]');
const submit = dialog.getByRole('button', { name: 'Atualizar carga', exact: true });
const open = async () => {
  await page.getByRole('button', { name: 'Importar Excel', exact: true }).click();
  await dialog.waitFor();
  await dialog.getByLabel('Data inicial', { exact: true }).fill('2026-11-01');
  await dialog.getByLabel('Data final', { exact: true }).fill('2026-11-11');
};
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error('Timed out waiting for an import request');
};
try {
  await page.goto(`${baseUrl}/gatilhos`);
  await page.getByRole('button', { name: 'Importar Excel', exact: true }).waitFor();
  await open();
  assert.equal(await input.getAttribute('multiple'), '');
  assert.equal(await submit.isDisabled(), true);
  await input.setInputFiles(files);
  await dialog.getByText('4 arquivos selecionados', { exact: true }).waitFor();
  await input.setInputFiles(file('extra.xlsx', 104));
  await dialog.getByText('5 arquivos selecionados', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Remover extra.xlsx', exact: true }).click();
  assert.equal(await dialog.getByRole('list', { name: 'Arquivos selecionados' }).locator('li').count(), 4);
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/gatilhos-multiplos-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
    return dialog && dialog.top >= 0 && dialog.bottom <= innerHeight;
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const submitBox = await submit.boundingBox();
  assert.ok(submitBox.y >= 0 && submitBox.y + submitBox.height <= 844);
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/gatilhos-multiplos-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });

  let release;
  hold = new Promise((resolve) => { release = resolve; });
  await submit.click();
  await waitFor(() => calls.length === 1);
  assert.equal(await dialog.getByRole('button', { name: 'Processando carga...', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByLabel('Data inicial', { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: 'Remover gatilhoNTL.xlsx', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
  assert.equal(records.find((item) => item.id_externo === '100' && item.periodo_inicio === '2026-11-01').valor, 50);
  const payload = calls[0];
  assert.deepEqual(payload.p_dados.map((item) => item.id_externo), ['100', '101', '102', '103']);
  assert.equal(payload.p_arquivo_nome, files.map((file) => file.name).join(' | '));
  assert.equal(payload.p_periodo_inicio, '2026-11-01'); assert.equal(payload.p_periodo_fim, '2026-11-11');
  assert.ok(payload.p_dados.every((item) => !('valor_ajustado' in item)));
  hold = null; release();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(calls.length, 1);
  assert.equal(records.find((item) => item.id_externo === '100' && item.periodo_inicio === '2026-11-01').valor_ajustado, 9000);
  assert.deepEqual(records.find((item) => item.id_externo === '999'), otherCity);
  assert.deepEqual(records.find((item) => item.periodo_inicio === '2026-10-01'), oldClosed);

  // More than four files are supported too.
  await open();
  assert.equal(await submit.isDisabled(), true);
  await input.setInputFiles(Array.from({ length: 5 }, (_, index) => file(`lote-${index}.xlsx`, 200 + index)));
  await submit.click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(calls.length, 2); assert.equal(calls[1].p_dados.length, 5);

  // A bad file does not prevent a user-confirmed import of the remaining records.
  await open();
  await input.setInputFiles([file('valido.xlsx', 300), file('aba-incorreta.xlsx', 301, 'Dados')]);
  await submit.click();
  const review = dialog.getByRole('region', { name: 'Revisão da importação' });
  const confirm = dialog.getByRole('button', { name: 'Enviar somente os válidos', exact: true });
  await review.getByText('aba-incorreta.xlsx', { exact: true }).waitFor();
  assert.equal(calls.length, 2); assert.equal(await dialog.isVisible(), true);
  assert.equal(await dialog.getByRole('list', { name: 'Arquivos selecionados' }).locator('li').count(), 2);
  await confirm.click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(calls.length, 3); assert.equal(calls[2].p_dados.length, 1);
  assert.equal(calls[2].p_arquivo_nome, 'valido.xlsx');

  await open();
  const mixed = [file('origem-1.xlsx', 100), file('origem-2.xlsx', 100), file('sem-conflito.xlsx', 401)];
  await input.setInputFiles(mixed);
  await submit.click(); await review.getByText('ID 100 · INSTALADOR NOME COMPLETO / AUXILIAR NOME COMPLETO', { exact: true }).waitFor();
  assert.equal(calls.length, 3);
  // Cancelling the review must not update anything.
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(calls.length, 3);
  await open(); await input.setInputFiles(mixed); await submit.click(); await review.waitFor();
  const beforeConflict = structuredClone(records.find((item) => item.id_externo === '100' && item.periodo_inicio === '2026-11-01'));
  await dialog.getByLabel('Data final', { exact: true }).fill('2026-11-12');
  await review.waitFor({ state: 'hidden' });
  await submit.click(); await review.waitFor();
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/gatilhos-conflitos-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/gatilhos-conflitos-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await confirm.click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(calls.length, 4); assert.deepEqual(calls[3].p_dados.map((item) => item.id_externo), ['401']);
  assert.equal(calls[3].p_arquivo_nome, 'sem-conflito.xlsx');
  assert.equal(calls[3].p_periodo_fim, '2026-11-12');
  assert.deepEqual(records.find((item) => item.id_externo === '100' && item.periodo_inicio === '2026-11-01'), beforeConflict);

  await open(); await input.setInputFiles([file('sem-vinculo-1.xlsx', 600), file('sem-vinculo-2.xlsx', 600)]);
  await submit.click(); await review.getByText('ID 600 · Sem colaborador vinculado a este ID', { exact: true }).waitFor();
  assert.equal(await confirm.isDisabled(), true); assert.equal(calls.length, 4);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

  // The existing closed-period guard blocks the whole batch before calling the RPC.
  await open(); await input.setInputFiles(files);
  await dialog.getByLabel('Data inicial', { exact: true }).fill('2026-10-01');
  await dialog.getByLabel('Data final', { exact: true }).fill('2026-10-31');
  await submit.click(); await page.getByText('Esse período está fechado e não permite alterações.', { exact: true }).waitFor();
  assert.equal(calls.length, 4);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();

  await open(); await input.setInputFiles([file('legado.xls', 500), file('novo.xlsx', 501)]);
  serverError = 'Carga rejeitada pelo banco de teste';
  await submit.click(); await page.getByText(serverError, { exact: true }).waitFor();
  assert.equal(calls.length, 5); assert.ok(!records.some((item) => item.id_externo === '500'));
  assert.equal(await dialog.isVisible(), true);
  serverError = null;
  await submit.click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(calls.length, 6); assert.ok(records.some((item) => item.id_externo === '500'));
  assert.deepEqual(errors, []);
  console.log('Multi-file browser checks passed: named conflicts, all copies skipped only after confirmation, invalid-file isolation, cancel/edit/zero-valid guards, unchanged conflicting records, single RPC and responsive layouts.');
} catch (error) {
  console.error('Browser state:', { url: page.url(), errors, body: (await page.locator('body').innerText()).slice(0, 1800) });
  throw error;
} finally { await browser.close(); }
