import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CalendarRange,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleGauge,
  FileText,
  MapPin,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FRENTES, getFrenteForTipo } from '@/config/frentesMap';
import { toast } from '@/hooks/use-toast';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { cn } from '@/lib/utils';

type TrendScope = 'total' | 'comparavel';
type SummaryStatus = 'Produtiva' | 'Improdutiva' | 'Cancelado' | 'Pendente';

interface TrendRow {
  escopo: TrendScope;
  mes: string;
  cidade: string;
  tipo_atividade: string;
  tipo_os1: string;
  status_resumo: SummaryStatus;
  quantidade: number | string;
}

interface EnrichedTrendRow extends Omit<TrendRow, 'quantidade'> {
  quantidade: number;
  frente: string;
  monthKey: string;
}

interface MonthlySummary {
  monthKey: string;
  monthLabel: string;
  total: number;
  produtivas: number;
  improdutivas: number;
  cancelados: number;
  pendentes: number;
  cancellationRate: number;
  variation: number | null;
}

interface ChangeRow {
  name: string;
  previous: number;
  current: number;
  difference: number;
  percentage: number | null;
}

const PAGE_SIZE = 1000;
const UNCLASSIFIED_FRONT = 'NÃO CLASSIFICADA';

const numberFormatter = new Intl.NumberFormat('pt-BR');
const compactNumberFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const tooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)',
  color: '#0f172a',
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);

const formatShortDate = (value: string) =>
  parseIsoDate(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const monthKeyFromValue = (value: string) => value.slice(0, 7);

const formatMonth = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  const monthName = new Date(year, month - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '');
  return `${monthName.replace(/^./, (character) => character.toUpperCase())}/${String(year).slice(-2)}`;
};

const calculatePercentage = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
};

const formatPercentage = (value: number) =>
  `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const statusKeys: Record<SummaryStatus, keyof Pick<MonthlySummary, 'produtivas' | 'improdutivas' | 'cancelados' | 'pendentes'>> = {
  Produtiva: 'produtivas',
  Improdutiva: 'improdutivas',
  Cancelado: 'cancelados',
  Pendente: 'pendentes',
};

const aggregateMonths = (
  rows: EnrichedTrendRow[],
  scope: TrendScope,
  monthKeys: string[],
): MonthlySummary[] => {
  const buckets = new Map<string, MonthlySummary>(monthKeys.map((monthKey) => [monthKey, {
    monthKey,
    monthLabel: formatMonth(monthKey),
    total: 0,
    produtivas: 0,
    improdutivas: 0,
    cancelados: 0,
    pendentes: 0,
    cancellationRate: 0,
    variation: null,
  }]));

  rows
    .filter((row) => row.escopo === scope)
    .forEach((row) => {
      const current = buckets.get(row.monthKey);
      if (!current) return;

      current.total += row.quantidade;
      current[statusKeys[row.status_resumo]] += row.quantidade;
    });

  const summaries = Array.from(buckets.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return summaries.map((summary, index) => ({
    ...summary,
    cancellationRate: summary.total > 0 ? (summary.cancelados / summary.total) * 100 : 0,
    variation: index === 0 ? null : calculatePercentage(summary.total, summaries[index - 1].total),
  }));
};

const buildChanges = (
  rows: EnrichedTrendRow[],
  scope: TrendScope,
  currentMonth: string | undefined,
  previousMonth: string | undefined,
  keySelector: (row: EnrichedTrendRow) => string,
): ChangeRow[] => {
  if (!currentMonth || !previousMonth) return [];

  const buckets = new Map<string, { previous: number; current: number }>();
  rows
    .filter((row) => row.escopo === scope && (row.monthKey === currentMonth || row.monthKey === previousMonth))
    .forEach((row) => {
      const key = keySelector(row);
      const bucket = buckets.get(key) || { previous: 0, current: 0 };
      if (row.monthKey === currentMonth) bucket.current += row.quantidade;
      if (row.monthKey === previousMonth) bucket.previous += row.quantidade;
      buckets.set(key, bucket);
    });

  return Array.from(buckets.entries())
    .map(([name, values]) => ({
      name,
      previous: values.previous,
      current: values.current,
      difference: values.current - values.previous,
      percentage: calculatePercentage(values.current, values.previous),
    }))
    .filter((item) => item.previous > 0 || item.current > 0)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
};

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: 'red' | 'blue' | 'green' | 'amber';
  delta?: number | null;
}

const metricTones = {
  red: 'border-red-100 bg-red-50 text-[#e31325]',
  blue: 'border-sky-100 bg-sky-50 text-sky-600',
  green: 'border-emerald-100 bg-emerald-50 text-emerald-600',
  amber: 'border-amber-100 bg-amber-50 text-amber-600',
};

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [search, setSearch] = useState('');
  const visibleOptions = options.filter((option) => option.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const summary = selected.length === 0
    ? `Todas as ${label === 'Cidade' ? 'cidades' : 'frentes'}`
    : selected.length === 1 ? selected[0] : `${selected.length} selecionadas`;

  const toggle = (option: string) => onChange(selected.includes(option)
    ? selected.filter((value) => value !== option)
    : [...selected, option]);

  return (
    <div className="space-y-1.5 text-sm font-bold text-slate-700">
      <span>{label}</span>
      <Popover onOpenChange={(open) => { if (!open) setSearch(''); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" aria-label={`Filtrar por ${label.toLocaleLowerCase('pt-BR')}`} className="h-10 w-full justify-between gap-2 bg-white px-3 font-medium text-slate-700">
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[230px] p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar ${label.toLocaleLowerCase('pt-BR')}...`} className="pl-8" />
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            <button type="button" onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-medium hover:bg-slate-50">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300">{selected.length === 0 && <Check className="h-3 w-3 text-[#e31325]" />}</span>
              Todas
            </button>
            {visibleOptions.map((option) => (
              <button key={option} type="button" role="checkbox" aria-checked={selected.includes(option)} onClick={() => toggle(option)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm font-medium hover:bg-slate-50">
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected.includes(option) ? 'border-[#e31325] bg-[#e31325] text-white' : 'border-slate-300')}>
                  {selected.includes(option) && <Check className="h-3 w-3" />}
                </span>
                <span className="break-words">{option}</span>
              </button>
            ))}
            {visibleOptions.length === 0 && <p className="px-2 py-3 text-sm font-normal text-slate-500">Nenhuma opção encontrada</p>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MetricCard({ label, value, detail, icon, tone, delta }: MetricCardProps) {
  return (
    <article className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-950">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md border', metricTones[tone])}>
          {icon}
        </div>
      </div>
      <div className="mt-3 flex min-h-5 items-center gap-1.5 text-xs font-medium text-slate-500">
        {delta !== undefined && delta !== null && delta !== 0 && (
          delta > 0
            ? <ArrowUpRight className="h-4 w-4 shrink-0 text-sky-600" />
            : <ArrowDownRight className="h-4 w-4 shrink-0 text-amber-600" />
        )}
        <span>{detail}</span>
      </div>
    </article>
  );
}

function VariationCell({ item }: { item: ChangeRow }) {
  if (item.previous === 0 && item.current > 0) {
    return <span className="font-bold text-sky-700">Novo volume</span>;
  }

  const positive = item.difference > 0;
  const negative = item.difference < 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-bold tabular-nums',
        positive && 'text-sky-700',
        negative && 'text-amber-700',
        !positive && !negative && 'text-slate-500',
      )}
    >
      {positive && <ArrowUpRight className="h-4 w-4" />}
      {negative && <ArrowDownRight className="h-4 w-4" />}
      {item.percentage === null ? '-' : formatPercentage(item.percentage)}
    </span>
  );
}

export default function ServiceTrends() {
  const [rows, setRows] = useState<TrendRow[]>([]);
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedFronts, setSelectedFronts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (startDate?: string, endDate?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      let start = startDate;
      let end = endDate;
      if (!start || !end) {
        const { data: latestRows, error: latestError } = await externalSupabase
          .from('atividades')
          .select('data_atividade')
          .not('data_atividade', 'is', null)
          .order('data_atividade', { ascending: false })
          .limit(1);

        if (latestError) throw new Error(latestError.message);
        const latestDate = latestRows?.[0]?.data_atividade as string | undefined;
        if (!latestDate) {
          setRows([]);
          setAppliedStartDate('');
          setReferenceDate('');
          return;
        }

        const previousCompleteDay = new Date();
        previousCompleteDay.setDate(previousCompleteDay.getDate() - 1);
        end = latestDate.slice(0, 10) > toIsoDate(previousCompleteDay)
          ? toIsoDate(previousCompleteDay)
          : latestDate.slice(0, 10);
        const latest = parseIsoDate(end);
        start = toIsoDate(new Date(latest.getFullYear(), latest.getMonth() - 2, 1));
      }

      const parameters = { p_inicio: start, p_fim: end };
      const loadedRows: TrendRow[] = [];

      for (let page = 0; ; page += 1) {
        const from = page * PAGE_SIZE;
        const { data, error: queryError } = await externalSupabase
          .rpc('get_tendencia_servicos', parameters)
          .range(from, from + PAGE_SIZE - 1);

        if (queryError) throw new Error(queryError.message);
        const pageRows = (data || []) as TrendRow[];
        loadedRows.push(...pageRows);
        if (pageRows.length < PAGE_SIZE) break;
      }

      setRows(loadedRows);
      setAppliedStartDate(start);
      setReferenceDate(end);
      setDraftStartDate(start);
      setDraftEndDate(end);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a tendência de serviços.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enrichedRows = useMemo<EnrichedTrendRow[]>(
    () => rows.map((row) => ({
      ...row,
      quantidade: Number(row.quantidade) || 0,
      frente: getFrenteForTipo(row.tipo_atividade, row.tipo_os1) || UNCLASSIFIED_FRONT,
      monthKey: monthKeyFromValue(row.mes),
    })),
    [rows],
  );

  const cityOptions = useMemo(
    () => Array.from(new Set(enrichedRows.map((row) => row.cidade))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [enrichedRows],
  );

  const frontOptions = useMemo(() => {
    const present = new Set(enrichedRows.map((row) => row.frente));
    return [...FRENTES.filter((front) => present.has(front)), ...(present.has(UNCLASSIFIED_FRONT) ? [UNCLASSIFIED_FRONT] : [])];
  }, [enrichedRows]);

  const filteredRows = useMemo(
    () => enrichedRows.filter((row) => (
      (selectedCities.length === 0 || selectedCities.includes(row.cidade))
      && (selectedFronts.length === 0 || selectedFronts.includes(row.frente))
    )),
    [enrichedRows, selectedCities, selectedFronts],
  );

  const monthKeys = useMemo(() => {
    if (!appliedStartDate || !referenceDate) return [];
    const first = parseIsoDate(appliedStartDate);
    const last = parseIsoDate(referenceDate);
    const months: string[] = [];
    for (let year = first.getFullYear(), month = first.getMonth();
      year < last.getFullYear() || (year === last.getFullYear() && month <= last.getMonth());
      month += 1) {
      if (month === 12) {
        year += 1;
        month = 0;
      }
      months.push(toIsoDate(new Date(year, month, 1)).slice(0, 7));
    }
    return months;
  }, [appliedStartDate, referenceDate]);

  const comparisonDay = referenceDate ? parseIsoDate(referenceDate).getDate() : 0;
  const startsOnFirstDay = appliedStartDate ? parseIsoDate(appliedStartDate).getDate() === 1 : false;
  const endsOnLastDay = referenceDate
    ? parseIsoDate(referenceDate).getDate() === new Date(parseIsoDate(referenceDate).getFullYear(), parseIsoDate(referenceDate).getMonth() + 1, 0).getDate()
    : false;
  const trendScope: TrendScope = startsOnFirstDay && !endsOnLastDay ? 'comparavel' : 'total';
  const comparisonNote = trendScope === 'comparavel'
    ? `Dias 1 a ${comparisonDay} de cada mês`
    : startsOnFirstDay && endsOnLastDay
      ? 'Meses completos'
      : 'Volume mensal no período; meses de borda podem ser parciais';

  const displayMonths = useMemo(
    () => aggregateMonths(filteredRows, trendScope, monthKeys),
    [filteredRows, monthKeys, trendScope],
  );
  const totalMonths = useMemo(
    () => aggregateMonths(filteredRows, 'total', monthKeys),
    [filteredRows, monthKeys],
  );
  const currentMonth = displayMonths.at(-1);
  const previousMonth = displayMonths.at(-2);
  const firstMonth = displayMonths[0];

  const totalPeriod = totalMonths.reduce((sum, month) => sum + month.total, 0);
  const cancelledPeriod = totalMonths.reduce((sum, month) => sum + month.cancelados, 0);
  const cancellationRate = totalPeriod > 0 ? (cancelledPeriod / totalPeriod) * 100 : 0;
  const currentVsPrevious = currentMonth && previousMonth
    ? calculatePercentage(currentMonth.total, previousMonth.total)
    : null;
  const periodTrend = currentMonth && firstMonth && currentMonth.monthKey !== firstMonth.monthKey
    ? calculatePercentage(currentMonth.total, firstMonth.total)
    : null;

  const currentMonthKey = currentMonth?.monthKey;
  const previousMonthKey = previousMonth?.monthKey;
  const serviceChanges = useMemo(
    () => buildChanges(filteredRows, trendScope, currentMonthKey, previousMonthKey, (row) => row.tipo_atividade).slice(0, 10),
    [currentMonthKey, filteredRows, previousMonthKey, trendScope],
  );
  const cityChanges = useMemo(
    () => buildChanges(filteredRows, trendScope, currentMonthKey, previousMonthKey, (row) => row.cidade)
      .sort((a, b) => b.current - a.current)
      .slice(0, 8),
    [currentMonthKey, filteredRows, previousMonthKey, trendScope],
  );

  const periodLabel = appliedStartDate && referenceDate
    ? `${formatShortDate(appliedStartDate)} a ${formatShortDate(referenceDate)}`
    : 'Período recente';
  const comparisonDetail = previousMonth
    ? `vs ${previousMonth.monthLabel}; ${comparisonNote.toLowerCase()}`
    : 'Sem mês anterior no período';
  const invalidPeriod = Boolean(draftStartDate && draftEndDate && draftStartDate > draftEndDate);

  const handleGenerateReport = async () => {
    if (!appliedStartDate || !referenceDate || isLoading || isGeneratingReport) return;
    setIsGeneratingReport(true);
    try {
      const { generateServiceTrendsReport } = await import('@/utils/serviceTrendsReport');
      generateServiceTrendsReport({
        startDate: appliedStartDate,
        endDate: referenceDate,
        periodLabel,
        comparisonNote,
        cities: selectedCities,
        fronts: selectedFronts,
        months: displayMonths,
        serviceChanges,
        cityChanges,
        totalReceived: totalPeriod,
        totalCancelled: cancelledPeriod,
        cancellationRate,
        periodTrend,
      });
      toast({ title: 'Relatório gerado', description: 'O PDF foi baixado com os filtros aplicados.' });
    } catch (caught: unknown) {
      toast({
        title: 'Não foi possível gerar o relatório',
        description: caught instanceof Error ? caught.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <AppShell>
      <main className="min-h-screen bg-[#f6f7f9] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px] space-y-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[#e31325]">
                <ChartNoAxesCombined className="h-4 w-4" />
                Análise operacional
              </div>
              <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Tendência de Serviços</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Volume recebido, cancelamentos e evolução no período selecionado
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {referenceDate && (
                <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600">
                  <CalendarRange className="h-4 w-4 text-slate-400" />
                  Período até {formatShortDate(referenceDate)}
                </div>
              )}
              <Button variant="outline" onClick={() => loadData(appliedStartDate, referenceDate)} disabled={isLoading} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                Atualizar
              </Button>
              <Button onClick={handleGenerateReport} disabled={isLoading || isGeneratingReport || !referenceDate} className="gap-2 bg-[#e31325] hover:bg-[#bd1020]">
                <FileText className="h-4 w-4" />
                {isGeneratingReport ? 'Gerando...' : 'Gerar relatório'}
              </Button>
            </div>
          </header>

          <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <form
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                if (draftStartDate && draftEndDate && !invalidPeriod) loadData(draftStartDate, draftEndDate);
              }}
            >
              <label className="space-y-1.5 text-sm font-bold text-slate-700">
                Data inicial
                <Input type="date" value={draftStartDate} onChange={(event) => setDraftStartDate(event.target.value)} required aria-invalid={invalidPeriod} />
              </label>
              <label className="space-y-1.5 text-sm font-bold text-slate-700">
                Data final
                <Input type="date" value={draftEndDate} onChange={(event) => setDraftEndDate(event.target.value)} required aria-invalid={invalidPeriod} />
              </label>
              <MultiSelectFilter label="Cidade" options={cityOptions} selected={selectedCities} onChange={setSelectedCities} />
              <MultiSelectFilter label="Frente" options={frontOptions} selected={selectedFronts} onChange={setSelectedFronts} />
              <Button type="submit" disabled={isLoading || !draftStartDate || !draftEndDate || invalidPeriod} className="w-full xl:w-auto">
                Aplicar período
              </Button>
            </form>
            <div className="text-sm text-slate-500">
              {invalidPeriod && <p className="mb-1 font-semibold text-red-600">A data inicial deve ser anterior ou igual à data final.</p>}
              <p className="font-semibold text-slate-700">Período: {periodLabel}</p>
              <p className="mt-1">Volume recebido inclui todos os status. {comparisonNote}.</p>
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white">
              <div className="text-center">
                <RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#e31325]" />
                <p className="mt-3 text-sm font-semibold text-slate-500">Carregando dados do período...</p>
              </div>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white py-16 text-center">
              <Activity className="mx-auto h-9 w-9 text-slate-300" />
              <p className="mt-3 font-bold text-slate-700">Nenhum serviço encontrado para os filtros selecionados.</p>
            </div>
          ) : (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Volume total recebido"
                  value={numberFormatter.format(totalPeriod)}
                  detail={periodLabel}
                  icon={<Activity className="h-5 w-5" />}
                  tone="blue"
                />
                <MetricCard
                  label={`Volume em ${currentMonth?.monthLabel || 'último mês'}`}
                  value={numberFormatter.format(currentMonth?.total || 0)}
                  detail={currentVsPrevious === null ? comparisonDetail : `${formatPercentage(currentVsPrevious)} ${comparisonDetail}`}
                  delta={currentVsPrevious}
                  icon={<CircleGauge className="h-5 w-5" />}
                  tone="green"
                />
                <MetricCard
                  label="Serviços cancelados"
                  value={numberFormatter.format(cancelledPeriod)}
                  detail={`${formatPercentage(cancellationRate)} do volume recebido; inclui não concluídos`}
                  icon={<Ban className="h-5 w-5" />}
                  tone="red"
                />
                <MetricCard
                  label="Tendência no período"
                  value={periodTrend === null ? (firstMonth && currentMonth?.monthKey !== firstMonth.monthKey && currentMonth?.total ? 'Novo volume' : '-') : formatPercentage(periodTrend)}
                  detail={`${currentMonth?.monthLabel || '-'} vs ${firstMonth?.monthLabel || '-'}; ${comparisonNote.toLowerCase()}`}
                  delta={periodTrend}
                  icon={periodTrend !== null && periodTrend < 0
                    ? <TrendingDown className="h-5 w-5" />
                    : <TrendingUp className="h-5 w-5" />}
                  tone="amber"
                />
              </section>

              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
                <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-5">
                    <h2 className="text-base font-extrabold text-slate-950">Volume recebido por mês</h2>
                    <p className="mt-1 text-xs font-medium text-slate-500">Composição por status. {comparisonNote}.</p>
                  </div>
                  <div className="h-[340px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayMonths} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="monthLabel" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(value) => compactNumberFormatter.format(Number(value))} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: number, name: string) => [numberFormatter.format(Number(value)), name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                        <Bar dataKey="produtivas" name="Produtivas" stackId="volume" fill="#16a34a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="improdutivas" name="Improdutivas" stackId="volume" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="cancelados" name="Cancelados" stackId="volume" fill="#e31325" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="pendentes" name="Pendentes" stackId="volume" fill="#64748b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-5">
                    <h2 className="text-base font-extrabold text-slate-950">Taxa de cancelamento</h2>
                    <p className="mt-1 text-xs font-medium text-slate-500">Participação dos cancelados no volume mensal recebido</p>
                  </div>
                  <div className="h-[340px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={displayMonths} margin={{ top: 18, right: 18, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="monthLabel" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} width={42} />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: number) => [formatPercentage(Number(value)), 'Cancelados']}
                        />
                        <Line type="monotone" dataKey="cancellationRate" name="Cancelados" stroke="#e31325" strokeWidth={3} dot={{ r: 5, fill: '#ffffff', strokeWidth: 3 }} activeDot={{ r: 7 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="text-base font-extrabold text-slate-950">Resumo mensal</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">{comparisonNote}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Mês</th>
                        <th className="px-5 py-3 text-right">Recebidos</th>
                        <th className="px-5 py-3 text-right">Produtivos</th>
                        <th className="px-5 py-3 text-right">Improdutivos</th>
                        <th className="px-5 py-3 text-right">Cancelados</th>
                        <th className="px-5 py-3 text-right">Pendentes</th>
                        <th className="px-5 py-3 text-right">Taxa cancel.</th>
                        <th className="px-5 py-3 text-right">Variação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayMonths.map((month) => (
                        <tr key={month.monthKey} className="text-slate-700">
                          <td className="px-5 py-3.5 font-bold text-slate-950">{month.monthLabel}</td>
                          <td className="px-5 py-3.5 text-right font-bold tabular-nums">{numberFormatter.format(month.total)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums">{numberFormatter.format(month.produtivas)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums">{numberFormatter.format(month.improdutivas)}</td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-[#e31325]">{numberFormatter.format(month.cancelados)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums">{numberFormatter.format(month.pendentes)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums">{formatPercentage(month.cancellationRate)}</td>
                          <td className="px-5 py-3.5 text-right">
                            {month.variation === null ? (
                              <span className="text-slate-400">{month.monthKey === monthKeys[0] ? 'Base' : 'Novo volume'}</span>
                            ) : (
                              <span className={cn('inline-flex items-center gap-1 font-bold', month.variation >= 0 ? 'text-sky-700' : 'text-amber-700')}>
                                {month.variation >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                {formatPercentage(month.variation)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-2">
                <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-base font-extrabold text-slate-950">Serviços que mais variaram</h2>
                    <p className="mt-1 text-xs font-medium text-slate-500">Maiores mudanças de volume entre os dois meses mais recentes</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Serviço</th>
                          <th className="px-4 py-3 text-right">Anterior</th>
                          <th className="px-4 py-3 text-right">Atual</th>
                          <th className="px-5 py-3 text-right">Variação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {serviceChanges.map((item) => (
                          <tr key={item.name}>
                            <td className="max-w-[280px] px-5 py-3 font-semibold text-slate-800"><span className="line-clamp-2">{item.name}</span></td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">{numberFormatter.format(item.previous)}</td>
                            <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(item.current)}</td>
                            <td className="px-5 py-3 text-right"><VariationCell item={item} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-950">Volume por cidade</h2>
                      <p className="mt-1 text-xs font-medium text-slate-500">Último mês do período contra o mês anterior. {comparisonNote}.</p>
                    </div>
                    <MapPin className="h-5 w-5 shrink-0 text-[#e31325]" />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Cidade</th>
                          <th className="px-4 py-3 text-right">Anterior</th>
                          <th className="px-4 py-3 text-right">Atual</th>
                          <th className="px-5 py-3 text-right">Variação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cityChanges.map((item) => (
                          <tr key={item.name}>
                            <td className="px-5 py-3 font-semibold text-slate-800">{item.name}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-500">{numberFormatter.format(item.previous)}</td>
                            <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{numberFormatter.format(item.current)}</td>
                            <td className="px-5 py-3 text-right"><VariationCell item={item} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              </section>
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
