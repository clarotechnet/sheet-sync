import React, { useMemo } from 'react';
import { ClipboardList, CheckCircle, XCircle, Users, Clock, Ban, TrendingUp, TrendingDown } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { calculateKPIs, getActivityStatus, filterExcludedServiceTypes } from '@/utils/activityHelpers';

interface KPICardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  gradient: string;
}

const KPICard: React.FC<KPICardProps> = ({ value, label, icon, gradient }) => (
  <div className="kpi-card">
    <div className="kpi-header">
      <div>
        <div className="kpi-value" style={{ background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          {value}
        </div>
        <div className="kpi-label">{label}</div>
      </div>
      <div className="kpi-icon" style={{ background: gradient }}>
        {icon}
      </div>
    </div>
  </div>
);

export const KPICards: React.FC = () => {
  const { filteredData } = useDashboard();

  const kpis = useMemo(() => calculateKPIs(filteredData), [filteredData]);

  const canceladas = useMemo(() => {
    return filterExcludedServiceTypes(filteredData).filter(item => getActivityStatus(item) === 'Cancelado').length;
  }, [filteredData]);

  const prodPorTec = kpis.technicians > 0 ? kpis.productive / kpis.technicians : 0;
  const improdPorTec = kpis.technicians > 0 ? kpis.unproductive / kpis.technicians : 0;

  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });


  return (
    <div className="kpi-grid">
      <KPICard
        value={kpis.total.toLocaleString('pt-BR')}
        label="Total de Atividades"
        icon={<ClipboardList className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      />

      <KPICard
        value={kpis.productive.toLocaleString('pt-BR')}
        label="Atividades Produtivas"
        icon={<CheckCircle className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
      />

      <KPICard
        value={kpis.unproductive.toLocaleString('pt-BR')}
        label="Atividades Improdutivas"
        icon={<XCircle className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #ef4444 0%, #ff6b6b 100%)"
      />

      <KPICard
        value={canceladas.toLocaleString('pt-BR')}
        label="Atividades Canceladas"
        icon={<Ban className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #8e9eab 0%, #eef2f3 100%)"
      />

      <KPICard
        value={kpis.technicians.toLocaleString('pt-BR')}
        label="Técnicos Ativos"
        icon={<Users className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #43e97b 0%, #38ef7d 100%)"
      />

      <KPICard
        value={fmt(prodPorTec)}
        label="Produtivas por Técnico"
        icon={<TrendingUp className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #11998e 0%, #38ef7d 100%)"
      />

      <KPICard
        value={fmt(improdPorTec)}
        label="Improdutivas por Técnico"
        icon={<TrendingDown className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #f7971e 0%, #ffd200 100%)"
      />


      <KPICard
        value={kpis.avgDuration}
        label="Tempo Médio de Atendimento"
        icon={<Clock className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
      />
    </div>
  );
};
