// Requires a local Vite server. All Supabase HTTP and WebSocket traffic is mocked.
// node tests/gatilhosClosure.browser.mjs <playwright-module> <optional-screenshot-directory>
import assert from 'node:assert/strict';
import { buildLiveGatilhosRanking } from '../src/utils/gatilhosHistory.ts';
import * as XLSX from 'xlsx';

const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
await context.routeWebSocket('**/*.supabase.co/**', (ws) => ws.close());
const admin = '00000000-0000-0000-0000-000000000001';
const profile = { id: admin, email: 'qa@example.invalid', display_name: 'Admin QA', approved: true, role: 'admin' };
const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: admin, role: 'authenticated', exp: 4102444800 })}.cWE`;
await context.addInitScript(({ token, profile }) => {
  localStorage.setItem('sb-lsxjqzrhgznhopqyapoc-auth-token', JSON.stringify({
    access_token: token, refresh_token: 'test-only', token_type: 'bearer', expires_at: 4102444800,
    user: { id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated' },
  }));
  localStorage.setItem('technet-sidebar-collapsed', 'true');
}, { token, profile });
const member = { id: 'C1', nome: 'TECNICO ORIGINAL', cpf: '00000000191', setor: 'INSTALACAO' };
const assistant = { id: 'C2', nome: 'AUXILIAR ORIGINAL', cpf: '00000000272', setor: 'AUXILIAR' };
const result = { id_externo: '100', periodo_inicio: '2026-10-01', periodo_fim: '2026-10-31', valor: 8543.19,
  valor_ajustado: 9000, valor_instalador: 100, valor_auxiliar: 20, valor_deslocamento: 0 };
const link = { id: 'L1', id_externo: '100', colaborador_id: member.id, colaborador: member, papel: 'INSTALADOR', tipo: 'DUPLA', cidade: 'RECIFE' };
const state = { resultados: [{ ...result, periodo_inicio: '2026-11-01', periodo_fim: '2026-11-30' }, result],
  vinculos: [link, { ...link, id: 'L2', colaborador_id: assistant.id, colaborador: assistant, papel: 'AUXILIAR' }],
  faixas: [{ id: 'F1', tipo: 'DUPLA', nivel: 1, pontos: 8000, premio: 300 }, { id: 'F2', tipo: 'DUPLA', nivel: 2, pontos: 9000, premio: 400 },
    { id: 'F3', tipo: 'INDIVIDUAL_CARRO', nivel: 1, pontos: 8000, premio: 700 }], colaboradores: [member, assistant], tecnicosFrente: [] };
let closures = [], snapshots = [], missingMigration = false, brokenSnapshot = false, closureDenied = false, closeCalls = 0;
await context.route('https://**/*.supabase.co/**', async (route) => {
  const url = new URL(route.request().url());
  let body = [], status = 200;
  if (url.pathname.endsWith('/profiles')) body = profile;
  else if (url.pathname.endsWith('/gatilhos_fechamentos')) {
    body = closures;
    if (missingMigration) { status = 404; body = { code: 'PGRST205', message: 'Missing migration' }; }
    if (closureDenied) { status = 403; body = { code: '42501', message: 'Permission denied loading closures' }; }
  } else if (url.pathname.endsWith('/gatilhos_resultados_fechados')) {
    body = brokenSnapshot ? [] : snapshots.filter((row) => `eq.${row.periodo_inicio}` === url.searchParams.get('periodo_inicio'));
  } else if (url.pathname.endsWith('/gatilhos_resultados')) body = state.resultados;
  else if (url.pathname.endsWith('/gatilhos_vinculos')) body = state.vinculos;
  else if (url.pathname.endsWith('/gatilhos_faixas')) body = state.faixas;
  else if (url.pathname.endsWith('/colaboradores_cadastrados')) body = state.colaboradores;
  else if (url.pathname.endsWith('/fechar_periodo_gatilhos')) {
    closeCalls++;
    const period = route.request().postDataJSON().p_periodo_inicio;
    const ranking = buildLiveGatilhosRanking(state, period);
    const closure = { periodo_inicio: period, periodo_fim: ranking[0].periodo_fim, total_ids: ranking.length,
      fechado_em: '2026-11-05T15:00:00Z', fechado_por: admin, faixas: structuredClone(state.faixas) };
    closures.push(closure);
    snapshots.push(...structuredClone(ranking.map((resultado) => ({ periodo_inicio: period,
      id_externo: resultado.id_externo, resultado, vinculos: state.vinculos.filter((v) => v.id_externo === resultado.id_externo) }))));
    body = closure;
  }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await context.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const selectPeriod = async (month) => {
  await page.getByRole('combobox', { name: 'Período dos gatilhos' }).click();
  await page.getByRole('option', { name: new RegExp(`01/${month}/2026 até`) }).click();
};
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the expected UI state');
};
try {
  await page.goto('http://127.0.0.1:8080/gatilhos');
  await page.getByRole('button', { name: 'Fechar período', exact: true }).waitFor();
  await selectPeriod('10');
  await page.getByRole('button', { name: 'Fechar período', exact: true }).click();
  await page.getByRole('alertdialog').waitFor();
  assert.match(await page.getByRole('alertdialog').innerText(), /todos os 1 IDs/);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(closeCalls, 0);
  await page.getByRole('button', { name: 'Fechar período', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar fechamento' }).click();
  await page.getByText(/Fechado em .*Somente leitura/).waitFor();
  await page.getByText('TECNICO ORIGINAL / AUXILIAR ORIGINAL', { exact: true }).waitFor();
  assert.equal(closeCalls, 1);
  assert.equal(await page.getByRole('button', { name: /Editar pontuação/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Exportar relatório', exact: true }).isEnabled(), true);

  state.vinculos = [{ ...link, tipo: 'INDIVIDUAL_CARRO', cidade: 'FORTALEZA', colaborador: { ...member, nome: 'TECNICO NOVO', cpf: '11111111111', setor: 'NOVO SETOR' } }];
  state.faixas.forEach((faixa) => { faixa.premio = 999; });
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('TECNICO ORIGINAL / AUXILIAR ORIGINAL', { exact: true }).waitFor();
  assert.equal(await page.getByText('TECNICO NOVO', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Faixas de Premiação', exact: true }).click();
  await page.locator('#premio-F2').waitFor();
  assert.equal(await page.locator('#premio-F2').inputValue(), '400');
  assert.equal(await page.locator('#premio-F2').getAttribute('readonly'), '');
  assert.equal(await page.getByRole('button', { name: 'Salvar', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'IDs e Equipes', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Ranking', exact: true }).click();

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar relatório', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Excel', exact: true }).click();
  const download = await downloadEvent;
  const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const workbook = XLSX.read(Buffer.concat(chunks));
  const cells = Object.values(workbook.Sheets.Gatilhos).filter((cell) => cell && typeof cell === 'object').map((cell) => cell.v);
  assert.ok(cells.includes('TECNICO ORIGINAL')); assert.ok(cells.includes('AUXILIAR ORIGINAL'));
  assert.ok(cells.includes('000.000.001-91')); assert.ok(cells.includes('INSTALACAO')); assert.ok(cells.includes(400));
  assert.ok(!cells.includes('TECNICO NOVO')); assert.ok(!cells.includes('NOVO SETOR'));

  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/gatilhos-fechado-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('main').getBoundingClientRect().left === 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.argv[3]) await page.screenshot({ path: `${process.argv[3]}/gatilhos-fechado-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // The importer remains available for another month, even when viewing a closed period.
  await page.getByRole('button', { name: 'Importar Excel', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await selectPeriod('11');
  await page.getByText('TECNICO NOVO', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Editar pontuação/ }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Fechar período', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Faixas de Premiação', exact: true }).click();
  assert.equal(await page.locator('#premio-F2').inputValue(), '999');
  assert.equal(await page.locator('#premio-F2').getAttribute('readonly'), null);

  brokenSnapshot = true;
  await selectPeriod('10');
  await page.getByText(/retrato do período fechado está incompleto/).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Exportar relatório', exact: true }).count(), 0);
  brokenSnapshot = false;
  closureDenied = true;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText('Permission denied loading closures', { exact: true }).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  closureDenied = false;
  missingMigration = true;
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await page.getByText(/Não foi possível verificar os fechamentos/).waitFor();
  assert.equal(await page.getByRole('table').count(), 0);
  // A legacy database without any known closures remains usable, with an explicit warning.
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Fechamento indisponível' }).waitFor();
  await waitFor(() => page.getByRole('button', { name: 'Fechar período', exact: true }).isDisabled());
  assert.equal(await page.getByRole('button', { name: 'Fechar período', exact: true }).isDisabled(), true);
  assert.deepEqual(failures, []);
  console.log('Browser checks passed: manual close, frozen teams/awards/export, new-month editing, responsive layout and fail-closed errors.');
} finally {
  await browser.close();
}
