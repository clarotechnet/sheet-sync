import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useComissionamento } from '@/hooks/useComissionamento';
import { ComissionamentoHeader } from '@/components/comissionamento/ComissionamentoHelder';
import { ComissionamentoFilters } from '@/components/comissionamento/ComissionamentoFilters';
import { ComissionamentoKPIs } from '@/components/comissionamento/ComissionamentoKPIs';
import { ComissionamentoCharts } from '@/components/comissionamento/ComissionamentoCharts';
import { ComissionamentoTable } from '@/components/comissionamento/ComissionamentoTable';

import { ComissionamentoFrentes } from '@/components/comissionamento/ComissionamentoFrentes';
import { ComissionamentoValores } from '@/components/comissionamento/ComissionamentoValores';
import { TabNavigation } from '@/components/dashboard/TabNavigation';
import { LoadingSpinner } from '@/components/dashboard/LoadingSpinner';

const TABS = [
  { id: 'kpis', label: 'KPIs' },
  { id: 'charts', label: 'Gráficos' },
  { id: 'frentes', label: 'Frentes' },
  { id: 'table', label: 'Dados Detalhados' },
  { id: 'valores', label: 'Valores' },
];

const Comissionamento: React.FC = () => {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const hook = useComissionamento();
  const [activeTab, setActiveTab] = useState('kpis');

  useEffect(() => {
    hook.fetchData();
  }, []);

  const hasData = hook.allData.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <ComissionamentoHeader />

      <main className="max-w-[1400px] mx-auto p-8 space-y-8">
        {hook.error && (
          <div className="alert alert-error">
            <span>⚠️ {hook.error}</span>
          </div>
        )}

        <ComissionamentoFilters
          filters={hook.filters}
          setFilters={hook.setFilters}
          clearFilters={hook.clearFilters}
          uniqueCidades={hook.uniqueCidades}
          uniqueNomes={hook.uniqueNomes}
          uniqueFrente={hook.uniqueFrente}
          totalFiltered={hook.data.length}
          onImport={hook.importExcel}
          onManualSubmit={hook.submitManualEntry}
          isLoading={hook.isLoading}
          filteredData={hook.data}
        />

        {hook.isLoading && !hasData && (
          <LoadingSpinner message="Carregando dados de comissionamento..." />
        )}

        {hasData && (
          <>
          

            <TabNavigation tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

            <div className="tab-content">
              {activeTab === 'kpis' && <ComissionamentoKPIs kpis={hook.kpis} />}
              {activeTab === 'charts' && (
                <ComissionamentoCharts 
                  chartData={hook.chartData} 
                  ranking={hook.ranking} 
                />
              )}
               {activeTab === 'frentes' && (
                <ComissionamentoFrentes
                  frentesData={hook.frentesData}
                  selectedFrente={hook.filters.frente}
                />
              )}
               {activeTab === 'table' && (
                <ComissionamentoTable
                  data={hook.data}
                  onUpdate={hook.updateRecord}
                  onDelete={hook.deleteRecord}
                  uniqueNomes={hook.uniqueNomes}
                  uniqueCidades={hook.uniqueCidades}
                />
              )}
               {activeTab === 'valores' && (
                <ComissionamentoValores data={hook.data} />
              )}
            </div>
          </>
        )}

        {!hook.isLoading && !hasData && !hook.error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
                Importe um arquivo Excel ou preencha o formulário para começar.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Comissionamento;
