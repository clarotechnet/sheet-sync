import React, { useMemo, useState } from 'react';
import { Trophy, Frown, Users, ListChecks, PieChart } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import { useDashboard } from '@/contexts/DashboardContext';
import { calculateTechnicianProductivity, getActivityStatus } from '@/utils/activityHelpers';
import { TARGET_ACTIVITIES } from '@/config/constants';
import { DraggableBarChart } from './DraggableBarChart';

interface ProductivityItemProps {
  name: string;
  count: string;
  percentage: number;
}

const ProductivityItem: React.FC<ProductivityItemProps> = ({ name, count, percentage }) => {
  const colorClass = percentage >= 80 ? 'text-success' : percentage < 40 ? 'text-danger' : 'text-warning';

  return (
    <li className="productivity-item">
      <span className="name">
        {name}
        <span className="count">{count}</span>
      </span>
      <span className={`percentage ${colorClass}`}>
        {percentage.toFixed(1)}%
      </span>
    </li>
  );
};

// Lista de tipos de atividade a ignorar no gráfico de pizza
const IGNORE_LIST = ['na base', 'refeicao', 'refeição', 'intervalo', 'não informado'];

// Cores para o gráfico de pizza
const PIE_COLORS = ['#4facfe', '#764ba2', '#f093fb', '#f5576c', '#00f2fe', '#43e97b', '#38ef7d', '#ff6b6b', '#ffc107', '#17a2b8'];

// Renderização customizada para fatia ativa
const renderActiveShape = (props: any) => {
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
  const { filteredData, setFilters, filters } = useDashboard();
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

  const topTechnicians = techProductivity.slice(0, 5);
  const bottomTechnicians = techProductivity.slice(-5).reverse();

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
  const handlePieClick = (data: any, index: number) => {
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

  const activitySummary = useMemo(() => {
    const results: Record<string, { total: number; productive: number }> = {};

    TARGET_ACTIVITIES.forEach(activity => {
      results[activity] = { total: 0, productive: 0 };
    });

    filteredData.forEach(row => {
      const rowActivity = String(row['Tipo de Atividade'] || '').toUpperCase();

      for (const activity of TARGET_ACTIVITIES) {
        if (rowActivity.includes(activity)) {
          results[activity].total++;
          if (getActivityStatus(row) === 'Produtiva') {
            results[activity].productive++;
          }
          break;
        }
      }
    });

    return results;
  }, [filteredData]);

  const activityCardConfig: Record<string, { icon: string; color: string }> = {
    'MUDANCA DE PACOTE': { icon: '🔄', color: '#ffc107' },
    'INSTALACAO': { icon: '🔌', color: '#17a2b8' },
    'INST GPON - INST CABO': { icon: '🔧', color: '#28a745' }
  };

  // Dados do gráfico de barras para Top 5 - estilo pódio
  const topChartData = useMemo(() => {
   return topTechnicians.map((tech, index) => ({
      name: tech.name.split(' ')[0],
      fullName: tech.name,
      value: tech.productiveCount,
      total: tech.count,
      productivity: tech.productivity,
      color: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#667eea'
    }));
  }, [topTechnicians]);

  // Dados do gráfico de barras para Bottom 5
  const bottomChartData = useMemo(() =>
    bottomTechnicians.map(tech => ({
      name: tech.name.split(' ')[0],
      fullName: tech.name,
      value: tech.productiveCount,
      total: tech.count,
      productivity: tech.productivity,
      color: tech.productivity >= 80 ? '#10b981' : '#ef4444'
    })),
    [bottomTechnicians]
  );

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
          {TARGET_ACTIVITIES.map(activity => {
            const data = activitySummary[activity];
            const productivityRate = data.total > 0
              ? ((data.productive / data.total) * 100).toFixed(1)
              : '0.0';
            const config = activityCardConfig[activity];

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
                      {activity.replace('INST GPON - INST CABO', 'INST. GPON/CABO')}
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
      <div className="productivity-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
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
                  formatter={(value: number, name: string, props: any) => [
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

        {/* Técnicos Ativos */}
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

        {/* Top 5 com lista e gráfico */}
        <div className="productivity-card">
          <h4 className="mb-2 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-warning" />
            Top 5 Técnicos Produtivos (Pódio)
          </h4>
          <p className="text-xs text-muted-foreground mb-3">
            Arraste para reordenar
          </p>
          <DraggableBarChart data={topChartData} />
        </div>

        {/* Bottom 5 com barras arrastáveis */}
        <div className="productivity-card">
          <h4 className="mb-2 flex items-center gap-2">
            <Frown className="w-5 h-5 text-danger" />
            Bottom 5 Técnicos Produtivos
          </h4>
               <p className="text-xs text-muted-foreground mb-3">
            Arraste para reordenar
          </p>
          <DraggableBarChart data={bottomChartData} />
        </div>
      </div>
    </div>
  );
};
