import { jsPDF } from 'jspdf';
import { groupTechnicianRankingReport } from './technicianRankingReportData.ts';
import type { TechnicianRankingReport } from './technicianRankingReportData.ts';

type Align = 'left' | 'center' | 'right';
interface Painter {
  rect: (x: number, y: number, width: number, height: number, color: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number, color: string) => void;
  text: (value: string, x: number, y: number, size: number, color: string, bold?: boolean, align?: Align) => void;
  wrap: (value: string, width: number, size: number, bold?: boolean) => string[];
}
interface PreparedRow { lines: string[][]; height: number; position: number; percentage?: number | null }
interface TablePage { rows: PreparedRow[] }
export interface RankingReportImageDownload { supervisor: string; filename: string; url: string }

const WIDTH = 1600;
const HEIGHT = 1131;
const MARGIN = 48;
const TABLE_WIDTH = WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 52;
const TABLE_TITLE_SPACE = 24;
const DARK = '#17212b';
const MUTED = '#64748b';
const RED = '#e31325';
const NUMBER = new Intl.NumberFormat('pt-BR');
const widths = [64, 116, 376, 96, 112, 132, 150, 218, 240];
const headers = ['#', 'Login', 'Nome', 'Contratos', 'Contratos 409', '% 409', 'Retorno credenciados', 'Cidade', 'Supervisor'];
const formatDate = (date: string) => date.split('-').reverse().join('/');
const formatTime = (date: string) => new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const percentage = (value: number | null) => value === null ? '-' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const wrapText = (value: string, width: number, measure: (value: string) => number) => {
  const lines: string[] = [];
  let current = '';
  for (const word of value.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= width) { current = candidate; continue; }
    if (current) lines.push(current);
    current = '';
    for (const char of word) {
      if (current && measure(current + char) > width) { lines.push(current); current = ''; }
      current += char;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const pdfPainter = (pdf: jsPDF): Painter => {
  const scale = 297 / WIDTH;
  const font = (size: number, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size * scale * 72 / 25.4); };
  return {
    rect: (x, y, width, height, color) => { pdf.setFillColor(color); pdf.rect(x * scale, y * scale, width * scale, height * scale, 'F'); },
    line: (x1, y1, x2, y2, color) => { pdf.setDrawColor(color); pdf.setLineWidth(0.15); pdf.line(x1 * scale, y1 * scale, x2 * scale, y2 * scale); },
    text: (value, x, y, size, color, bold = false, align = 'left') => { font(size, bold); pdf.setTextColor(color); pdf.text(value, x * scale, y * scale, { align }); },
    wrap: (value, width, size, bold = false) => { font(size, bold); return wrapText(value, width, (text) => pdf.getTextWidth(text) / scale); },
  };
};
const canvasPainter = (context: CanvasRenderingContext2D): Painter => {
  const font = (size: number, bold = false) => { context.font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`; };
  return {
    rect: (x, y, width, height, color) => { context.fillStyle = color; context.fillRect(x, y, width, height); },
    line: (x1, y1, x2, y2, color) => { context.strokeStyle = color; context.lineWidth = 1; context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke(); },
    text: (value, x, y, size, color, bold = false, align = 'left') => { font(size, bold); context.fillStyle = color; context.textAlign = align; context.fillText(value, x, y); },
    wrap: (value, width, size, bold = false) => { font(size, bold); return wrapText(value, width, (text) => context.measureText(text).width); },
  };
};

const filterSummary = (report: TechnicianRankingReport) => {
  const filters = report.filters;
  return [`Cidade: ${filters.city || 'Todas'}`, `Supervisor: ${filters.supervisor || 'Todos'}`,
    `Busca: ${filters.search || 'Sem busca'}`, `Ordem: ${filters.sortLabel}`].join('  |  ');
};
const footerLines = (painter: Painter, report: TechnicianRankingReport) => [
  'Fonte: Ranking técnico do Sistema de Gestão. Retornos atribuídos ao técnico anterior no histórico de revisitas da instalação.',
  'Contrato contado por técnico/data. % 409 = contratos 409 / contratos. Retornos não incluem revisitas de Visita Técnica.',
  `Última carga no período: ${report.lastImport ? formatTime(report.lastImport) : 'Não informada'}`,
].flatMap((line) => painter.wrap(line, TABLE_WIDTH - 145, 13));
const footerHeight = (painter: Painter, report: TechnicianRankingReport) => 42 + footerLines(painter, report).length * 18;

const headerHeight = (painter: Painter, report: TechnicianRankingReport) => {
  return 150 + painter.wrap(filterSummary(report), TABLE_WIDTH, 16).length * 21 + 14 + 104 + 16;
};

function drawHeader(painter: Painter, report: TechnicianRankingReport) {
  painter.rect(0, 0, WIDTH, 6, RED);
  painter.text('TechNET  /  SISTEMA DE GESTÃO', MARGIN, 40, 17, RED, true);
  painter.text(`Gerado em ${formatTime(report.generatedAt)}`, WIDTH - MARGIN, 40, 14, MUTED, false, 'right');
  painter.text('Ranking técnico', MARGIN, 84, 32, DARK, true);
  painter.text(`${formatDate(report.filters.startDate)} a ${formatDate(report.filters.endDate)}  |  ${NUMBER.format(report.totals.technicians)} ${report.totals.technicians === 1 ? 'técnico' : 'técnicos'}`, MARGIN, 116, 18, MUTED);
  const filters = painter.wrap(filterSummary(report), TABLE_WIDTH, 16);
  filters.forEach((line, index) => painter.text(line, MARGIN, 150 + index * 21, 16, DARK));
  let y = 150 + filters.length * 21 + 14;
  painter.rect(MARGIN, y, TABLE_WIDTH, 84, '#f6f8fa');
  const kpis = [['Contratos', NUMBER.format(report.totals.contracts)], ['Contratos 409', NUMBER.format(report.totals.code409)],
    ['% 409', percentage(report.totals.percentage)], ['Retorno credenciados', NUMBER.format(report.totals.returns)]];
  kpis.forEach(([label, value], index) => {
    const x = MARGIN + index * TABLE_WIDTH / kpis.length;
    painter.text(label, x + 16, y + 25, 15, MUTED, true);
    painter.text(value, x + 16, y + 62, 32, DARK, true);
    if (index > 0) painter.line(x, y + 14, x, y + 70, '#dce3e9');
  });
  y += 104;
  return y + 16;
}

function prepareRows(painter: Painter, report: TechnicianRankingReport): PreparedRow[] {
  const cells = report.rows.map((row) => [String(row.position), row.login, row.nome,
    NUMBER.format(row.contratos), NUMBER.format(row.contratos409), percentage(row.porcentagem), NUMBER.format(row.retornosCredenciados), row.cidade, row.supervisor]);
  return cells.map((values, index) => {
    const lines = values.map((value, column) => painter.wrap(value || '-', widths[column] - 24, 16, column === 2));
    return { lines, height: Math.max(44, Math.max(...lines.map((value) => value.length)) * 21 + 18),
      position: index + 1, percentage: report.rows[index].porcentagem };
  });
}

function drawTable(painter: Painter, page: TablePage, top: number) {
  painter.text('Ranking por supervisor', MARGIN, top, 22, DARK, true);
  let y = top + TABLE_TITLE_SPACE;
  painter.rect(MARGIN, y, TABLE_WIDTH, HEADER_HEIGHT, '#edf2f6');
  let x = MARGIN;
  headers.forEach((label, index) => {
    const lines = painter.wrap(label, widths[index] - 24, 14, true);
    lines.forEach((line, lineIndex) => painter.text(line, x + 12, y + (HEADER_HEIGHT - lines.length * 18) / 2 + 14 + lineIndex * 18, 14, MUTED, true));
    x += widths[index];
  });
  y += HEADER_HEIGHT;
  page.rows.forEach((row) => {
    painter.rect(MARGIN, y, TABLE_WIDTH, row.height, row.position % 2 === 0 ? '#f7f9fb' : '#ffffff');
    let left = MARGIN;
    row.lines.forEach((lines, column) => {
      const width = widths[column];
      let color = DARK;
      const isPercentage = column === 5;
      if (isPercentage && row.percentage !== null) {
        const value = row.percentage ?? 0;
        const background = value >= 80 ? '#ecfdf5' : value >= 50 ? '#fffbeb' : '#fff1f2';
        color = value >= 80 ? '#065f46' : value >= 50 ? '#92400e' : '#be123c';
        painter.rect(left, y, width, row.height, background);
        painter.rect(left + 12, y + row.height - 13, width - 24, 4, '#e4e8eb');
        painter.rect(left + 12, y + row.height - 13, (width - 24) * Math.max(0, Math.min(100, value)) / 100, 4, color);
      }
      const numeric = [0, 3, 4, 6].includes(column);
      lines.forEach((line, index) => painter.text(line, numeric ? left + width - 12 : left + 12,
        y + (row.height - lines.length * 21) / 2 + (isPercentage ? 13 : 16) + index * 21, 16, isPercentage && row.percentage === null ? MUTED : color,
        [2, 4, 5].includes(column), numeric ? 'right' : 'left'));
      left += width;
    });
    y += row.height;
    painter.line(MARGIN, y, WIDTH - MARGIN, y, '#e0e6ec');
  });
  return y;
}

function drawFooter(painter: Painter, report: TechnicianRankingReport, height: number, pageLabel: string) {
  const lines = footerLines(painter, report);
  painter.line(MARGIN, height - footerHeight(painter, report) + 10, WIDTH - MARGIN, height - footerHeight(painter, report) + 10, '#dce3e9');
  lines.forEach((line, index) => painter.text(line, MARGIN, height - 24 - (lines.length - 1 - index) * 18, 13, MUTED));
  painter.text(pageLabel, WIDTH - MARGIN, height - 24, 14, MUTED, false, 'right');
}

function paginate(rows: PreparedRow[], capacity: number): TablePage[] {
  const pages: TablePage[] = [];
  let current: PreparedRow[] = [], used = 0;
  rows.forEach((row) => {
    if (row.height > capacity) throw new Error('Um cadastro contém texto extenso demais para uma página de PDF. Revise o cadastro ou exporte em imagem.');
    if (current.length && used + row.height > capacity) { pages.push({ rows: current }); current = []; used = 0; }
    current.push(row); used += row.height;
  });
  if (current.length) pages.push({ rows: current });
  return pages;
}

export function createTechnicianRankingReportPdf(report: TechnicianRankingReport) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setProperties({ title: 'TechNET - Ranking técnico', subject: 'Contratos, código 409 e retornos por técnico', author: 'TechNET' });
  const painter = pdfPainter(pdf);
  const groups = groupTechnicianRankingReport(report);
  const pages = (groups.length ? groups : [report]).flatMap((group) => {
    const capacity = HEIGHT - footerHeight(painter, group) - 20 - headerHeight(painter, group) - TABLE_TITLE_SPACE - HEADER_HEIGHT;
    if (capacity < 44) throw new Error('Os filtros contêm texto extenso demais para uma página. Reduza a busca para gerar o relatório.');
    const tables = paginate(prepareRows(painter, group), capacity);
    return (tables.length ? tables : [{ rows: [] }]).map((table) => ({ table, group }));
  });
  pages.forEach(({table, group}, index) => {
    if (index) pdf.addPage();
    painter.rect(0, 0, WIDTH, HEIGHT, '#ffffff');
    const tableTop = drawHeader(painter, group);
    drawTable(painter, table, tableTop);
    drawFooter(painter, group, HEIGHT, `Página ${index + 1}/${pages.length}`);
  });
  return pdf;
}

export async function createTechnicianRankingReportPng(report: TechnicianRankingReport): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = WIDTH;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar a imagem do relatório.');
  const painter = canvasPainter(context);
  const top = headerHeight(painter, report);
  const ranking = prepareRows(painter, report);
  const height = Math.ceil(top + TABLE_TITLE_SPACE + HEADER_HEIGHT + ranking.reduce((sum, row) => sum + row.height, 0) + 28 + footerHeight(painter, report));
  if (height > 30000 || WIDTH * height > 60000000) throw new Error('O relatório é muito grande para uma única imagem. Exporte em PDF ou reduza os filtros.');
  canvas.height = height;
  painter.rect(0, 0, WIDTH, height, '#ffffff');
  drawHeader(painter, report);
  drawTable(painter, { rows: ranking }, top);
  drawFooter(painter, report, height, 'TechNET');
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível exportar a imagem.')), 'image/png'));
}

export async function downloadTechnicianRankingReport(report: TechnicianRankingReport, format: 'pdf' | 'png') {
  const filename = `ranking-tecnico-${report.filters.startDate}-${report.filters.endDate}`;
  if (format === 'pdf') { createTechnicianRankingReportPdf(report).save(`${filename}.pdf`); return []; }
  const images: RankingReportImageDownload[] = [];
  try {
    const groups = groupTechnicianRankingReport(report);
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index], blob = await createTechnicianRankingReportPng(group);
      const slug = group.filters.supervisor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'supervisor';
      images.push({ supervisor: group.filters.supervisor, filename: `${filename}-${String(index + 1).padStart(2, '0')}-${slug}.png`, url: URL.createObjectURL(blob) });
    }
    images.forEach((image) => { const link = document.createElement('a'); link.href = image.url; link.download = image.filename; link.click(); });
    return images;
  } catch (caught) { images.forEach((image) => URL.revokeObjectURL(image.url)); throw caught; }
}
