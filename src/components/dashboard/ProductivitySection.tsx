import React, { useMemo, useState } from 'react';
import { ChartNoAxesCombined, Users, ListChecks, PieChart, X } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import { useDashboard } from '@/contexts/DashboardContext';
import { calculateTechnicianProductivity, getActivityStatus } from '@/utils/activityHelpers';
import { TechnicianProductivityList } from './TechnicianProductivityList';

// Lista de tipos de atividade a ignorar no gráfico de pizza
const IGNORE_LIST = ['na base', 'refeicao', 'refeição', 'intervalo', 'não informado'];

// Servi?os principais (ordem fixa para os slots)
const PRIMARY_SERVICES = [
  { key: 'INST GPON - INST CABO', label: 'INST. GPON/CABO' },
  { key: 'INSTALACAO', label: 'INSTALACAO' },
  { key: 'MUDANCA DE PACOTE', label: 'MUDANCA DE PACOTE' }
];


// Cores para o gráfico de pizza
const PIE_COLORS = ['#4facfe', '#764ba2', '#f093fb', '#f5576c', '#00f2fe', '#43e97b', '#38ef7d', '#ff6b6b', '#ffc107', '#17a2b8'];

// Renderização customizada para fatia ativa
const renderActiveShape = (props: {
  cx: number; cy: number; innerRadius: number; outerRadius: number;
  startAngle: number; endAngle: number; fill: string;
  payload: { name: string }; value: number; percent: number;
}) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, percent } = props;

  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill="#ffffff" fontSize={14} fontWeight="bold">
        {payload.name.length > 15 ? payload.name.substring(0, 15) + '...' : payload.name}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#a0a9c0" fontSize={12}>
        {value} OS
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle" fill="#43e97b" fontSize={12}>
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export const ProductivitySection: React.FC = () => {
  const { filteredData } = useDashboard();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<string | null>(null);

  // ✅ controla quando o mouse está em cima do gráfico (pra esconder o texto central)
  const [isPieHover, setIsPieHover] = useState(false);

  // Calcula produtividade filtrada pelo tipo de atividade selecionado no pie chart
  const dataForProductivity = useMemo(() => {
    if (!selectedActivity) return filteredData;
    return filteredData.filter(item =>
      (item['Tipo de Atividade'] || '') === selectedActivity
    );
  }, [filteredData, selectedActivity]);

  const techProductivity = useMemo(() =>
    calculateTechnicianProductivity(dataForProductivity),
    [dataForProductivity]
  );

  const uniqueTechnicians = useMemo(() =>
    new Set(dataForProductivity.map(item => item.Recurso).filter(Boolean)).size,
    [dataForProductivity]
  );

  // Dados para gráfico de pizza - POR TIPO DE SERVIÇO (como no original)
  const pieData = useMemo(() => {
    const counts: Record<string, { total: number; productive: number }> = {};

    filteredData.forEach(item => {
      const type = item['Tipo de Atividade'] || 'Não Informado';
      const typeLower = type.toLowerCase().trim();

      // Ignora tipos específicos
      if (IGNORE_LIST.some(ignored => typeLower.includes(ignored))) return;

      const isProductive = getActivityStatus(item) === 'Produtiva';

      if (!counts[type]) {
        counts[type] = { total: 0, productive: 0 };
      }
      counts[type].total++;
      if (isProductive) {
        counts[type].productive++;
      }
    });

    return Object.entries(counts)
      .map(([name, data], index) => ({
        name,
        value: data.total,
        productive: data.productive,
        productivity: data.total > 0 ? (data.productive / data.total) * 100 : 0,
        color: PIE_COLORS[index % PIE_COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const servicesByProductivity = useMemo(() => pieData
    .map((service, pieIndex) => ({ ...service, pieIndex }))
    .sort((a, b) => b.productivity - a.productivity || b.value - a.value || a.name.localeCompare(b.name, 'pt-BR')),
  [pieData]);

  // Calcula produtividade geral
  const overallStats = useMemo(() => {
    let totalAll = 0;
    let totalProductive = 0;

    pieData.forEach(item => {
      totalAll += item.value;
      totalProductive += item.productive;
    });

    return {
      total: totalAll,
      productive: totalProductive,
      productivity: totalAll > 0 ? (totalProductive / totalAll) * 100 : 0
    };
  }, [pieData]);

  // Handler para clique na fatia do pizza
  const handlePieClick = (data: { name: string }, index: number) => {
    if (selectedActivity === data.name) {
      // Desseleciona
      setSelectedActivity(null);
      setActiveIndex(null);
    } else {
      // Seleciona
      setSelectedActivity(data.name);
      setActiveIndex(index);
    }
  };

  // Info text baseado na seleção
  const infoText = useMemo(() => {
    if (selectedActivity) {
      const selected = pieData.find(p => p.name === selectedActivity);
      if (selected) {
        return `Filtrando: ${selectedActivity} (${selected.value} OS, ${selected.productivity.toFixed(1)}% Produtivas)`;
      }
    }
    return `Total de OS: ${overallStats.total}`;
  }, [selectedActivity, pieData, overallStats]);

  const activitySummaryAll = useMemo(() => {
    const results: Record<string, { total: number; productive: number }> = {};

    // Estat?stica por tipo de atividade (exato)
    filteredData.forEach(row => {
      const type = String(row['Tipo de Atividade'] || 'N?o Informado');
      const typeLower = type.toLowerCase().trim();
      if (IGNORE_LIST.some(ignored => typeLower.includes(ignored))) return;

      if (!results[type]) {
        results[type] = { total: 0, productive: 0 };
      }
      results[type].total++;
      if (getActivityStatus(row) === 'Produtiva') {
        results[type].productive++;
      }
    });

    // Garante contagem consistente para os servi?os principais (por "includes")
    const primaryStats: Record<string, { total: number; productive: number }> = {};
    PRIMARY_SERVICES.forEach(service => {
      primaryStats[service.key] = { total: 0, productive: 0 };
    });

    filteredData.forEach(row => {
      const rowActivity = String(row['Tipo de Atividade'] || '').toUpperCase();
      for (const service of PRIMARY_SERVICES) {
        if (rowActivity.includes(service.key)) {
          primaryStats[service.key].total++;
          if (getActivityStatus(row) === 'Produtiva') {
            primaryStats[service.key].productive++;
          }
          break;
        }
      }
    });

    PRIMARY_SERVICES.forEach(service => {
      results[service.key] = primaryStats[service.key];
    });

    return results;
  }, [filteredData]);

  const productivityByActivity = useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(activitySummaryAll).forEach(([name, data]) => {
      const rate = data.total > 0 ? (data.productive / data.total) * 100 : 0;
      map[name] = rate;
    });
    return map;
  }, [activitySummaryAll]);

  const finalActivities = useMemo(() => {
    const isZero = (value: unknown) =>
      value === 0 || value === null || value === undefined || value === '' || Number.isNaN(value as number);

    const used = new Set<string>();
    const slots = PRIMARY_SERVICES.map(service => {
      const productivity = productivityByActivity[service.key];
      if (isZero(productivity)) return null;
      used.add(service.key);
      return service.key;
    });

    const candidates = Object.keys(productivityByActivity)
      .sort((a, b) => (productivityByActivity[b] || 0) - (productivityByActivity[a] || 0));

    const positiveCandidates = candidates.filter(name => (productivityByActivity[name] || 0) > 0);

    let posIndex = 0;
    let allIndex = 0;

    for (let i = 0; i < slots.length; i++) {
      if (slots[i]) continue;

      while (posIndex < positiveCandidates.length && used.has(positiveCandidates[posIndex])) {
        posIndex++;
      }
      if (posIndex < positiveCandidates.length) {
        const pick = positiveCandidates[posIndex++];
        used.add(pick);
        slots[i] = pick;
        continue;
      }

      while (allIndex < candidates.length && used.has(candidates[allIndex])) {
        allIndex++;
      }
      if (allIndex < candidates.length) {
        const pick = candidates[allIndex++];
        used.add(pick);
        slots[i] = pick;
      }
    }

    return slots.filter(Boolean) as string[];
  }, [productivityByActivity]);

  const activityCardConfig: Record<string, { icon: string; color: string }> = {
    'MUDANCA DE PACOTE': { icon: '🔄', color: '#ffc107' },
    'INSTALACAO': { icon: '🔌', color: '#17a2b8' },
    'INST GPON - INST CABO': { icon: '🔧', color: '#28a745' }
  };

  const getActivityConfig = (activity: string, index: number) => {
    if (activityCardConfig[activity]) return activityCardConfig[activity];
    return { icon: '*', color: PIE_COLORS[index % PIE_COLORS.length] };
  };

  const getActivityLabel = (activity: string) => {
    const primary = PRIMARY_SERVICES.find(service => service.key === activity);
    return primary ? primary.label : activity;
  };

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--foreground))',
    boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
  };

  return (
    <div className="space-y-6">
      {/* Activity Summary Cards */}
      <div>
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-accent" />
          Resumo de Atividades Chave
        </h3>
        <div className="kpi-grid">
          {finalActivities.map((activity, index) => {
            const data = activitySummaryAll[activity] || { total: 0, productive: 0 };
            const productivityRate = data.total > 0
              ? ((data.productive / data.total) * 100).toFixed(1)
              : '0.0';
            const config = getActivityConfig(activity, index);

            return (
              <div key={activity} className="kpi-card">
                <div className="kpi-header" style={{ width: '100%', alignItems: 'flex-end' }}>
                  <div style={{ flexGrow: 1 }}>
                    <div
                      className="kpi-value"
                      style={{
                        background: `linear-gradient(135deg, ${config.color} 0%, rgba(0, 0, 0, 0) 100%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text'
                      }}
                    >
                      {data.total.toLocaleString('pt-BR')}
                    </div>
                    <div className="kpi-label" style={{ textTransform: 'none', fontSize: '1rem', color: 'var(--text-primary)', marginTop: '5px' }}>
                      {getActivityLabel(activity)}
                    </div>
                  </div>
                  <div className="kpi-icon" style={{ background: config.color, opacity: 0.8 }}>
                    <span className="text-2xl">{config.icon}</span>
                  </div>
                </div>
                <div style={{
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.9rem',
                  marginTop: '15px'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Produtivas: <strong style={{ color: 'var(--text-primary)' }}>{data.productive.toLocaleString('pt-BR')}</strong>
                  </span>
                  <span style={{
                    fontWeight: 700,
                    color: parseFloat(productivityRate) >= 80 ? '#43e97b' : '#f5576c'
                  }}>
                    {productivityRate}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Productivity Grid with Charts */}
      <div className="productivity-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Gráfico de Pizza - Por Tipo de Serviço (Interativo) */}
        <div className="productivity-card">
          <h4 className="mb-2 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-accent" />
            Distribuição por Tipo de Serviço
          </h4>

          <div className="h-[250px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie
                onMouseEnter={() => setIsPieHover(true)}
                onMouseLeave={() => setIsPieHover(false)}
              >
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  dataKey="value"
                  activeIndex={activeIndex !== null ? activeIndex : undefined}
                  activeShape={renderActiveShape}
                  onClick={handlePieClick}
                  style={{ cursor: 'pointer' }}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      opacity={selectedActivity && selectedActivity !== entry.name ? 0.4 : 1}
                    />
                  ))}
                </Pie>

                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string, props) => [
                    `${value} OS (${props.payload.productivity.toFixed(1)}% prod.)`,
                    name
                  ]}
                />
              </RechartsPie>
            </ResponsiveContainer>

            {/* ✅ Center text só aparece quando NÃO estiver com hover/tooltip ativo */}
            {!isPieHover && activeIndex === null && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: '-10px' }}>
                <span className="text-2xl font-bold" style={{ color: '#43e97b' }}>
                  {overallStats.productivity.toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground">Produtividade</span>
              </div>
            )}
          </div>

          {/* Info text */}
          <div
            className="text-center text-sm mt-2 p-2 rounded-lg cursor-pointer transition-all"
            style={{
              background: selectedActivity ? 'rgba(102, 126, 234, 0.2)' : 'transparent',
              border: selectedActivity ? '1px solid rgba(102, 126, 234, 0.3)' : '1px solid transparent'
            }}
            onClick={() => {
              setSelectedActivity(null);
              setActiveIndex(null);
            }}
            dangerouslySetInnerHTML={{ __html: infoText }}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="productivity-card">
            <h4 className="mb-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-accent" />
              Técnicos Ativos
              {selectedActivity && (
                <span className="text-xs bg-accent/20 px-2 py-0.5 rounded-full">
                  {selectedActivity.substring(0, 10)}...
                </span>
              )}
            </h4>
            <div className="text-4xl font-extrabold mt-2">
              {uniqueTechnicians}
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              {selectedActivity
                ? `Técnicos em "${selectedActivity.substring(0, 15)}..."`
                : 'Técnicos únicos no filtro atual'
              }
            </div>
          </div>

          <section className="border-y border-slate-200 bg-white" aria-labelledby="service-productivity-title">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
              <h4 id="service-productivity-title" className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <ChartNoAxesCombined className="h-4 w-4 shrink-0 text-accent" />Produtividade por serviço
              </h4>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                <span>{servicesByProductivity.length} {servicesByProductivity.length === 1 ? 'serviço' : 'serviços'}</span>
                {selectedActivity && <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Limpar seleção de serviço" title="Limpar seleção de serviço" onClick={() => { setSelectedActivity(null); setActiveIndex(null); }}><X className="h-4 w-4" /></button>}
              </div>
            </div>
            <ul aria-label="Produtividade por serviço" className="max-h-[184px] divide-y divide-slate-100 overflow-y-auto">
              {servicesByProductivity.map((service) => <li key={service.name}>
                <button type="button" className={`block w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedActivity === service.name ? 'bg-sky-50' : ''}`}
                  aria-pressed={selectedActivity === service.name}
                  aria-label={`Filtrar serviço ${service.name}; ${service.productivity.toFixed(1)}% de produtividade; ${service.productive} produtivas de ${service.value} OS`}
                  title={`Filtrar serviço ${service.name}`}
                  onClick={() => handlePieClick(service, service.pieIndex)}>
                  <span className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words font-medium [overflow-wrap:anywhere]">{getActivityLabel(service.name)}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-sky-700">{service.productivity.toFixed(1)}%</span>
                  </span>
                  <span className="mt-1 block text-xs tabular-nums text-muted-foreground">Produtivas: {service.productive.toLocaleString('pt-BR')} de {service.value.toLocaleString('pt-BR')} OS</span>
                  <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-sky-600" style={{ width: `${service.productivity}%` }} /></span>
                </button>
              </li>)}
              {!servicesByProductivity.length && <li className="px-4 py-6 text-sm text-muted-foreground">Nenhum serviço nos filtros atuais.</li>}
            </ul>
          </section>
        </div>
      </div>

      <TechnicianProductivityList technicians={techProductivity} />
    </div>
  );
};
