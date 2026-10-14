import type { TechnicianRankingRow } from '../types/technicianRanking.ts';

export interface TechnicianRankingReportFilters {
  startDate: string;
  endDate: string;
  city: string;
  supervisor: string;
  search: string;
  sortLabel: string;
}

export interface TechnicianRankingReport {
  filters: TechnicianRankingReportFilters;
  rows: Array<Pick<TechnicianRankingRow, 'login' | 'nome' | 'cidade' | 'supervisor' | 'contratos' | 'contratos409' | 'porcentagem' | 'retornosCredenciados' | 'cadastrado'> & { position: number }>;
  totals: { technicians: number; contracts: number; code409: number; percentage: number | null; returns: number; unmapped: number };
  lastImport: string | null;
  generatedAt: string;
}

const reportTotals = (rows: TechnicianRankingReport['rows']) => {
  const contracts = rows.reduce((sum, row) => sum + row.contratos, 0), code409 = rows.reduce((sum, row) => sum + row.contratos409, 0);
  return { technicians: rows.length, contracts, code409, percentage: contracts ? code409 / contracts * 100 : null,
    returns: rows.reduce((sum, row) => sum + row.retornosCredenciados, 0), unmapped: rows.filter((row) => !row.cadastrado).length };
};

export function buildTechnicianRankingReport(rows: TechnicianRankingRow[], filters: TechnicianRankingReportFilters, lastImport: string | null, now = new Date()): TechnicianRankingReport {
  const snapshot = rows.map((row, index) => ({ position: index + 1, login: row.login, nome: row.nome, cidade: row.cidade,
    supervisor: row.supervisor, contratos: row.contratos, contratos409: row.contratos409,
    porcentagem: row.contratos ? row.contratos409 / row.contratos * 100 : null, retornosCredenciados: row.retornosCredenciados, cadastrado: row.cadastrado }));
  return {
    filters: { ...filters }, rows: snapshot, totals: reportTotals(snapshot),
    lastImport, generatedAt: now.toISOString(),
  };
}

export function groupTechnicianRankingReport(report: TechnicianRankingReport): TechnicianRankingReport[] {
  const groups = new Map<string, TechnicianRankingReport['rows']>();
  report.rows.forEach((row) => {
    const supervisor = row.supervisor.trim() || 'Não cadastrado';
    groups.set(supervisor, [...(groups.get(supervisor) || []), row]);
  });
  return [...groups.entries()].sort(([a], [b]) => a === 'Não cadastrado' ? 1 : b === 'Não cadastrado' ? -1 : a.localeCompare(b, 'pt-BR'))
    .map(([supervisor, values]) => {
      const rows = values.map((row, index) => ({ ...row, position: index + 1 }));
      return { ...report, filters: { ...report.filters, supervisor }, rows, totals: reportTotals(rows) };
    });
}
