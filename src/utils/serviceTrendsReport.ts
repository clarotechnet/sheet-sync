import { jsPDF } from 'jspdf';

export interface ReportMonth {
  monthLabel: string;
  total: number;
  produtivas: number;
  improdutivas: number;
  cancelados: number;
  pendentes: number;
  cancellationRate: number;
  variation: number | null;
}

export interface ReportChange {
  name: string;
  previous: number;
  current: number;
  percentage: number | null;
}

export interface ServiceTrendsReportData {
  startDate: string;
  endDate: string;
  periodLabel: string;
  comparisonNote: string;
  cities: string[];
  fronts: string[];
  months: ReportMonth[];
  serviceChanges: ReportChange[];
  cityChanges: ReportChange[];
  totalReceived: number;
  totalCancelled: number;
  cancellationRate: number;
  periodTrend: number | null;
}

const WIDTH = 297;
const HEIGHT = 210;
const RED: [number, number, number] = [227, 19, 37];
const DARK: [number, number, number] = [19, 28, 43];
const MUTED: [number, number, number] = [92, 105, 122];
const PALE: [number, number, number] = [244, 247, 250];
const GREEN: [number, number, number] = [22, 163, 74];
const AMBER: [number, number, number] = [245, 158, 11];
const GRAY: [number, number, number] = [111, 127, 145];

const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const formatChange = (value: number | null) => value === null ? 'Novo volume' : `${value > 0 ? '+' : ''}${formatPercent(value)}`;

const setText = (pdf: jsPDF, color: [number, number, number], size: number, weight: 'normal' | 'bold' = 'normal') => {
  pdf.setTextColor(...color);
  pdf.setFont('helvetica', weight);
  pdf.setFontSize(size);
};

const pageHeader = (pdf: jsPDF, section: string, subtitle: string) => {
  pdf.setFillColor(...RED);
  pdf.rect(0, 0, WIDTH, 4, 'F');
  setText(pdf, RED, 13, 'bold');
  pdf.text('TechNET', 18, 19);
  setText(pdf, DARK, 20, 'bold');
  pdf.text(section, 18, 30);
  setText(pdf, MUTED, 9);
  pdf.text(subtitle, 18, 37);
  pdf.setDrawColor(223, 229, 235);
  pdf.line(18, 41, 279, 41);
};

const drawKpi = (pdf: jsPDF, x: number, label: string, value: string, detail: string) => {
  pdf.setFillColor(...PALE);
  pdf.roundedRect(x, 65, 61.5, 29, 2, 2, 'F');
  setText(pdf, MUTED, 7.3, 'bold');
  pdf.text(label.toUpperCase(), x + 3, 72);
  setText(pdf, DARK, 18, 'bold');
  pdf.text(value, x + 3, 82);
  setText(pdf, MUTED, 7.2);
  pdf.text(pdf.splitTextToSize(detail, 55).slice(0, 2), x + 3, 88);
};

const drawStackedChart = (pdf: jsPDF, months: ReportMonth[]) => {
  setText(pdf, DARK, 12, 'bold');
  pdf.text('Volume recebido por mês', 18, 106);
  setText(pdf, MUTED, 8);
  pdf.text('Composição por status no período comparável', 18, 112);

  const visible = months.slice(-10);
  if (months.length > 10) pdf.text('Gráfico: últimos 10 meses; tabela: período completo', 279, 112, { align: 'right' });
  const max = Math.max(1, ...visible.map((month) => month.total));
  const chartTop = 123;
  const chartBottom = 180;
  const chartHeight = chartBottom - chartTop;
  const chartLeft = 29;
  const chartWidth = 247;

  pdf.setDrawColor(227, 232, 239);
  for (let line = 0; line <= 3; line += 1) {
    const y = chartBottom - (line / 3) * chartHeight;
    pdf.line(chartLeft, y, chartLeft + chartWidth, y);
    setText(pdf, MUTED, 7);
    pdf.text(formatNumber(Math.round(max * line / 3)), chartLeft - 3, y + 2, { align: 'right' });
  }

  const slot = chartWidth / Math.max(visible.length, 1);
  const barWidth = Math.min(21, slot * 0.62);
  visible.forEach((month, index) => {
    const x = chartLeft + slot * index + (slot - barWidth) / 2;
    let y = chartBottom;
    const parts: Array<[number, [number, number, number]]> = [
      [month.produtivas, GREEN],
      [month.improdutivas, AMBER],
      [month.cancelados, RED],
      [month.pendentes, GRAY],
    ];
    parts.forEach(([value, color]) => {
      const height = value / max * chartHeight;
      y -= height;
      pdf.setFillColor(...color);
      pdf.rect(x, y, barWidth, height, 'F');
    });
    setText(pdf, DARK, 7.3, 'bold');
    pdf.text(month.monthLabel, x + barWidth / 2, chartBottom + 6, { align: 'center' });
  });

  const legend: Array<[string, [number, number, number]]> = [
    ['Produtivas', GREEN], ['Improdutivas', AMBER], ['Canceladas', RED], ['Pendentes', GRAY],
  ];
  legend.forEach(([label, color], index) => {
    const x = 40 + index * 57;
    pdf.setFillColor(...color);
    pdf.rect(x, 194, 3, 3, 'F');
    setText(pdf, MUTED, 8);
    pdf.text(label, x + 5, 197);
  });
};

const drawCancellationChart = (pdf: jsPDF, months: ReportMonth[]) => {
  setText(pdf, DARK, 12, 'bold');
  pdf.text('Taxa de cancelamento', 18, 52);
  const chartLeft = 35;
  const chartRight = 273;
  const chartTop = 61;
  const chartBottom = 100;
  const maxRate = Math.max(10, Math.ceil(Math.max(...months.map((month) => month.cancellationRate), 0) / 5) * 5);

  pdf.setDrawColor(226, 232, 239);
  for (let line = 0; line <= 2; line += 1) {
    const y = chartBottom - line * (chartBottom - chartTop) / 2;
    pdf.line(chartLeft, y, chartRight, y);
    setText(pdf, MUTED, 7);
    pdf.text(`${Math.round(maxRate * line / 2)}%`, chartLeft - 4, y + 2, { align: 'right' });
  }

  const positions = months.map((month, index) => ({
    month,
    x: months.length === 1 ? (chartLeft + chartRight) / 2 : chartLeft + index * (chartRight - chartLeft) / (months.length - 1),
    y: chartBottom - month.cancellationRate / maxRate * (chartBottom - chartTop),
  }));
  pdf.setDrawColor(...RED);
  pdf.setLineWidth(0.8);
  positions.forEach((point, index) => {
    if (index > 0) pdf.line(positions[index - 1].x, positions[index - 1].y, point.x, point.y);
    pdf.setFillColor(...RED);
    pdf.circle(point.x, point.y, 1.6, 'F');
    setText(pdf, DARK, 7.2, 'bold');
    pdf.text(formatPercent(point.month.cancellationRate), point.x, point.y - 3, { align: 'center' });
    setText(pdf, MUTED, 7);
    pdf.text(point.month.monthLabel, point.x, chartBottom + 6, { align: 'center' });
  });
};

const drawMonthlyTable = (pdf: jsPDF, months: ReportMonth[]) => {
  setText(pdf, DARK, 12, 'bold');
  pdf.text('Resumo mensal', 18, 119);
  pdf.setFillColor(...PALE);
  pdf.rect(18, 124, 261, 8, 'F');
  const columns = [
    { name: 'Mês', x: 22, align: 'left' as const },
    { name: 'Recebidos', x: 89, align: 'right' as const },
    { name: 'Produtivos', x: 123, align: 'right' as const },
    { name: 'Improdutivos', x: 158, align: 'right' as const },
    { name: 'Cancelados', x: 190, align: 'right' as const },
    { name: 'Pendentes', x: 217, align: 'right' as const },
    { name: 'Taxa', x: 245, align: 'right' as const },
    { name: 'Variação', x: 276, align: 'right' as const },
  ];
  setText(pdf, MUTED, 7.1, 'bold');
  columns.forEach((column) => pdf.text(column.name, column.x, 129, { align: column.align }));

  months.forEach((month, index) => {
    const y = 140 + index * 8;
    if (index % 2 === 1) {
      pdf.setFillColor(250, 251, 253);
      pdf.rect(18, y - 5.5, 261, 8, 'F');
    }
    setText(pdf, DARK, 7.5, 'bold');
    pdf.text(month.monthLabel, 22, y);
    setText(pdf, DARK, 7.3);
    const values = [month.total, month.produtivas, month.improdutivas, month.cancelados, month.pendentes];
    [89, 123, 158, 190, 217].forEach((x, valueIndex) => pdf.text(formatNumber(values[valueIndex]), x, y, { align: 'right' }));
    pdf.text(formatPercent(month.cancellationRate), 245, y, { align: 'right' });
    pdf.text(month.variation === null ? 'Base' : formatChange(month.variation), 276, y, { align: 'right' });
  });
};

const drawChangeTable = (pdf: jsPDF, title: string, rows: ReportChange[], x: number, width: number) => {
  setText(pdf, DARK, 11, 'bold');
  pdf.text(title, x, 61);
  pdf.setFillColor(...PALE);
  pdf.rect(x, 67, width, 8, 'F');
  setText(pdf, MUTED, 7, 'bold');
  pdf.text(title.startsWith('Serviços') ? 'SERVIÇO' : 'CIDADE', x + 3, 72);
  pdf.text('ANT.', x + width - 49, 72, { align: 'right' });
  pdf.text('ATUAL', x + width - 27, 72, { align: 'right' });
  pdf.text('VAR.', x + width - 3, 72, { align: 'right' });

  if (rows.length === 0) {
    setText(pdf, MUTED, 8);
    pdf.text('Sem comparação entre meses neste período.', x + 3, 84);
    return;
  }

  rows.forEach((row, index) => {
    const y = 83 + index * 10.2;
    if (index % 2 === 1) {
      pdf.setFillColor(250, 251, 253);
      pdf.rect(x, y - 5.5, width, 10.2, 'F');
    }
    setText(pdf, DARK, 7.2, 'bold');
    const nameLines = pdf.splitTextToSize(row.name, width - 60).slice(0, 2);
    pdf.text(nameLines, x + 3, y - (nameLines.length > 1 ? 1.5 : 0));
    setText(pdf, DARK, 7.2);
    pdf.text(formatNumber(row.previous), x + width - 49, y, { align: 'right' });
    pdf.text(formatNumber(row.current), x + width - 27, y, { align: 'right' });
    pdf.text(formatChange(row.percentage), x + width - 3, y, { align: 'right' });
  });
};

export function generateServiceTrendsReport(data: ServiceTrendsReportData) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const current = data.months.at(-1);
  const first = data.months[0];
  const filterText = `Cidades: ${data.cities.length ? data.cities.join(', ') : 'Todas'}  |  Frentes: ${data.fronts.length ? data.fronts.join(', ') : 'Todas'}`;

  pageHeader(pdf, 'Tendência de Serviços', `Relatório executivo  |  ${data.periodLabel}`);
  setText(pdf, MUTED, 8);
  pdf.text(pdf.splitTextToSize(filterText, 260).slice(0, 2), 18, 47);
  setText(pdf, MUTED, 8);
  pdf.text(data.comparisonNote, 18, 59);
  drawKpi(pdf, 18, 'Volume recebido', formatNumber(data.totalReceived), data.periodLabel);
  drawKpi(pdf, 84, `Volume ${current?.monthLabel || ''}`, formatNumber(current?.total || 0), data.comparisonNote);
  drawKpi(pdf, 150, 'Cancelados', formatNumber(data.totalCancelled), `${formatPercent(data.cancellationRate)} do volume`);
  drawKpi(pdf, 216, 'Tendência', data.periodTrend === null ? '-' : formatChange(data.periodTrend), `${current?.monthLabel || '-'} vs ${first?.monthLabel || '-'}`);
  drawStackedChart(pdf, data.months);

  const monthPages: ReportMonth[][] = [];
  for (let index = 0; index < data.months.length; index += 7) monthPages.push(data.months.slice(index, index + 7));
  if (monthPages.length === 0) monthPages.push([]);
  monthPages.forEach((months, index) => {
    pdf.addPage();
    pageHeader(pdf, 'Evolução mensal', `${data.periodLabel}  |  ${data.comparisonNote}${monthPages.length > 1 ? `  |  Parte ${index + 1}/${monthPages.length}` : ''}`);
    drawCancellationChart(pdf, months);
    drawMonthlyTable(pdf, months);
  });

  pdf.addPage();
  pageHeader(pdf, 'Onde o volume mudou', `Últimos dois meses do período  |  ${data.comparisonNote}`);
  setText(pdf, MUTED, 8);
  pdf.text(`${data.months.at(-2)?.monthLabel || '-'} vs ${current?.monthLabel || '-'}`, 18, 49);
  drawChangeTable(pdf, 'Serviços que mais variaram', data.serviceChanges.slice(0, 10), 18, 128);
  drawChangeTable(pdf, 'Volume por cidade', data.cityChanges.slice(0, 8), 153, 126);
  setText(pdf, MUTED, 7.8);
  pdf.text('Fonte: atividades registradas no sistema. Volume recebido inclui todos os status; cancelados incluem serviços não concluídos.', 18, 196);

  const generatedAt = new Date().toLocaleString('pt-BR');
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(223, 229, 235);
    pdf.line(18, 202, 279, 202);
    setText(pdf, MUTED, 7);
    pdf.text(`TechNET  |  Gerado em ${generatedAt}`, 18, 207);
    pdf.text(`${page}/${pageCount}`, 279, 207, { align: 'right' });
  }

  pdf.save(`tendencia_servicos_${data.startDate}_${data.endDate}.pdf`);
}
