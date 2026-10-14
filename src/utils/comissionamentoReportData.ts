import type { ComissionamentoData } from '@/types/comissionamento';
import { normalizePersonName } from './normalizeName.ts';

export type CommissionReportSource = Pick<ComissionamentoData,
  'nome' | 'login_criador' | 'alocacao' | 'frente' | 'proposta' | 'status' | 'data_exec'>;
export type CommissionReportGroup = 'alocacao' | 'frente';
export type CommissionReportRanking = 'login_criador' | 'nome';

export interface CommissionReportFilters {
  months: string[];
  cities: string[];
  fronts: string[];
  products: string[];
  logins: string[];
  technicians: string[];
}

export interface CommissionReportRow {
  key: string;
  label: string;
  counts: number[];
  total: number;
}

export interface CommissionReportData {
  months: string[];
  groups: CommissionReportRow[];
  ranking: CommissionReportRow[];
  totals: CommissionReportRow;
  excludedWithoutExecution: number;
  excludedInvalidYear: number;
  futureExecutions: number;
  groupLabel: string;
  rankingLabel: string;
}

export const formatReportMonth = (month: string) => {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return month;
  const year = Number(match[1]);
  return `${match[2]}/${year >= 2000 && year < 2100 ? match[1].slice(2) : match[1]}`;
};

export function executionMonth(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}`;
}

const monthIndex = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return year * 12 + month - 1;
};
const monthKey = (index: number) => `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;

export function defaultCommissionReportMonths(today = new Date()): string[] {
  const current = today.getFullYear() * 12 + today.getMonth();
  return Array.from({ length: 4 }, (_, index) => monthKey(current - 3 + index));
}

export function commissionReportMonths(data: CommissionReportSource[], today = new Date()): string[] {
  const current = today.getFullYear() * 12 + today.getMonth();
  const executionMonths = [...new Set(data
    .filter((row) => row.status?.trim().toUpperCase() === 'CONFIRMADA')
    .map((row) => executionMonth(row.data_exec))
    .filter((month): month is string => month !== null))];
  const historical = executionMonths.map(monthIndex).filter((index) => index <= current);
  // Use numeric calendar indexes; future entries cannot move the default period.
  const first = Math.min(current - 3, ...historical);
  const result = Array.from({ length: current - first + 1 }, (_, index) => monthKey(first + index));
  const future = executionMonths.filter((key) => monthIndex(key) > current);
  return [...result, ...future].sort();
}

export const reportFieldLabel = (value: string | null | undefined) => value?.trim() || 'Não informado';

export function commissionReportOptions(data: CommissionReportSource[], field: CommissionReportGroup | CommissionReportRanking | 'proposta'): string[] {
  const values = new Map<string, string>();
  data.filter((row) => row.status?.trim().toUpperCase() === 'CONFIRMADA').forEach((row) => {
    const label = reportFieldLabel(row[field]);
    const key = normalizePersonName(label);
    if (!values.has(key)) values.set(key, label);
  });
  return [...values.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function buildCommissionReport(
  data: CommissionReportSource[],
  filters: CommissionReportFilters,
  groupBy: CommissionReportGroup = 'alocacao',
  rankingBy: CommissionReportRanking = 'login_criador',
  today = new Date(),
): CommissionReportData {
  const months = [...new Set(filters.months)].sort();
  const monthIndexes = new Map(months.map((month, index) => [month, index]));
  const groups = new Map<string, CommissionReportRow>();
  const ranking = new Map<string, CommissionReportRow>();
  const totals: CommissionReportRow = { key: 'total', label: 'Total geral', counts: months.map(() => 0), total: 0 };
  let excludedWithoutExecution = 0;
  let excludedInvalidYear = 0;
  let futureExecutions = 0;
  const currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const selected = (values: string[]) => new Set(values.map(normalizePersonName));
  const selections = [
    ['alocacao', selected(filters.cities)], ['frente', selected(filters.fronts)],
    ['proposta', selected(filters.products)], ['login_criador', selected(filters.logins)],
    ['nome', selected(filters.technicians)],
  ] as const;

  const count = (map: Map<string, CommissionReportRow>, value: string | null | undefined, index: number) => {
    const label = reportFieldLabel(value);
    const key = normalizePersonName(label);
    const row = map.get(key) || { key, label, counts: months.map(() => 0), total: 0 };
    row.counts[index] += 1;
    row.total += 1;
    map.set(key, row);
  };

  data.forEach((row) => {
    if (row.status?.trim().toUpperCase() !== 'CONFIRMADA') return;
    if (selections.some(([field, values]) => values.size > 0 && !values.has(normalizePersonName(reportFieldLabel(row[field]))))) return;
    // The execution date is the only time reference, including when it is missing.
    const month = executionMonth(row.data_exec);
    if (!month) {
      const year = row.data_exec?.trim().match(/^(\d{4})-/)?.[1];
      if (year && Number(year) < 1900) excludedInvalidYear += 1;
      else excludedWithoutExecution += 1;
      return;
    }
    if (row.data_exec!.trim().slice(0, 10) > currentDate) futureExecutions += 1;
    const index = monthIndexes.get(month);
    if (index === undefined) return;
    totals.counts[index] += 1;
    totals.total += 1;
    count(groups, row[groupBy], index);
    count(ranking, row[rankingBy], index);
  });

  const sorted = (map: Map<string, CommissionReportRow>) => [...map.values()]
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'));
  return {
    months, groups: sorted(groups), ranking: sorted(ranking), totals, excludedWithoutExecution, excludedInvalidYear, futureExecutions,
    groupLabel: groupBy === 'alocacao' ? 'Cidade / Alocação' : 'Frente',
    rankingLabel: rankingBy === 'login_criador' ? 'Login do criador' : 'Técnico',
  };
}
