import { useMemo, useState } from 'react';
import { Check, ChevronDown, Download, FileText, Image, Loader2, RotateCcw, Search } from 'lucide-react';
import type { ComissionamentoData } from '@/types/comissionamento';
import {
  buildCommissionReport, commissionReportMonths, commissionReportOptions, defaultCommissionReportMonths, formatReportMonth,
} from '@/utils/comissionamentoReportData';
import type {
  CommissionReportFilters, CommissionReportGroup, CommissionReportRanking, CommissionReportRow,
} from '@/utils/comissionamentoReportData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FilterOption { value: string; label: string }

function ReportMultiSelect({ label, options, selected, onChange }: {
  label: string; options: FilterOption[]; selected: string[]; onChange: (values: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const visible = options.filter((option) => option.label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const summary = selected.length === 0 ? 'Todos' : selected.length === 1
    ? options.find((option) => option.value === selected[0])?.label || selected[0] : `${selected.length} selecionados`;
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <Popover onOpenChange={(open) => { if (!open) setSearch(''); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" aria-label={`Filtrar ${label}`} className="h-10 w-full justify-between gap-2 bg-white px-3 font-normal text-slate-800">
            <span className="truncate">{summary}</span><ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar opção..." aria-label={`Buscar ${label}`} className="pl-8" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-slate-50">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300">{selected.length === 0 && <Check className="h-3 w-3 text-[#e31325]" />}</span>Todos
            </button>
            {visible.map((option) => (
              <button key={option.value} type="button" role="checkbox" aria-checked={selected.includes(option.value)} onClick={() => toggle(option.value)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-slate-50">
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected.includes(option.value) ? 'border-[#e31325] bg-[#e31325] text-white' : 'border-slate-300')}>
                  {selected.includes(option.value) && <Check className="h-3 w-3" />}
                </span><span className="min-w-0 break-words">{option.label}</span>
              </button>
            ))}
            {!visible.length && <p className="p-2 text-sm text-slate-500">Nenhuma opção encontrada.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

const formatNumber = (value: number) => value.toLocaleString('pt-BR');

function MonthlyMatrix({ months, rows, totals, label, bars = false }: {
  months: string[]; rows: CommissionReportRow[]; totals: CommissionReportRow; label: string; bars?: boolean;
}) {
  const max = Math.max(1, ...totals.counts);
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed text-sm tabular-nums" style={{ minWidth: 270 + months.length * (bars ? 105 : 80) }}>
        <caption className="sr-only">{label} por mês da Data Exec., somente confirmadas</caption>
        <colgroup><col style={{ width: bars ? 180 : 230 }} />{months.map((month) => <col key={month} />)}<col style={{ width: 70 }} /></colgroup>
        <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500">
          <tr><th scope="col" className="px-3 py-3 text-left font-semibold">{label}</th>{months.map((month) => <th key={month} scope="col" className="px-2 py-3 text-center font-semibold">{formatReportMonth(month)}</th>)}<th scope="col" className="px-3 py-3 text-right font-semibold">Total</th></tr>
        </thead>
        <tbody>
          {[totals, ...rows].map((row, rowIndex) => (
            <tr key={row.key} className={cn('border-b border-slate-100', rowIndex === 0 ? 'bg-sky-50/70 font-bold text-slate-950' : rowIndex % 2 === 0 ? 'bg-slate-50/70' : 'bg-white')}>
              <th scope="row" className="break-words px-3 py-3 text-left text-xs font-semibold leading-5 text-slate-800">{row.label}</th>
              {row.counts.map((count, index) => (
                <td key={months[index]} className={cn('border-l border-slate-100 px-2 py-2', count ? 'text-slate-800' : 'text-slate-400')}>
                  {bars ? (
                    <div className="flex h-8 items-center gap-1.5">
                      <div className="h-7 min-w-0 flex-1"><div className="h-full bg-[#4f7fa8]" style={{ width: `${count / max * 100}%` }} /></div>
                      <span className="min-w-5 shrink-0 text-right text-xs">{formatNumber(count)}</span>
                    </div>
                  ) : <div className="text-center text-sm">{formatNumber(count)}</div>}
                </td>
              ))}
              <td className="border-l border-slate-100 px-3 py-3 text-right text-sm font-bold text-slate-800">{formatNumber(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="px-4 py-12 text-center text-sm text-slate-500">Sem confirmadas com Data Exec. nos meses selecionados.</p>}
    </div>
  );
}

export function ComissionamentoReports({ data, loading }: { data: ComissionamentoData[]; loading: boolean }) {
  const months = useMemo(() => commissionReportMonths(data), [data]);
  const defaultFilters = (): CommissionReportFilters => ({ months: defaultCommissionReportMonths(), cities: [], fronts: [], products: [], logins: [], technicians: [] });
  const [filters, setFilters] = useState<CommissionReportFilters>(defaultFilters);
  const [groupBy, setGroupBy] = useState<CommissionReportGroup>('alocacao');
  const [rankingBy, setRankingBy] = useState<CommissionReportRanking>('login_criador');
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const effectiveMonths = useMemo(() => {
    if (!filters.months.length) return months;
    const valid = filters.months.filter((month) => months.includes(month));
    return valid.length ? valid : defaultCommissionReportMonths();
  }, [filters.months, months]);
  const report = useMemo(() => buildCommissionReport(data, { ...filters, months: effectiveMonths }, groupBy, rankingBy), [data, effectiveMonths, filters, groupBy, rankingBy]);
  const options = useMemo(() => ({
    cities: commissionReportOptions(data, 'alocacao'), fronts: commissionReportOptions(data, 'frente'),
    products: commissionReportOptions(data, 'proposta'), logins: commissionReportOptions(data, 'login_criador'),
    technicians: commissionReportOptions(data, 'nome'),
  }), [data]);
  const set = (key: keyof CommissionReportFilters, value: string[]) => setFilters((current) => ({ ...current, [key]: value }));
  const fieldOptions = (values: string[]) => values.map((value) => ({ value, label: value }));
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const summaries = [
    ['Cidade / Alocação', filters.cities], ['Frente', filters.fronts], ['Proposta', filters.products],
    ['Login', filters.logins], ['Técnico', filters.technicians],
  ].map(([label, values]: [string, string[]]) => `${label}: ${values.length === 0 ? 'Todos' : values.length > 3 ? `${values.length} selecionados` : values.join(', ')}`);

  const exportReport = async (format: 'pdf' | 'png') => {
    setExporting(format);
    try {
      const { downloadCommissionReport } = await import('@/utils/comissionamentoReportExport');
      await downloadCommissionReport(report, summaries, format);
      toast({ title: `Relatório exportado em ${format.toUpperCase()}` });
    } catch (error: unknown) {
      toast({ title: 'Falha ao exportar relatório', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally { setExporting(null); }
  };

  return (
    <section className="space-y-5" aria-label="Relatórios de comissionamento">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Ranking mensal de confirmadas</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />CONFIRMADA · Data Exec.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Limpar filtros do relatório" title="Limpar filtros" onClick={() => setFilters(defaultFilters())}><RotateCcw className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" disabled={loading || Boolean(exporting) || report.totals.total === 0} className="bg-[#e31325] hover:bg-[#c81020]">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar relatório<ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportReport('pdf')}><FileText className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportReport('png')}><Image className="mr-2 h-4 w-4" />Imagem PNG</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <ReportMultiSelect label="Mês da execução" options={[...months].reverse().map((value) => ({ value, label: `${formatReportMonth(value)}${value === currentMonth ? ' (em andamento)' : value > currentMonth ? ' (data futura)' : ''}` }))} selected={filters.months.length ? effectiveMonths : []} onChange={(value) => set('months', value)} />
        <ReportMultiSelect label="Cidade / Alocação" options={fieldOptions(options.cities)} selected={filters.cities} onChange={(value) => set('cities', value)} />
        <ReportMultiSelect label="Frente" options={fieldOptions(options.fronts)} selected={filters.fronts} onChange={(value) => set('fronts', value)} />
        <ReportMultiSelect label="Proposta / Produto" options={fieldOptions(options.products)} selected={filters.products} onChange={(value) => set('products', value)} />
        <ReportMultiSelect label="Login do criador" options={fieldOptions(options.logins)} selected={filters.logins} onChange={(value) => set('logins', value)} />
        <ReportMultiSelect label="Técnico" options={fieldOptions(options.technicians)} selected={filters.technicians} onChange={(value) => set('technicians', value)} />
      </div>

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-sm text-slate-500">
        <p><strong className="mr-2 text-2xl font-bold tabular-nums text-slate-950">{formatNumber(report.totals.total)}</strong>{report.totals.total === 1 ? 'confirmada' : 'confirmadas'}</p>
        <p><strong className="font-semibold text-slate-800">{report.months.length}</strong> meses</p>
        <p><strong className="font-semibold text-slate-800">{report.groups.length}</strong> {groupBy === 'alocacao' ? 'cidades / alocações' : 'frentes'}</p>
        <p><strong className="font-semibold text-slate-800">{report.ranking.length}</strong> {rankingBy === 'nome' ? 'técnicos' : 'logins'}</p>
      </div>
      {report.excludedWithoutExecution > 0 && <p className="text-xs text-amber-700">{formatNumber(report.excludedWithoutExecution)} {report.excludedWithoutExecution === 1 ? 'confirmada sem Data Exec. válida, excluída' : 'confirmadas sem Data Exec. válida, excluídas'} das contagens.</p>}
      {report.excludedInvalidYear > 0 && <p className="text-xs text-amber-700">{formatNumber(report.excludedInvalidYear)} {report.excludedInvalidYear === 1 ? 'confirmada com ano inconsistente na Data Exec., excluída' : 'confirmadas com ano inconsistente na Data Exec., excluídas'} das contagens.</p>}
      {report.futureExecutions > 0 && <p className="text-xs text-amber-700">{formatNumber(report.futureExecutions)} {report.futureExecutions === 1 ? 'confirmada possui Data Exec. futura' : 'confirmadas possuem Data Exec. futura'}. Confira os registros em Dados Detalhados.</p>}

      <div className="grid min-w-0 grid-cols-1 border-t-2 border-[#e31325] bg-white xl:grid-cols-2">
        <div className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-4">
            <h3 className="text-base font-bold text-slate-900">{report.groupLabel}</h3>
            <div className="inline-flex rounded-md border border-slate-200 p-0.5" role="group" aria-label="Agrupar comparação mensal">
              {(['alocacao', 'frente'] as const).map((value) => <button key={value} type="button" aria-pressed={groupBy === value} onClick={() => setGroupBy(value)} className={cn('h-8 rounded px-3 text-xs font-semibold', groupBy === value ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50')}>{value === 'alocacao' ? 'Cidade' : 'Frente'}</button>)}
            </div>
          </div>
          <MonthlyMatrix months={report.months} rows={report.groups} totals={report.totals} label={report.groupLabel} bars />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-4">
            <h3 className="text-base font-bold text-slate-900">Ranking por {rankingBy === 'nome' ? 'técnico' : 'login'}</h3>
            <div className="inline-flex rounded-md border border-slate-200 p-0.5" role="group" aria-label="Agrupar ranking">
              {(['login_criador', 'nome'] as const).map((value) => <button key={value} type="button" aria-pressed={rankingBy === value} onClick={() => setRankingBy(value)} className={cn('h-8 rounded px-3 text-xs font-semibold', rankingBy === value ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50')}>{value === 'nome' ? 'Técnico' : 'Login'}</button>)}
            </div>
          </div>
          <MonthlyMatrix months={report.months} rows={report.ranking} totals={report.totals} label={report.rankingLabel} />
        </div>
      </div>
    </section>
  );
}
