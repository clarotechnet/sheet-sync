import React, { useMemo } from 'react';
import { ListTree, CheckCheck, Clock, GitBranch } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { 
  calculateActivityCounts, 
  getActivityStatus, 
  parseDurationToMinutes, 
  formatMinutesToTime 
} from '@/utils/activityHelpers';

interface SummaryCardProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  children: React.ReactNode;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, icon, iconColor, children }) => (
  <div className="summary-card">
    <h4 className="mb-2 flex items-center gap-2">
      <span style={{ color: iconColor }}>{icon}</span>
      {title}
    </h4>
    {children}
  </div>
);

export const SummarySection: React.FC = () => {
  const { filteredData } = useDashboard();

  const activityCounts = useMemo(() => {
    const counts = calculateActivityCounts(filteredData);
    return Object.entries(counts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);
  }, [filteredData]);

  const productivityByType = useMemo(() => {
    const counts = calculateActivityCounts(filteredData);
    return Object.entries(counts)
      .map(([type, data]) => ({
        type,
        productivity: data.total > 0 ? (data.productive / data.total) * 100 : 0,
        total: data.total
      }))
      .sort((a, b) => b.productivity - a.productivity)
      .slice(0, 10);
  }, [filteredData]);

  const avgTimeByType = useMemo(() => {
    const timeData: Record<string, { totalMinutes: number; count: number }> = {};
    
    filteredData.forEach(item => {
      const type = item['Tipo de Atividade'] || 'Não Informado';
      const minutes = parseDurationToMinutes(item.Duração);
      
      if (!timeData[type]) {
        timeData[type] = { totalMinutes: 0, count: 0 };
      }
      timeData[type].totalMinutes += minutes;
      timeData[type].count++;
    });

    return Object.entries(timeData)
      .map(([type, data]) => ({
        type,
        avgTime: data.count > 0 ? formatMinutesToTime(data.totalMinutes / data.count) : '00:00'
      }))
      .slice(0, 10);
  }, [filteredData]);

  const baixaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    filteredData.forEach(item => {
      const baixa = item['Cód de Baixa 1'] || 'Não Informado';
      counts[baixa] = (counts[baixa] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [filteredData]);

  if (filteredData.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Nenhum dado para exibir
      </div>
    );
  }

  return (
    <div className="summary-grid">
      <SummaryCard 
        title="Atividades por Tipo" 
        icon={<ListTree className="w-5 h-5 align-middle"/>}
        iconColor="var(--accent)"
      >
        <ul className="summary-list">
          {activityCounts.map(([type, data]) => (
            <li key={type} className="summary-item">
              <span className="truncate flex-1">{type}</span>
               <span className="font-bold">
                <span style={{ color: '#43e97b' }}>{data.productive}</span>
                <span className="text-muted-foreground">/</span>
                <span>{data.total}</span>
              </span>
            </li>
          ))}
        </ul>
      </SummaryCard>

      <SummaryCard 
        title="Produtividade por Tipo" 
        icon={<CheckCheck className="w-5 h-5" />}
        iconColor="#43e97b"
      >
        <ul className="summary-list">
          {productivityByType.map(item => (
            <li key={item.type} className="summary-item">
              <span className="truncate flex-1">{item.type}</span>
              <span 
                className="font-bold"
                style={{ color: item.productivity >= 80 ? '#43e97b' : '#f5576c' }}
              >
                {item.productivity.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </SummaryCard>

      <SummaryCard 
        title="Tempo Médio por Atendimento" 
        icon={<Clock className="w-5 h-5" />}
        iconColor="#f5a623"
      >
        <ul className="summary-list">
          {avgTimeByType.map(item => (
            <li key={item.type} className="summary-item">
              <span className="truncate flex-1">{item.type}</span>
              <span className="font-bold">{item.avgTime}</span>
            </li>
          ))}
        </ul>
      </SummaryCard>

      <SummaryCard 
        title="Códigos de Baixa" 
        icon={<GitBranch className="w-5 h-5" />}
        iconColor="#f093fb"
      >
        <ul className="summary-list">
          {baixaCounts.map(([code, count]) => (
            <li key={code} className="summary-item">
              <span className="truncate flex-1">{code}</span>
              <span className="font-bold">{count}</span>
            </li>
          ))}
        </ul>
      </SummaryCard>
    </div>
  );
};
