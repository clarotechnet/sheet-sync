import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, DollarSign, LogOut, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '../../public/LogoNovo.png';

export default function ModuleSelection() {
  const navigate = useNavigate();
  const { signOut, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-border">
        <div className="max-w-[1400px] mx-auto px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-10 w-10 object-contain" />
            <h1 className="text-xl font-bold text-foreground">TechNET</h1>
          </div>
          <div className="flex items-center gap-3">
            {profile?.display_name && (
              <span className="text-sm text-muted-foreground">
                Olá, {profile.display_name}
              </span>
            )}
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin')} className="gap-2">
                <Shield className="w-4 h-4" /> Admin
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-3xl w-full">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-foreground mb-2">
              Selecione o módulo
            </h2>
            <p className="text-muted-foreground">
              Escolha qual sistema deseja acessar
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Card 1 - Gestão de Atividades */}
            <button
              onClick={() => navigate('/dashboard-atividades')}
              className="card group cursor-pointer text-left hover:border-primary/50 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center gap-6 py-4">
                <div className="w-20 h-20 bg-gradient-primary rounded-2xl flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform">
                  <Activity className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    Sistema de Gestão de Atividades
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Dashboard de atividades técnicas, KPIs, produtividade e mapas
                  </p>
                </div>
              </div>
            </button>

            {/* Card 2 - Comissionamento */}
            <button
              onClick={() => navigate('/comissionamento')}
              className="card group cursor-pointer text-left hover:border-primary/50 transition-all duration-300"
            >
              <div className="flex flex-col items-center text-center gap-6 py-4">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform"
                     style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
                  <DollarSign className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    Comissionamento Técnico
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Controle de comissões, ranking de técnicos e acompanhamento de status
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}