import React, { useState, useEffect } from 'react';
import { useComissionamento } from '@/hooks/useComissionamento';
import { ComissionamentoFilters } from '@/components/comissionamento/ComissionamentoFilters';
import { ComissionamentoKPIs } from '@/components/comissionamento/ComissionamentoKPIs';
import { ComissionamentoCharts } from '@/components/comissionamento/ComissionamentoCharts';
import { ComissionamentoTable } from '@/components/comissionamento/ComissionamentoTable';

import { ComissionamentoFrentes } from '@/components/comissionamento/ComissionamentoFrentes';
import { ComissionamentoValores } from '@/components/comissionamento/ComissionamentoValores';
import { TabNavigation } from '@/components/dashboard/TabNavigation';
import { LoadingSpinner } from '@/components/dashboard/LoadingSpinner';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { CalendarDays, RefreshCw } from 'lucide-react';

const TABS = [
  { id: 'kpis', label: 'KPIs' },
  { id: 'charts', label: 'Gráficos' },
  { id: 'frentes', label: 'Frentes' },
  { id: 'table', label: 'Dados Detalhados' },
  { id: 'valores', label: 'Valores' },
];

const Comissionamento: React.FC = () => {
  const hook = useComissionamento();
  const { fetchData } = hook;
  const [activeTab, setActiveTab] = useState('kpis');

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasData = hook.allData.length > 0;

  return (
    <AppShell>
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Comissionamento Técnico</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Controle de comissões, frentes e valores dos técnicos</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden items-center gap-2 text-sm font-medium text-slate-500 sm:flex">
                <CalendarDays className="h-4 w-4" />
                <span className="capitalize">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </span>
              </div>
              <Button variant="outline" onClick={fetchData} disabled={hook.isLoading}>
                <RefreshCw className={hook.isLoading ? 'animate-spin' : ''} />
                Atualizar
              </Button>
            </div>
          </div>

          {hasData && (
            <TabNavigation tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
          )}

        {hook.error && (
          <div className="alert alert-error">
            <span>{hook.error}</span>
          </div>
        )}

        <ComissionamentoFilters
          filters={hook.filters}
          setFilters={hook.setFilters}
          uniqueProposta={hook.uniqueProposta}
          uniqueTipoVenda={hook.uniqueTipoVenda}
          clearFilters={hook.clearFilters}
          uniqueCidades={hook.uniqueCidades}
          uniqueNomes={hook.uniqueNomes}
          tecnicoNomes={hook.tecnicoNomes}
          tecnicosFrente={hook.tecnicosFrente}
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
                  selectedFrente={hook.filters.frente[0] || ''}
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
                <ComissionamentoValores data={hook.data} colaboradores={hook.colaboradores} />
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
        </div>
      </main>
    </AppShell>
  );
};

export default Comissionamento;
