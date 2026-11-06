// Run against a local Vite server. The dashboard data is mocked; no database is accessed.
// node tests/productivityList.browser.mjs <playwright-module> <optional-screenshot-directory> <optional-base-url>
import assert from 'node:assert/strict';

const { chromium } = await import(process.argv[2] || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const screenshotDirectory = process.argv[3];
const baseUrl = process.argv[4] || 'http://127.0.0.1:8081';
const fixture = [];
for (let index = 1; index <= 177; index++) {
  const name = `TÉCNICO TESTE ${String(index).padStart(3, '0')}`;
  fixture.push(
    { Recurso: name, 'Tipo de Atividade': 'INSTALACAO', 'Status da Atividade': 'concluido', 'Cód de Baixa 1': index === 177 ? '' : '409 - SERVICO CONCLUIDO' },
    { Recurso: name, 'Tipo de Atividade': 'INSTALACAO', 'Status da Atividade': 'pendente' },
    { Recurso: name, 'Tipo de Atividade': 'INSTALACAO', 'Status da Atividade': 'cancelado', 'Cód de Baixa 1': '409 - SERVICO CONCLUIDO' },
    { Recurso: name, 'Tipo de Atividade': 'MUDANCA DE PACOTE', 'Status da Atividade': 'concluido', 'Cód de Baixa 1': index % 2 && index !== 177 ? '409 - SERVICO CONCLUIDO' : '' },
  );
}
fixture.push({ 'Tipo de Atividade': 'INSTALACAO', 'Status da Atividade': 'concluido', 'Cód de Baixa 1': '409 - SERVICO CONCLUIDO' });
await context.route('**/src/contexts/DashboardContext.tsx*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `import React from '/node_modules/.vite/deps/react.js';
    export function useDashboard() {
      const [filteredData, setData] = React.useState(${JSON.stringify(fixture)});
      window.__setProductivityData = setData;
      return { filteredData };
    }`,
}));
await context.route('**/src/main.tsx*', (route) => route.fulfill({
  contentType: 'application/javascript',
  body: `import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import '/src/index.css';
    import { ProductivitySection } from '/src/components/dashboard/ProductivitySection.tsx';
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main', {style: {padding: '24px'}}, React.createElement(ProductivitySection)));`,
}));
await context.route('https://**', (route) => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const table = page.getByRole('table');
const readRows = () => table.locator('tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.cells).map((cell) => cell.textContent)));
try {
  await page.goto(baseUrl);
  await page.getByRole('heading', { name: 'Produtividade técnica', exact: true }).waitFor();
  assert.equal(await page.getByText(/Top 5|Bottom 5|Pódio|Arraste para reordenar/).count(), 0);
  assert.deepEqual(await table.locator('thead th').allTextContents(), ['Técnico', 'OS produtivas', 'Total de OS', 'Produtividade']);
  let rows = await readRows();
  assert.equal(rows.length, 177);
  assert.ok(rows.every((row) => row.length === 4));
  assert.deepEqual(rows[0], ['TÉCNICO 001', '2', '4', '50.0%']);
  assert.deepEqual(rows.find((row) => row[0] === 'TÉCNICO 177'), ['TÉCNICO 177', '0', '4', '0.0%']);
  assert.ok(!rows.some((row) => row[0] === 'Não Informado'));
  const services = page.getByRole('list', { name: 'Produtividade por serviço', exact: true });
  assert.equal(await services.evaluate((list) => list.tagName), 'UL');
  assert.equal(await services.getByRole('button').count(), 2);
  const serviceNames = await services.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  assert.deepEqual(serviceNames, [
    'Filtrar serviço MUDANCA DE PACOTE; 49.7% de produtividade; 88 produtivas de 177 OS',
    'Filtrar serviço INSTALACAO; 33.3% de produtividade; 177 produtivas de 532 OS',
  ]);
  // The highest rate is the second pie slice, not the largest service volume.
  await services.getByRole('button').first().click();
  await page.getByText(/^Filtrando: MUDANCA DE PACOTE/).waitFor();
  assert.deepEqual((await readRows())[0], ['TÉCNICO 001', '1', '1', '100.0%']);
  assert.equal(await services.getByRole('button').first().getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Limpar seleção de serviço', exact: true }).click();
  assert.deepEqual((await readRows())[0], ['TÉCNICO 001', '2', '4', '50.0%']);
  await page.getByRole('combobox', { name: 'Ordenação da produtividade técnica' }).selectOption('name');
  rows = await readRows();
  assert.deepEqual(rows.slice(0, 3).map((row) => row[0]), ['TÉCNICO 001', 'TÉCNICO 002', 'TÉCNICO 003']);
  await page.getByRole('textbox', { name: 'Buscar técnico na produtividade' }).fill('tecnico 176');
  assert.deepEqual(await readRows(), [['TÉCNICO 176', '1', '4', '25.0%']]);
  await page.getByRole('textbox', { name: 'Buscar técnico na produtividade' }).fill('sem correspondencia');
  await page.getByText('Nenhum técnico encontrado para a busca.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Limpar busca de produtividade' }).click();
  assert.equal((await readRows()).length, 177);
  await page.waitForFunction(() => [...document.querySelectorAll('.recharts-pie-sector path')].some((path) => path.getAttribute('d')?.length > 50));
  if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/produtividade-tecnica-desktop.png`, fullPage: true });
  await table.locator('tbody tr').last().scrollIntoViewIfNeeded();
  assert.equal(await table.locator('tbody tr').last().isVisible(), true);

  const smaller = [
    { Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'INSTALACAO', 'Cód de Baixa 1': '409 - SERVICO CONCLUIDO' },
    { Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'MUDANCA DE PACOTE', 'Cód de Baixa 1': '409 - SERVICO CONCLUIDO' },
    { Recurso: 'TECNICO BETA', 'Tipo de Atividade': 'INSTALACAO', 'Status da Atividade': 'pendente' },
    { Recurso: 'TECNICO GAMA', 'Tipo de Atividade': 'MUDANCA DE PACOTE', 'Status da Atividade': 'pendente' },
  ];
  await page.evaluate((data) => window.__setProductivityData(data), smaller);
  await page.waitForFunction(() => document.querySelector('tbody')?.rows.length === 3);
  await page.locator('.recharts-pie-sector').first().dispatchEvent('click');
  await page.getByText(/^Filtrando: INSTALACAO/).waitFor();
  assert.equal(await services.getByRole('button', { name: /^Filtrar serviço INSTALACAO;/ }).getAttribute('aria-pressed'), 'true');
  rows = await readRows();
  assert.deepEqual(rows.map((row) => row[0]), ['TECNICO ALFA', 'TECNICO BETA']);
  assert.deepEqual(rows[0].slice(1), ['1', '1', '100.0%']);
  await page.getByText(/^Filtrando: INSTALACAO/).click();
  assert.equal((await readRows()).length, 3);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/produtividade-tecnica-mobile.png`, fullPage: true });
  await page.evaluate(() => window.__setProductivityData([
    { Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'SERVICO B', 'Cód de Baixa 1': '409' },
    { Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'SERVICO A', 'Cód de Baixa 1': '409' },
    { Recurso: 'TECNICO BETA', 'Tipo de Atividade': 'SERVICO B', 'Cód de Baixa 1': '409' },
    { Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'REFEIÇÃO', 'Cód de Baixa 1': '409' },
    { Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'NA BASE', 'Cód de Baixa 1': '409' },
  ]));
  await page.waitForFunction(() => document.querySelector('ul[aria-label="Produtividade por serviço"]')?.textContent.includes('SERVICO B'));
  assert.equal(await services.getByRole('button').count(), 2);
  assert.match(await services.getByRole('button').first().getAttribute('aria-label'), /^Filtrar serviço SERVICO B; 100.0%.*2 produtivas de 2 OS/);
  // Zero-productivity services remain visible; small and empty datasets are valid.
  await page.evaluate(() => window.__setProductivityData([{ Recurso: 'TECNICO ALFA', 'Tipo de Atividade': 'SERVICO SEM BAIXA', 'Status da Atividade': 'pendente' }]));
  await services.getByRole('button', { name: /^Filtrar serviço SERVICO SEM BAIXA; 0.0%/ }).waitFor();
  await page.evaluate(() => window.__setProductivityData([]));
  await page.getByText('Nenhum técnico com atividades nos filtros atuais.', { exact: true }).waitFor();
  await page.getByText('Nenhum serviço nos filtros atuais.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Productivity browser checks passed: 177 technicians; service productivity rates/order/tie-breaks; linked pie/service selection; preserved filters; zero/empty/excluded services; desktop/mobile.');
} finally { await browser.close(); }
