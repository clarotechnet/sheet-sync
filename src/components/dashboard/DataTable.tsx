import React from 'react';
import { Table } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { getActivityStatus } from '@/utils/activityHelpers';

export const DataTable: React.FC = () => {
  const { filteredData } = useDashboard();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Produtiva':
        return '#43e97b';
      case 'Improdutiva':
        return '#f5576c';
      default:
        return '#f5a623';
    }
  };

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">
          <Table className="w-5 h-5" />
          Análise Detalhada
        </h3>
        <span className="record-count">
          {filteredData.length} registro{filteredData.length !== 1 ? 's' : ''}
        </span>
      </div>
      
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Recurso</th>
              <th>Tipo de Atividade</th>
              <th>Contrato</th>
              <th>Cód de Baixa 1</th>
              <th>Status</th>
              <th>Intervalo de Tempo</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhum dado para exibir
                </td>
              </tr>
            ) : (
              filteredData.map((item, index) => {
                const status = getActivityStatus(item);
                return (
                  <tr key={index}>
                    <td>{item.Recurso || 'N/A'}</td>
                    <td>{item['Tipo de Atividade'] || 'N/A'}</td>
                    <td>{item.Contrato || item.contrato || 'N/A'}</td>
                    <td>{item['Cód de Baixa 1'] || 'N/A'}</td>
                    <td>
                      <span style={{ color: getStatusColor(status), fontWeight: 600 }}>
                        {status}
                      </span>
                    </td>
                    <td>{item['Intervalo de Tempo'] || 'N/A'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
