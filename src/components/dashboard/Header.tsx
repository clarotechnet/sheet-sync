import React, { forwardRef } from 'react';
import { Calendar, RefreshCw, LogOut, Shield } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const Header = forwardRef<HTMLElement>((_, ref) => {
  const { isSyncing, refreshData, isLoading } = useDashboard();
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();

  const currentDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isAdmin = profile?.role === 'admin';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header
      ref={ref}
      className="bg-surface border-b border-border sticky top-0 z-50 backdrop-blur-xl"
    >
      <div className="max-w-[1400px] mx-auto px-8 py-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl flex items-center justify-center shadow-glow overflow-hidden">
            <img
              src={`${import.meta.env.BASE_URL}LogoNovo.png`}
              alt="Logo Technet"
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <h1 className="text-2xl font-extrabold text-foreground">
              TechNET
            </h1>
            <p className="text-sm text-muted-foreground font-medium">
              Agente Autorizado da Claro
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

          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin')}
              className="gap-2"
            >
              <Shield className="w-4 h-4" />
              Admin
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';
