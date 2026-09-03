import React, { useState } from 'react';
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import { FileUpload } from '@/components/dashboard/FileUpload';
import { Filters } from '@/components/dashboard/Filters';
import { KPICards } from '@/components/dashboard/KPICards';
import { DataTable } from '@/components/dashboard/DataTable';
import { ProductivitySection } from '@/components/dashboard/ProductivitySection';
import { SummarySection } from '@/components/dashboard/SummarySection';
import { TabNavigation } from '@/components/dashboard/TabNavigation';
import { LoadingSpinner } from '@/components/dashboard/LoadingSpinner';
import { ChartSection } from '@/components/dashboard/ChartSection';
import { MapSection } from '@/components/dashboard/MapSection';
import { LogsTable } from '@/components/dashboard/LogsTable';
import { RevisitasTable } from '@/components/dashboard/RevisitasTable';
import { RevisitasRanking } from '@/components/dashboard/RevisitasRanking';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { CalendarDays, RefreshCw } from 'lucide-react';

const TABS = [
  { id: 'summary', label: 'Resumo' },
  { id: 'kpis', label: 'KPIs' },
  { id: 'productivity', label: 'Produtividade' },
  { id: 'charts', label: 'Gráficos' },
  { id: 'map', label: 'Mapa' },
  { id: 'table', label: 'Análise Detalhada' },
  { id: 'logs', label: 'Logs' },
  { id: 'revisitas', label: 'Revisitas' },
  { id: 'revisitas-ranking', label: 'Ranking Revisitas' },
];

const DashboardContent: React.FC = () => {
  const { allData, isLoading, isSyncing, error, refreshData } = useDashboard();
  const [activeTab, setActiveTab] = useState('summary');

  const hasData = allData.length > 0;

  return (
    <AppShell>
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1800px] space-y-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Sistema de Gestão</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Atividades, produtividade, indicadores e acompanhamento operacional</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden items-center gap-2 text-sm font-medium text-slate-500 sm:flex">
                <CalendarDays className="h-4 w-4" />
                <span className="capitalize">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </span>
              </div>
              <Button variant="outline" onClick={refreshData} disabled={isLoading || isSyncing}>
                <RefreshCw className={(isLoading || isSyncing) ? 'animate-spin' : ''} />
                {isSyncing ? 'Sincronizando...' : 'Atualizar'}
              </Button>
            </div>
          </div>

          {hasData && (
            <TabNavigation
              tabs={TABS}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          )}

        {/* Status de sincronização */}
        {/* {isSyncing && (
          <div className="alert alert-warning">
            <div className="spinner" style={{ width: 20, height: 20, margin: 0 }} />
            <span>Sincronizando dados com Google Sheets...</span>
          </div>
        )} */}

        {/* Erro */}
        {error && (
          <div className="alert alert-error">
            <span>{error} - Faça upload de um arquivo para começar.</span>
          </div>
        )}

        {/* Upload de arquivo */}
        <FileUpload />

        {/* Loading inicial */}
        {isLoading && !hasData && (
          <LoadingSpinner message="Conectando ao Banco de Dados..." />
        )}

        {/* Conteúdo do Dashboard */}
        {hasData && (
          <>
            {/* Filtros */}
            <Filters />

            {/* Conteúdo das Tabs */}
            <div className="tab-content">
              {activeTab === 'summary' && <SummarySection />}
              {activeTab === 'kpis' && <KPICards />}
              {activeTab === 'productivity' && <ProductivitySection />}
              {activeTab === 'charts' && <ChartSection />}
              {activeTab === 'map' && <MapSection />}
              {activeTab === 'table' && <DataTable />}
              {activeTab === 'logs' && <LogsTable />}
              {activeTab === 'revisitas' && <RevisitasTable />}
              {activeTab === 'revisitas-ranking' && <RevisitasRanking />}
            </div>
          </>
        )}

        {/* Mensagem quando não há dados e não está carregando */}
        {!isLoading && !hasData && !error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              Faça upload de um arquivo CSV ou XLSX para começar.
            </p>
          </div>
        )}
        </div>
      </main>
    </AppShell>
  );
};

const Index: React.FC = () => {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
};

export default Index;
