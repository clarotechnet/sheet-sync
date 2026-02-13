import React, { useState } from 'react';
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext';
import { Header } from '@/components/dashboard/Header';
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

const TABS = [
  { id: 'summary', label: 'Resumo' },
  { id: 'kpis', label: 'KPIs' },
  { id: 'productivity', label: 'Produtividade' },
  { id: 'charts', label: 'Gráficos' },
  { id: 'map', label: 'Mapa' },
  { id: 'table', label: 'Análise Detalhada' },
  { id: 'logs', label: 'Logs' },
];

const DashboardContent: React.FC = () => {
  const { allData, isLoading, isSyncing, error } = useDashboard();
  const [activeTab, setActiveTab] = useState('kpis');

  const hasData = allData.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="max-w-[auto] mx-auto p-8 space-y-8">
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
            <span>⚠️ {error} - Faça upload de um arquivo para começar.</span>
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

            {/* Tabs */}
            <TabNavigation 
              tabs={TABS} 
              activeTab={activeTab} 
              onTabChange={setActiveTab} 
            />

            {/* Conteúdo das Tabs */}
            <div className="tab-content">
              {activeTab === 'summary' && <SummarySection />}
              {activeTab === 'kpis' && <KPICards />}
              {activeTab === 'productivity' && <ProductivitySection />}
              {activeTab === 'charts' && <ChartSection />}
              {activeTab === 'map' && <MapSection />}
              {activeTab === 'table' && <DataTable />}
              {activeTab === 'logs' && <LogsTable />}
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
      </main>
    </div>
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
