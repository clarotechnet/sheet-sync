import React from 'react';
import { Activity, Calendar, RefreshCw } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Button } from '@/components/ui/button';


export const Header: React.FC = () => {
  const { isSyncing, refreshData, isLoading } = useDashboard();
  
  const currentDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-50 backdrop-blur-xl">
      <div className="max-w-[1400px] mx-auto px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center shadow-glow">
            {/* <img src="../../public/logo.png" alt="logo" className="w-6 h-6"/> */}
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">
              Dashboard Technet 
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              Agente Autorizado da CLaro
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshData}
            disabled={isLoading || isSyncing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoading || isSyncing) ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Atualizar'}
          </Button>
          
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="w-4 h-4" />
            <span className="capitalize">{currentDate}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
