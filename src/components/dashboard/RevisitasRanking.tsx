import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Gauge,
  Medal,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useDashboard } from '@/contexts/DashboardContext';
import {
  calculateTecnicosRevisita,
  FaixaRevisita,
  getFaixaRevisita,
} from '@/utils/revisitasAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type RankingMode = 'porcentagem' | 'revisitas';

const FAIXAS: Record<FaixaRevisita, { label: string; color: string; textClass: string; bgClass: string }> = {
  critico: {
    label: 'Crítico',
    color: '#ef4444',
    textClass: 'text-red-600',
    bgClass: 'bg-red-50 border-red-200',
  },
  atencao: {
    label: 'Atenção',
    color: '#f59e0b',
    textClass: 'text-amber-600',
    bgClass: 'bg-amber-50 border-amber-200',
  },
  controlado: {
    label: 'Controlado',
    color: '#22c55e',
    textClass: 'text-green-600',
    bgClass: 'bg-green-50 border-green-200',
  },
  sem_base: {
    label: 'Sem base de OS',
    color: '#94a3b8',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-50 border-slate-200',
  },
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
  boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const getShortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

const getRankColor = (rank: number) => {
  if (rank === 1) return 'bg-amber-100 text-amber-700 border-amber-300';
  if (rank === 2) return 'bg-slate-100 text-slate-700 border-slate-300';
  if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300';
  return 'bg-muted text-muted-foreground border-border';
};

export const RevisitasRanking: React.FC = () => {
  const { filteredData } = useDashboard();
  const [rankingMode, setRankingMode] = useState<RankingMode>('porcentagem');
  const [minimumOS, setMinimumOS] = useState('0');

  const tecnicos = useMemo(
    () => calculateTecnicosRevisita(filteredData),
    [filteredData]
  );

  const filteredTechnicians = useMemo(() => {
    const minimum = Number(minimumOS);
    return tecnicos.filter((item) => item.quantidadeOS >= minimum);
  }, [minimumOS, tecnicos]);

  const ranking = useMemo(() => {
    return [...filteredTechnicians].sort((a, b) => {
      if (rankingMode === 'porcentagem') {
        return b.porcentagem - a.porcentagem || b.revisitas - a.revisitas;
      }
      return b.revisitas - a.revisitas || b.porcentagem - a.porcentagem;
    });
  }, [filteredTechnicians, rankingMode]);

  const totals = useMemo(() => {
    const totalRevisitas = filteredTechnicians.reduce((sum, item) => sum + item.revisitas, 0);
    const totalOS = filteredTechnicians.reduce((sum, item) => sum + item.quantidadeOS, 0);
    const criticos = filteredTechnicians.filter((item) => getFaixaRevisita(item) === 'critico').length;

    return {
      totalRevisitas,
      totalOS,
      criticos,
      taxa: totalOS > 0 ? (totalRevisitas / totalOS) * 100 : 0,
    };
  }, [filteredTechnicians]);

  const distribution = useMemo(() => {
    const counts: Record<FaixaRevisita, number> = {
      critico: 0,
      atencao: 0,
      controlado: 0,
      sem_base: 0,
    };

    filteredTechnicians.forEach((item) => {
      counts[getFaixaRevisita(item)] += 1;
    });

    return (Object.keys(counts) as FaixaRevisita[])
      .map((faixa) => ({
        faixa,
        name: FAIXAS[faixa].label,
        value: counts[faixa],
        color: FAIXAS[faixa].color,
      }))
      .filter((item) => item.value > 0);
  }, [filteredTechnicians]);

  const chartData = useMemo(() => {
    return ranking.slice(0, 10).map((item) => ({
      ...item,
      nomeCurto: getShortName(item.tecnico),
      valor: rankingMode === 'porcentagem' ? item.porcentagem : item.revisitas,
      valorLabel: rankingMode === 'porcentagem' ? formatPercent(item.porcentagem) : String(item.revisitas),
      color: FAIXAS[getFaixaRevisita(item)].color,
    }));
  }, [ranking, rankingMode]);

  const kpis = [
    {
      label: 'Revisitas no período',
      value: totals.totalRevisitas.toLocaleString('pt-BR'),
      icon: Activity,
      iconClass: 'text-red-600 bg-red-50',
    },
    {
      label: 'Técnicos ofensores',
      value: filteredTechnicians.length.toLocaleString('pt-BR'),
      icon: Users,
      iconClass: 'text-sky-600 bg-sky-50',
    },
    {
      label: 'Acima de 10%',
      value: totals.criticos.toLocaleString('pt-BR'),
      icon: AlertTriangle,
      iconClass: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Taxa consolidada',
      value: formatPercent(totals.taxa),
      icon: Gauge,
      iconClass: 'text-emerald-600 bg-emerald-50',
    },
  ];

  if (tecnicos.length === 0) {
    return (
      <div className="table-container">
        <div className="loading-section min-h-[320px]">
          <ShieldCheck className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-semibold">Nenhuma revisita encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Os filtros atuais não possuem técnicos ofensores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            <h2 className="text-2xl font-bold">Ranking de Revisitas</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioridade por técnico ofensor considerando os filtros atuais.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">ORDENAR POR</span>
            <div className="inline-flex h-10 items-center rounded-md border bg-muted p-1">
              <button
                type="button"
                className={cn(
                  'h-8 rounded px-3 text-sm font-medium transition-colors',
                  rankingMode === 'porcentagem' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                )}
                onClick={() => setRankingMode('porcentagem')}
              >
                Taxa
              </button>
              <button
                type="button"
                className={cn(
                  'h-8 rounded px-3 text-sm font-medium transition-colors',
                  rankingMode === 'revisitas' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                )}
                onClick={() => setRankingMode('revisitas')}
              >
                Quantidade
              </button>
            </div>
          </div>

          <div className="w-full sm:w-[170px]">
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">BASE MÍNIMA</span>
            <Select value={minimumOS} onValueChange={setMinimumOS}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Todas as bases</SelectItem>
                <SelectItem value="5">5 OS ou mais</SelectItem>
                <SelectItem value="10">10 OS ou mais</SelectItem>
                <SelectItem value="20">20 OS ou mais</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="rounded-lg">
              <CardContent className="flex min-h-[118px] items-center justify-between p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                  <p className="mt-2 text-3xl font-bold leading-none">{kpi.value}</p>
                </div>
                <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-md', kpi.iconClass)}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <Card className="rounded-lg">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-primary" />
                Top 10 técnicos
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {rankingMode === 'porcentagem' ? 'Taxa de revisita sobre a base de OS' : 'Quantidade absoluta de revisitas'}
              </p>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {chartData.length === 0 ? (
              <div className="flex h-[380px] items-center justify-center text-sm text-muted-foreground">
                Nenhum técnico atende à base mínima selecionada.
              </div>
            ) : (
              <div className="h-[420px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 8, right: 70, left: 24, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis
                      type="number"
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                      tickFormatter={(value) => rankingMode === 'porcentagem' ? `${value}%` : String(value)}
                      allowDecimals={rankingMode === 'porcentagem'}
                    />
                    <YAxis
                      type="category"
                      dataKey="nomeCurto"
                      width={112}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: 'hsl(var(--muted) / 0.45)' }}
                      formatter={(_, __, props) => [
                        rankingMode === 'porcentagem'
                          ? `${formatPercent(props.payload.porcentagem)} (${props.payload.revisitas} revisitas / ${props.payload.quantidadeOS} OS)`
                          : `${props.payload.revisitas} revisitas (${formatPercent(props.payload.porcentagem)})`,
                        rankingMode === 'porcentagem' ? 'Taxa' : 'Revisitas',
                      ]}
                      labelFormatter={(_, payload) => payload[0]?.payload?.tecnico || ''}
                    />
                    <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {chartData.map((item) => (
                        <Cell key={item.tecnico} fill={item.color} />
                      ))}
                      <LabelList
                        dataKey="valorLabel"
                        position="right"
                        fill="hsl(var(--foreground))"
                        fontSize={11}
                        fontWeight={600}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Faixas de atenção</CardTitle>
          </CardHeader>
          <CardContent>
            {distribution.length > 0 && (
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={3}
                    >
                      {distribution.map((item) => (
                        <Cell key={item.faixa} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value} técnico(s)`, 'Quantidade']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="space-y-2">
              {(Object.keys(FAIXAS) as FaixaRevisita[]).map((faixa) => {
                const item = distribution.find((entry) => entry.faixa === faixa);
                return (
                  <div key={faixa} className="flex items-center justify-between border-b py-2 last:border-b-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FAIXAS[faixa].color }} />
                      <span>{FAIXAS[faixa].label}</span>
                    </div>
                    <span className="text-sm font-bold">{item?.value || 0}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
              <span>Até 5%</span>
              <span>5% a 10%</span>
              <span>Acima de 10%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-lg">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Medal className="h-5 w-5 text-amber-500" />
            Ranking completo
          </CardTitle>
          <span className="text-xs font-medium text-muted-foreground">
            {ranking.length} técnico{ranking.length !== 1 ? 's' : ''}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {ranking.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum técnico atende à base mínima selecionada.
            </div>
          ) : (
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="w-16 px-5 py-3 text-center">Pos.</th>
                    <th className="px-4 py-3">Técnico ofensor</th>
                    <th className="px-4 py-3 text-right">OS</th>
                    <th className="px-4 py-3 text-right">Revisitas</th>
                    <th className="px-4 py-3 text-right">Taxa</th>
                    <th className="px-5 py-3 text-right">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((item, index) => {
                    const faixa = getFaixaRevisita(item);
                    const config = FAIXAS[faixa];
                    return (
                      <tr key={item.tecnico} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-5 py-3 text-center">
                          <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded border px-1.5 text-xs font-bold', getRankColor(index + 1))}>
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">{item.tecnico}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.quantidadeOS}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{item.revisitas}</td>
                        <td className={cn('px-4 py-3 text-right font-bold tabular-nums', config.textClass)}>
                          {item.quantidadeOS > 0 ? formatPercent(item.porcentagem) : 'Sem base'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn('inline-flex rounded border px-2 py-1 text-xs font-semibold', config.bgClass, config.textClass)}>
                            {config.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
