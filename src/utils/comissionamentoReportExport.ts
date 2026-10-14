import { jsPDF } from 'jspdf';
import { formatReportMonth } from './comissionamentoReportData.ts';
import type { CommissionReportData, CommissionReportRow } from './comissionamentoReportData.ts';

type Align = 'left' | 'center' | 'right';
interface Painter {
  rect: (x: number, y: number, width: number, height: number, color: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number, color: string) => void;
  text: (value: string, x: number, y: number, size: number, color: string, bold?: boolean, align?: Align) => void;
  wrap: (value: string, width: number, size: number, bold?: boolean) => string[];
}

const PAGE_WIDTH = 1600;
const PAGE_HEIGHT = 1131;
const MARGIN = 48;
const GAP = 32;
const DARK = '#17212b';
const MUTED = '#64748b';
const BLUE = '#4f7fa8';
const RED = '#e31325';
const NUMBER = new Intl.NumberFormat('pt-BR');

const wrapText = (value: string, width: number, measure: (value: string) => number) => {
  const lines: string[] = [];
  let current = '';
  for (const word of value.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= width) { current = candidate; continue; }
    if (current) lines.push(current);
    current = '';
    // Long unbroken logins and names must fit inside the label column too.
    for (const char of word) {
      if (current && measure(current + char) > width) { lines.push(current); current = ''; }
      current += char;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const pdfPainter = (pdf: jsPDF): Painter => {
  const scale = 297 / PAGE_WIDTH;
  const font = (size: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size * scale * 72 / 25.4);
  };
  return {
    rect: (x, y, width, height, color) => { pdf.setFillColor(color); pdf.rect(x * scale, y * scale, width * scale, height * scale, 'F'); },
    line: (x1, y1, x2, y2, color) => { pdf.setDrawColor(color); pdf.setLineWidth(0.15); pdf.line(x1 * scale, y1 * scale, x2 * scale, y2 * scale); },
    text: (value, x, y, size, color, bold = false, align = 'left') => {
      font(size, bold); pdf.setTextColor(color); pdf.text(value, x * scale, y * scale, { align });
    },
    wrap: (value, width, size, bold = false) => {
      font(size, bold);
      return wrapText(value, width, (text) => pdf.getTextWidth(text) / scale);
    },
  };
};

const canvasPainter = (context: CanvasRenderingContext2D): Painter => {
  const font = (size: number, bold = false) => { context.font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`; };
  return {
    rect: (x, y, width, height, color) => { context.fillStyle = color; context.fillRect(x, y, width, height); },
    line: (x1, y1, x2, y2, color) => {
      context.strokeStyle = color; context.lineWidth = 1; context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
    },
    text: (value, x, y, size, color, bold = false, align = 'left') => {
      font(size, bold); context.fillStyle = color; context.textAlign = align; context.fillText(value, x, y);
    },
    wrap: (value, width, size, bold = false) => {
      font(size, bold); return wrapText(value, width, (text) => context.measureText(text).width);
    },
  };
};

const columns = (width: number, isRanking: boolean, monthCount: number) => {
  const label = isRanking ? 300 : 235;
  const total = 70;
  return { label, total, month: (width - label - total) / Math.max(1, monthCount) };
};

const rowHeight = (painter: Painter, row: CommissionReportRow, labelWidth: number) =>
  Math.max(46, painter.wrap(row.label, labelWidth - 24, 17).length * 21 + 16);

const header = (painter: Painter, report: CommissionReportData, width: number, summaries: string[], generated: string, months: string[]) => {
  painter.rect(0, 0, width, 6, RED);
  painter.text('TechNET  /  COMISSIONAMENTO TÉCNICO', MARGIN, 40, 17, RED, true);
  painter.text('Ranking mensal de confirmadas', MARGIN, 82, 32, DARK, true);
  painter.text('Status: CONFIRMADA  |  Referência: Data Exec.', MARGIN, 113, 18, MUTED);
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  painter.text(`Meses: ${months.map((month) => `${formatReportMonth(month)}${month === currentMonth ? ' (em andamento)' : ''}`).join('  ·  ')}`, MARGIN, 145, 17, DARK, true);
  const filterLines = painter.wrap(summaries.join('  |  ') || 'Todos os filtros', width - MARGIN * 2, 16);
  filterLines.forEach((line, index) => painter.text(line, MARGIN, 175 + index * 21, 16, MUTED));
  const y = 194 + filterLines.length * 21;
  painter.line(MARGIN, y, width - MARGIN, y, '#dce3e9');
  painter.text(`${NUMBER.format(report.totals.total)} ${report.totals.total === 1 ? 'confirmada' : 'confirmadas'} no período selecionado`, MARGIN, y + 31, 21, DARK, true);
  painter.text(`Gerado em ${generated}`, width - MARGIN, y + 31, 15, MUTED, false, 'right');
  return y + 61;
};

const drawTable = (
  painter: Painter, report: CommissionReportData, rows: CommissionReportRow[], months: string[],
  x: number, y: number, width: number, isRanking: boolean,
) => {
  const sizes = columns(width, isRanking, months.length);
  const indexes = months.map((month) => report.months.indexOf(month));
  const max = Math.max(1, ...indexes.map((index) => report.totals.counts[index]));
  painter.text(isRanking ? `Ranking por ${report.rankingLabel.toLocaleLowerCase('pt-BR')}` : report.groupLabel, x, y, 23, DARK, true);
  y += 22;
  painter.rect(x, y, width, 37, '#edf2f6');
  painter.text(isRanking ? report.rankingLabel : report.groupLabel, x + 12, y + 25, 16, MUTED, true);
  months.forEach((month, index) => painter.text(formatReportMonth(month), x + sizes.label + sizes.month * (index + 0.5), y + 25, 17, DARK, true, 'center'));
  painter.text('Total', x + width - 12, y + 25, 16, MUTED, true, 'right');
  y += 37;

  [report.totals, ...rows].forEach((row, rowIndex) => {
    const height = rowHeight(painter, row, sizes.label);
    const isTotal = rowIndex === 0;
    painter.rect(x, y, width, height, isTotal ? '#eaf0f5' : rowIndex % 2 === 0 ? '#f7f9fb' : '#ffffff');
    const lines = painter.wrap(row.label, sizes.label - 24, 17, isTotal);
    lines.forEach((line, index) => painter.text(line, x + 12, y + (height - lines.length * 21) / 2 + 17 + index * 21, 17, DARK, isTotal));
    indexes.forEach((monthIndex, index) => {
      const value = row.counts[monthIndex] || 0;
      const left = x + sizes.label + sizes.month * index;
      if (!isRanking && value > 0) painter.rect(left + 8, y + 11, Math.max(2, (sizes.month - 48) * value / max), height - 22, BLUE);
      painter.text(NUMBER.format(value), left + sizes.month - 9, y + height / 2 + 6, 17, value > 0 ? DARK : '#94a3b8', isTotal, 'right');
      painter.line(left, y, left, y + height, '#e0e6ec');
    });
    painter.text(NUMBER.format(indexes.reduce((sum, index) => sum + (row.counts[index] || 0), 0)), x + width - 12, y + height / 2 + 6, 17, DARK, true, 'right');
    painter.line(x, y + height, x + width, y + height, '#e0e6ec');
    y += height;
  });
  return y;
};

const dateNotes = (report: CommissionReportData) => {
  const notes: string[] = [];
  if (report.excludedWithoutExecution) notes.push(`${report.excludedWithoutExecution} sem Data Exec. válida, fora das contagens`);
  if (report.excludedInvalidYear) notes.push(`${report.excludedInvalidYear} com ano inconsistente, fora das contagens`);
  if (report.futureExecutions) notes.push(`${report.futureExecutions} com Data Exec. futura`);
  return notes.join('  |  ') || 'Quantidade de registros confirmados agrupada pelo mês da execução.';
};
const footerSpace = (painter: Painter, report: CommissionReportData, width: number) =>
  Math.max(77, painter.wrap(dateNotes(report), width - MARGIN * 2 - 130, 15).length * 18 + 45);

const footer = (painter: Painter, report: CommissionReportData, width: number, height: number, page: string) => {
  const lines = painter.wrap(dateNotes(report), width - MARGIN * 2 - 130, 15);
  const top = height - 27 - (lines.length - 1) * 18;
  painter.line(MARGIN, top - 26, width - MARGIN, top - 26, '#dce3e9');
  lines.forEach((line, index) => painter.text(line, MARGIN, top + index * 18, 15, MUTED));
  painter.text(page, width - MARGIN, height - 27, 15, MUTED, false, 'right');
};

const paginate = (painter: Painter, rows: CommissionReportRow[], labelWidth: number, capacity: number) => {
  const pages: CommissionReportRow[][] = [[]];
  let used = 0;
  rows.forEach((row) => {
    const height = rowHeight(painter, row, labelWidth);
    if (used + height > capacity && pages[pages.length - 1].length) { pages.push([]); used = 0; }
    pages[pages.length - 1].push(row); used += height;
  });
  return pages;
};

export function createCommissionReportPdf(report: CommissionReportData, summaries: string[], now = new Date()) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setProperties({ title: 'Comissionamento Técnico - Relatório de Confirmadas', subject: 'Confirmadas por Data Exec.' });
  const painter = pdfPainter(pdf);
  const panelWidth = (PAGE_WIDTH - MARGIN * 2 - GAP) / 2;
  const generated = now.toLocaleString('pt-BR');
  const monthChunks: string[][] = [];
  for (let i = 0; i < report.months.length; i += 4) monthChunks.push(report.months.slice(i, i + 4));
  if (!monthChunks.length) monthChunks.push([]);
  let page = 0;
  monthChunks.forEach((months) => {
    // Measure the same header and row geometry used by both export formats.
    const top = 255 + painter.wrap(summaries.join('  |  ') || 'Todos os filtros', PAGE_WIDTH - MARGIN * 2, 16).length * 21;
    const capacity = PAGE_HEIGHT - top - 22 - 37 - 46 - footerSpace(painter, report, PAGE_WIDTH);
    const groupPages = paginate(painter, report.groups, columns(panelWidth, false, months.length).label, capacity);
    const rankingPages = paginate(painter, report.ranking, columns(panelWidth, true, months.length).label, capacity);
    const count = Math.max(groupPages.length, rankingPages.length);
    for (let index = 0; index < count; index += 1) {
      if (page > 0) pdf.addPage();
      painter.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, '#ffffff');
      const y = header(painter, report, PAGE_WIDTH, summaries, generated, months);
      drawTable(painter, report, groupPages.length === 1 ? groupPages[0] : groupPages[index] || [], months, MARGIN, y, panelWidth, false);
      drawTable(painter, report, rankingPages[index] || [], months, MARGIN + panelWidth + GAP, y, panelWidth, true);
      footer(painter, report, PAGE_WIDTH, PAGE_HEIGHT, `Página ${page + 1}`);
      page += 1;
    }
  });
  return pdf;
}

export async function createCommissionReportPng(report: CommissionReportData, summaries: string[]): Promise<Blob> {
  const width = Math.max(PAGE_WIDTH, 640 + report.months.length * 220);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível criar a imagem do relatório.');
  const painter = canvasPainter(context);
  const panelWidth = (width - MARGIN * 2 - GAP) / 2;
  const generated = new Date().toLocaleString('pt-BR');
  const top = header(painter, report, width, summaries, generated, report.months);
  const measureRows = (rows: CommissionReportRow[], ranking: boolean) => [report.totals, ...rows]
    .reduce((height, row) => height + rowHeight(painter, row, columns(panelWidth, ranking, report.months.length).label), 0);
  const height = Math.ceil(top + 59 + Math.max(measureRows(report.groups, false), measureRows(report.ranking, true)) + footerSpace(painter, report, width) + 23);
  if (height > 30000 || width * height > 60000000) throw new Error('O relatório é muito grande para uma única imagem. Exporte em PDF ou reduza os filtros.');
  canvas.height = height;
  painter.rect(0, 0, width, height, '#ffffff');
  header(painter, report, width, summaries, generated, report.months);
  drawTable(painter, report, report.groups, report.months, MARGIN, top, panelWidth, false);
  drawTable(painter, report, report.ranking, report.months, MARGIN + panelWidth + GAP, top, panelWidth, true);
  footer(painter, report, width, height, 'TechNET');
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível exportar a imagem.')), 'image/png'));
}

export async function downloadCommissionReport(report: CommissionReportData, summaries: string[], format: 'pdf' | 'png') {
  const filename = `comissionamento-confirmadas-${report.months[0] || 'periodo'}-${report.months[report.months.length - 1] || 'periodo'}`;
  if (format === 'pdf') { createCommissionReportPdf(report, summaries).save(`${filename}.pdf`); return; }
  const blob = await createCommissionReportPng(report, summaries);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `${filename}.png`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
