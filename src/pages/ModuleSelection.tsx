import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  CheckCircle2,
  Clock3,
  MonitorUp,
  RadioTower,
  RefreshCw,
  X,
  XCircle,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { getFrenteForTipo } from '@/config/frentesMap';
import { useAtividades } from '@/hooks/useAtividades';
import { ActivityData, ActivityStatus } from '@/types/activity';
import { getActivityStatus } from '@/utils/activityHelpers';

interface DistributionItem {
  label: string;
  count: number;
  productive?: number;
}

const formatLocalIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeLabel = (value: string | undefined, fallback: string) => {
  const label = value?.replace(/\s+/g, ' ').trim();
  return label || fallback;
};

const getCityLabel = (item: ActivityData) =>
  normalizeLabel(item.Cidade || item.cidade, 'Não informada').toUpperCase();

const normalizeComparison = (value: string | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');

const disconnectionActivityTypes = new Set([
  'retirada equipamento',
  'desconexao inad',
  'desconexao opcao',
  'retirar ponto',
]);

const getTechnologyLabel = (item: ActivityData) => {
  const technology = item.Tecnologia?.trim();
  if (technology) return technology.toUpperCase();

  return disconnectionActivityTypes.has(normalizeComparison(item['Tipo de Atividade']))
    ? 'DESCONEXÃO'
    : 'NÃO INFORMADA';
};

const getServiceLabel = (item: ActivityData) => {
  const rawType = normalizeLabel(item['Tipo de Atividade'], 'Não informado');
  return getFrenteForTipo(rawType, item['Tipo O.S 1']) || rawType;
};

const groupItems = (
  data: ActivityData[],
  getLabel: (item: ActivityData) => string,
  includeProductivity = false,
): DistributionItem[] => {
  const grouped = new Map<string, DistributionItem>();

  data.forEach((item) => {
    const label = getLabel(item);
    const current = grouped.get(label) || { label, count: 0, productive: 0 };
    current.count += 1;
    if (includeProductivity && getActivityStatus(item) === 'Produtiva') {
      current.productive = (current.productive || 0) + 1;
    }
    grouped.set(label, current);
  });

  return Array.from(grouped.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const statusStyles: Record<ActivityStatus, { bar: string; text: string }> = {
  Produtiva: { bar: 'bg-emerald-500', text: 'text-emerald-700' },
  Improdutiva: { bar: 'bg-rose-500', text: 'text-rose-700' },
  Pendente: { bar: 'bg-amber-500', text: 'text-amber-700' },
  Cancelado: { bar: 'bg-slate-600', text: 'text-slate-700' },
};

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: number | string;
  detail: string;
  icon: typeof Activity;
  iconClassName: string;
}) {
  return (
    <div className="min-h-[132px] rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{detail}</p>
    </div>
  );
}

function DistributionPanel({
  title,
  subtitle,
  items,
  colorClassName,
  showProductivity = false,
  emptyMessage,
  selectedLabel,
  onSelect,
}: {
  title: string;
  subtitle: string;
  items: DistributionItem[];
  colorClassName: string;
  showProductivity?: boolean;
  emptyMessage: string;
  selectedLabel?: string | null;
  onSelect?: (label: string) => void;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
        <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-slate-200 px-4 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const percentage = (item.count / max) * 100;
            const productivity = item.count > 0 && showProductivity
              ? Math.round(((item.productive || 0) / item.count) * 100)
              : null;

            const content = (
              <>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-slate-700" title={item.label}>
                    {item.label}
                  </span>
                  <span className="shrink-0 font-extrabold text-slate-950">
                    {item.count}
                    {productivity !== null && (
                      <span className="ml-2 font-semibold text-slate-400">{productivity}%</span>
                    )}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${colorClassName}`}
                    style={{ width: `${Math.max(3, percentage)}%` }}
                  />
                </div>
              </>
            );

            return onSelect ? (
              <button
                key={item.label}
                type="button"
                aria-pressed={selectedLabel === item.label}
                onClick={() => onSelect(item.label)}
                className={`block w-full rounded-md p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e31325] ${
                  selectedLabel === item.label
                    ? 'bg-red-50 ring-1 ring-[#e31325]'
                    : 'hover:bg-slate-50'
                }`}
              >
                {content}
              </button>
            ) : (
              <div key={item.label}>{content}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DailyOverview({
  data,
  cities,
  selectedCity,
  onSelectCity,
  presentation = false,
}: {
  data: ActivityData[];
  cities: DistributionItem[];
  selectedCity: string | null;
  onSelectCity: (city: string | null) => void;
  presentation?: boolean;
}) {
  const statusCounts = useMemo(() => {
    const initial: Record<ActivityStatus, number> = {
      Produtiva: 0,
      Improdutiva: 0,
      Pendente: 0,
      Cancelado: 0,
    };
    data.forEach((item) => {
      initial[getActivityStatus(item)] += 1;
    });
    return initial;
  }, [data]);

  const services = useMemo(() => groupItems(data, getServiceLabel, true), [data]);
  const technologies = useMemo(
    () => groupItems(data, getTechnologyLabel),
    [data],
  );

  const finished = statusCounts.Produtiva + statusCounts.Improdutiva;
  const productivity = finished > 0 ? (statusCounts.Produtiva / finished) * 100 : 0;

  return (
    <>
      {selectedCity && (
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <span className="min-w-0 break-words">Cidade: {selectedCity}</span>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => onSelectCity(null)}
            title="Mostrar todas as cidades"
            aria-label="Mostrar todas as cidades"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className={presentation ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-5'}>
        <MetricCard
          label="Serviços do dia"
          value={data.length}
          detail={`${new Set(data.map((item) => item.Recurso).filter(Boolean)).size} técnicos na agenda`}
          icon={Activity}
          iconClassName="bg-sky-50 text-sky-700"
        />
        <MetricCard
          label="Produtivas"
          value={statusCounts.Produtiva}
          detail={`${productivity.toFixed(1)}% dos serviços finalizados`}
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-700"
        />
        <MetricCard
          label="Improdutivas"
          value={statusCounts.Improdutiva}
          detail="Finalizadas sem produtividade"
          icon={XCircle}
          iconClassName="bg-rose-50 text-rose-700"
        />
        <MetricCard
          label="Pendentes"
          value={statusCounts.Pendente}
          detail="Aguardando encerramento"
          icon={Clock3}
          iconClassName="bg-amber-50 text-amber-700"
        />
        <MetricCard
          label="Canceladas"
          value={statusCounts.Cancelado}
          detail="Retiradas da execução"
          icon={Ban}
          iconClassName="bg-slate-100 text-slate-700"
        />
      </div>

      <div className={presentation ? 'mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.9fr_0.9fr]' : 'mt-6 grid gap-5 xl:grid-cols-[1.25fr_0.9fr_0.9fr]'}>
        <DistributionPanel
          title="Serviços por tipo"
          subtitle="Volume e produtividade por frente"
          items={services}
          colorClassName="bg-[#e31325]"
          showProductivity
          emptyMessage="Nenhum serviço registrado hoje."
        />
        <DistributionPanel
          title="Tecnologias"
          subtitle="Distribuição da agenda"
          items={technologies}
          colorClassName="bg-sky-500"
          emptyMessage="Nenhuma tecnologia informada hoje."
        />
        <DistributionPanel
          title="Cidades"
          subtitle="Concentração dos atendimentos"
          items={cities}
          selectedLabel={selectedCity}
          onSelect={(city) => onSelectCity(selectedCity === city ? null : city)}
          colorClassName="bg-amber-500"
          emptyMessage="Nenhuma cidade informada hoje."
        />
      </div>

      {data.length > 0 && (
        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="mr-auto">
              <h2 className="text-base font-extrabold text-slate-950">Situação da operação</h2>
              <p className="text-xs font-medium text-slate-500">Composição dos serviços do dia</p>
            </div>
            {(Object.keys(statusCounts) as ActivityStatus[]).map((status) => (
              <div key={status} className="flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-sm ${statusStyles[status].bar}`} />
                <span className="font-medium text-slate-500">{status}</span>
                <strong className={statusStyles[status].text}>{statusCounts[status]}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {(Object.keys(statusCounts) as ActivityStatus[]).map((status) => (
              statusCounts[status] > 0 && (
                <div
                  key={status}
                  className={statusStyles[status].bar}
                  style={{ width: `${(statusCounts[status] / data.length) * 100}%` }}
                  title={`${status}: ${statusCounts[status]}`}
                />
              )
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default function ModuleSelection() {
  const { data, isLoading, error, fetchData } = useAtividades();
  const [isPresenting, setIsPresenting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const cities = useMemo(() => groupItems(data, getCityLabel), [data]);
  const filteredData = useMemo(
    () => selectedCity ? data.filter((item) => getCityLabel(item) === selectedCity) : data,
    [data, selectedCity],
  );

  const today = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => formatLocalIsoDate(today), [today]);
  const todayLabel = useMemo(
    () => today.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
    [today],
  );

  useEffect(() => {
    fetchData(todayIso, todayIso).then(() => setLastUpdated(new Date()));
  }, [fetchData, todayIso]);

  useEffect(() => {
    if (!isPresenting) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsPresenting(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isPresenting]);

  const refresh = async () => {
    await fetchData(todayIso, todayIso);
    setLastUpdated(new Date());
  };

  return (
    <AppShell>
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1600px]">
          <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#e31325]">
                <RadioTower className="h-4 w-4" />
                Operação diária
              </div>
              <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Dashboard</h1>
              <p className="mt-1 capitalize text-sm font-medium text-slate-500">{todayLabel}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 hidden text-xs font-medium text-slate-400 sm:inline">
                Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <Button variant="outline" size="icon" onClick={refresh} disabled={isLoading} title="Atualizar dados" aria-label="Atualizar dados">
                <RefreshCw className={isLoading ? 'animate-spin' : ''} />
              </Button>
              <Button onClick={() => setIsPresenting(true)} className="bg-[#e31325] hover:bg-[#bd1020]">
                <MonitorUp className="h-4 w-4" />
                Apresentar
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              Não foi possível carregar os dados do dia: {error}
            </div>
          )}

          {isLoading && data.length === 0 ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-slate-500">
              <RefreshCw className="mb-3 h-7 w-7 animate-spin text-[#e31325]" />
              <p className="text-sm font-semibold">Carregando o resumo diário...</p>
            </div>
          ) : (
            <DailyOverview data={filteredData} cities={cities} selectedCity={selectedCity} onSelectCity={setSelectedCity} />
          )}
        </div>
      </main>

      {isPresenting && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f6f7f9]" role="dialog" aria-modal="true" aria-label="Apresentação do resumo diário">
          <div className="min-h-screen p-5 lg:p-8">
            <div className="mx-auto max-w-[1800px]">
              <header className="mb-5 flex items-center justify-between gap-5 border-b border-slate-200 pb-5">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-sm">
                    <img src={`${import.meta.env.BASE_URL}LogoNovo.png`} alt="Logo TechNET" className="h-11 w-11 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#e31325]">TechNET</p>
                    <h1 className="truncate text-2xl font-extrabold text-slate-950 lg:text-3xl">Resumo diário da operação</h1>
                    <p className="capitalize text-sm font-medium text-slate-500">{todayLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPresenting(false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  aria-label="Fechar apresentação"
                  title="Fechar apresentação"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>
              <DailyOverview data={filteredData} cities={cities} selectedCity={selectedCity} onSelectCity={setSelectedCity} presentation />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
