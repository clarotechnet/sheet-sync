import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { GatilhosReport, GatilhosReportRow } from './gatilhosReportData.ts';
import { getGatilhoTipoLabel } from '../types/gatilhos.ts';

const points = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string) => value.split('-').reverse().join('/');
const MARGIN = 12;
const WIDTHS = [15, 71, 34, 30, 32, 32, 23, 36];
const HEADERS = ['ID', 'Nome completo / equipe', 'CPF', 'Setor / papel', 'Cidade / tipo', 'Pontuação / composição', 'Gatilho', 'Prêmio da equipe'];
const LEADING = 3.8;
const BODY_END = 188;

export const gatilhosReportFilename = (report: GatilhosReport) => {
  const id = report.linhas.length === 1 ? `-id-${report.linhas[0].id.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  return `gatilhos-${report.contexto.periodo.inicio}-${report.contexto.periodo.fim}${id}`;
};

const filters = (report: GatilhosReport) => [
  `Tipo: ${report.contexto.tipo === 'TODOS' ? 'Todos' : getGatilhoTipoLabel(report.contexto.tipo)}`,
  `Cidade: ${report.contexto.cidade === 'TODAS' ? 'Todas' : report.contexto.cidade}`,
  `Busca: ${report.contexto.busca || 'Sem busca'}`,
].join(' | ');

export function createGatilhosReportPdf(report: GatilhosReport) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdf.setProperties({ title: 'Relatório de Gatilhos', subject: 'Pontuação e premiação por equipe / ID', author: 'TechNET' });
  const font = (size = 8.3, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size); };
  const wrap = (value: string, width: number) => { font(); return pdf.splitTextToSize(value || '-', width - 4) as string[]; };
  const drawText = (value: string[], x: number, y: number, bold = false, align: 'left' | 'right' = 'left') => {
    font(8.3, bold); pdf.setTextColor('#17212b');
    value.forEach((line, index) => pdf.text(line, x, y + index * LEADING, { align }));
  };
  const header = () => {
    pdf.setFillColor('#e31325'); pdf.rect(0, 0, 297, 1.5, 'F');
    font(17, true); pdf.setTextColor('#17212b'); pdf.text('Gatilhos', MARGIN, 16);
    font(8); pdf.setTextColor('#64748b');
    pdf.text(`Gerado em ${new Date(report.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 285, 13, { align: 'right' });
    pdf.text(`Período: ${date(report.contexto.periodo.inicio)} a ${date(report.contexto.periodo.fim)}`, MARGIN, 23);
    const filterLines = wrap(filters(report), 273);
    drawText(filterLines, MARGIN, 30);
    let y = 32 + filterLines.length * LEADING;
    pdf.setFillColor('#f1f5f9'); pdf.rect(MARGIN, y, 273, 15, 'F');
    font(9, true);
    pdf.text(`${report.totais.ids} IDs / ${report.totais.colaboradores} colaboradores`, MARGIN + 3, y + 6);
    pdf.text(`Pontuação: ${points(report.totais.pontos)}`, 120, y + 6);
    pdf.text(`Premiação total: ${money(report.totais.premio)}`, 282, y + 6, { align: 'right' });
    font(8); pdf.text('Duplas na mesma linha. Prêmio total da equipe, sem rateio entre colaboradores.', MARGIN + 3, y + 12);
    y += 20;
    pdf.setFillColor('#eaf0f5'); pdf.rect(MARGIN, y, 273, 12, 'F');
    let x = MARGIN;
    HEADERS.forEach((value, index) => {
      const lines = wrap(value, WIDTHS[index]);
      drawText(lines, x + 2, y + 4.5, true); x += WIDTHS[index];
    });
    return y + 12;
  };

  const prepare = (row: GatilhosReportRow) => {
    const people = row.membros.length ? row.membros : [{ nome: 'Não vinculado', cpf: 'Não informado', setor: 'Não informado', papel: '-' }];
    const members = people.map((member) => {
      const cells = [wrap(member.nome, WIDTHS[1]), wrap(member.cpf, WIDTHS[2]), wrap(`${member.setor}\n${member.papel}`, WIDTHS[3])];
      return { cells, height: Math.max(...cells.map((lines) => lines.length)) * LEADING + 2 };
    });
    const shared = [
      wrap(row.id, WIDTHS[0]), [], [], [], wrap(`${row.cidade}\n${row.equipe ? 'Equipe - ' : ''}${row.tipo}`, WIDTHS[4]),
      wrap(`${points(row.pontuacao)} pontos${row.ajustado ? ' (ajustada)' : ''}\nBase: ${points(row.valorImportado)}\nInst.: ${money(row.instalador)}\nAux.: ${money(row.auxiliar)}\nDesl.: ${money(row.deslocamento)}`, WIDTHS[5]),
      wrap(row.nivel === null ? 'Não atingido' : `${row.nivel}º gatilho`, WIDTHS[6]), wrap(money(row.premio), WIDTHS[7]),
    ];
    return { members, shared, height: Math.max(members.reduce((sum, member) => sum + member.height, row.equipe ? 5 : 0), ...shared.map((lines) => lines.length * LEADING)) + 6 };
  };

  let y = header();
  report.linhas.forEach((row, index) => {
    const prepared = prepare(row);
    if (y + prepared.height > BODY_END) { pdf.addPage(); y = header(); }
    if (y + prepared.height > BODY_END) throw new Error('Um cadastro é longo demais para uma linha do PDF. Exporte em Excel para conferir os dados completos.');
    pdf.setFillColor(index % 2 ? '#f5f8fa' : '#ffffff'); pdf.rect(MARGIN, y, 273, prepared.height, 'F');
    let x = MARGIN;
    prepared.shared.forEach((lines, column) => {
      if (lines.length) drawText(lines, column === 7 ? x + WIDTHS[column] - 2 : x + 2, y + 4.5, column === 7, column === 7 ? 'right' : 'left');
      x += WIDTHS[column];
    });
    let memberY = y + 4.5;
    if (row.equipe) { font(8, true); pdf.text('EQUIPE', MARGIN + WIDTHS[0] + 2, memberY); memberY += 5; }
    prepared.members.forEach((member) => {
      let memberX = MARGIN + WIDTHS[0];
      member.cells.forEach((lines, column) => { drawText(lines, memberX + 2, memberY, column === 0); memberX += WIDTHS[column + 1]; });
      memberY += member.height;
    });
    y += prepared.height;
    pdf.setDrawColor('#dde5ed'); pdf.setLineWidth(0.15); pdf.line(MARGIN, y, 285, y);
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); font(7); pdf.setTextColor('#64748b');
    pdf.text('Fonte: Gatilhos e cadastro de colaboradores vinculados. CPF e setor ausentes são indicados como não informados.', MARGIN, 199);
    pdf.text(`Página ${page} de ${pages}`, 285, 199, { align: 'right' });
  }
  return pdf;
}

export function createGatilhosReportWorkbook(report: GatilhosReport) {
  const headers = ['#', 'ID', 'Tipo', 'Cidade', 'Nome completo 1', 'CPF 1', 'Setor 1', 'Papel 1', 'Nome completo 2', 'CPF 2', 'Setor 2', 'Papel 2',
    'Valor importado (pontos)', 'Pontuação aplicada', 'Ajustada', 'Motivo do ajuste', 'Gatilho', 'Prêmio da equipe (R$)', 'Valor instalador (R$)', 'Valor auxiliar (R$)', 'Deslocamento (R$)', 'Período inicial', 'Período final'];
  const serialDate = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86400000 + 25569;
  const rows = report.linhas.map((row) => {
    const [first, second] = row.membros;
    return [row.posicao, row.id, `${row.equipe ? 'Equipe - ' : ''}${row.tipo}`, row.cidade,
      first?.nome || 'Não vinculado', first?.cpf || 'Não informado', first?.setor || 'Não informado', first?.papel || '-',
      second?.nome || '', second?.cpf || '', second?.setor || '', second?.papel || '',
      row.valorImportado, row.pontuacao, row.ajustado ? 'Sim' : 'Não', row.motivoAjuste, row.nivel === null ? 'Não atingido' : `${row.nivel}º gatilho`,
      row.premio, row.instalador, row.auxiliar, row.deslocamento, serialDate(row.inicio), serialDate(row.fim)];
  });
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Relatório de Gatilhos'], [`Período: ${date(report.contexto.periodo.inicio)} a ${date(report.contexto.periodo.fim)}`],
    [filters(report)], ['Uma linha por ID. Duplas são equipes e a premiação não é dividida entre colaboradores.'],
    ['Fonte: Gatilhos e cadastro de colaboradores vinculados.'], [], headers, ...rows,
  ]);
  sheet['!merges'] = [0, 1, 2, 3, 4].map((r) => ({ s: { r, c: 0 }, e: { r, c: headers.length - 1 } }));
  sheet['!cols'] = headers.map((_, column) => ({ wch: column === 4 || column === 8
    ? Math.max(35, Math.min(90, rows.reduce((max, row) => Math.max(max, String(row[column]).length + 2), 0)))
    : [5, 13, 24, 24, 40, 20, 24, 16, 40, 20, 24, 16, 23, 21, 12, 45, 16, 25, 23, 23, 23, 18, 18][column] }));
  sheet['!rows'] = [{ hpt: 24 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 20 }, { hpt: 8 }, { hpt: 24 }];
  rows.forEach((_, index) => {
    const r = index + 7;
    [12, 13].forEach((c) => { sheet[XLSX.utils.encode_cell({ r, c })].z = '#,##0.00'; });
    [17, 18, 19, 20].forEach((c) => { sheet[XLSX.utils.encode_cell({ r, c })].z = '"R$" #,##0.00'; });
    [21, 22].forEach((c) => { sheet[XLSX.utils.encode_cell({ r, c })].z = 'dd/mm/yyyy'; });
  });
  if (rows.length) {
    const last = rows.length + 7;
    XLSX.utils.sheet_add_aoa(sheet, [['Total dos IDs']], { origin: { r: last, c: 0 } });
    const totals = [[12, report.totais.valorImportado], [13, report.totais.pontos], [17, report.totais.premio], [18, report.totais.instalador], [19, report.totais.auxiliar], [20, report.totais.deslocamento]];
    totals.forEach(([c, value]) => {
      const column = XLSX.utils.encode_col(c);
      sheet[XLSX.utils.encode_cell({ r: last, c })] = { t: 'n', f: `SUM(${column}8:${column}${last})`, v: value, z: c < 17 ? '#,##0.00' : '"R$" #,##0.00' };
    });
    sheet['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: last, c: headers.length - 1 });
    sheet['!autofilter'] = { ref: `A7:W${last}` };
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Gatilhos');
  return workbook;
}

export function downloadGatilhosReport(report: GatilhosReport, format: 'pdf' | 'xlsx') {
  if (!report.linhas.length) throw new Error('Nenhum resultado disponível para exportar.');
  const filename = gatilhosReportFilename(report);
  if (format === 'pdf') createGatilhosReportPdf(report).save(`${filename}.pdf`);
  else XLSX.writeFile(createGatilhosReportWorkbook(report), `${filename}.xlsx`);
}
