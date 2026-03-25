import React from 'react';
import { CheckCircle, Clock, XCircle, ClipboardList, DollarSign } from 'lucide-react';
import { ComissionamentoKPIData } from '@/types/comissionamento';

interface KPICardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  gradient: string;
}

const KPICard: React.FC<KPICardProps> = ({ value, label, icon, gradient }) => (
  <div className="kpi-card">
    <div className="kpi-header">
      <div className="min-w-0 flex-1">
        <div className="kpi-value truncate text-lg" style={{ background: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          {value}
        </div>
        <div className="kpi-label">{label}</div>
      </div>
      <div className="kpi-icon flex-shrink-0" style={{ background: gradient }}>
        {icon}
      </div>
    </div>
  </div>
);

interface Props {
  kpis: ComissionamentoKPIData;
}

export const ComissionamentoKPIs: React.FC<Props> = ({ kpis }) => {
  return (
    <div className="kpi-grid">
      <KPICard
        value={kpis.confirmadas.toLocaleString('pt-BR')}
        label="Confirmadas"
        icon={<CheckCircle className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #43e97b 0%, #38ef7d 100%)"
      />
      <KPICard
        value={kpis.pendentes.toLocaleString('pt-BR')}
        label="Pendentes"
        icon={<Clock className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #f7971e 0%, #ffd200 100%)"
      />
      <KPICard
        value={kpis.canceladas.toLocaleString('pt-BR')}
        label="Canceladas"
        icon={<XCircle className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #ef4444 0%, #ff6b6b 100%)"
      />
      <KPICard
        value={kpis.total.toLocaleString('pt-BR')}
        label="Total Geral"
        icon={<ClipboardList className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      />
      <KPICard
        value={`R$ ${kpis.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        label="Total R$ no Período"
        icon={<DollarSign className="w-6 h-6 text-white" />}
        gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
      />
    </div>
    
  );
};