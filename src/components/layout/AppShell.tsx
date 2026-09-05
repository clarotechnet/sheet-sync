import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Trophy,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavigationItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: '/selecao', icon: LayoutDashboard },
  { label: 'Sistema de Gestão', path: '/dashboard-atividades', icon: ClipboardList },
  { label: 'Comissionamento Técnico', path: '/comissionamento', icon: WalletCards, adminOnly: true },
  { label: 'Gatilhos', path: '/gatilhos', icon: Trophy, adminOnly: true },
  { label: 'Configurações', path: '/admin', icon: Settings, adminOnly: true },
];

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, isAdmin, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('technet-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const displayName = profile?.display_name?.trim() || profile?.email?.split('@')[0] || 'Usuário';
  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem('technet-sidebar-collapsed', String(sidebarCollapsed));
    } catch {
      // O menu continua funcionando mesmo se o navegador bloquear o armazenamento local.
    }
  }, [sidebarCollapsed]);

  const handleNavigate = (item: NavigationItem) => {
    if (item.adminOnly && !isAdmin) {
      toast({
        title: 'Acesso restrito',
        description: 'Este módulo está disponível apenas para administradores.',
        variant: 'destructive',
      });
      return;
    }
    navigate(item.path);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const renderSidebar = (compact: boolean, showCollapseControl: boolean) => (
    <aside
      className={cn(
        'flex h-full flex-col bg-[#070b18] text-white transition-[width] duration-200',
        compact ? 'w-[72px]' : 'w-[236px]',
      )}
    >
      <div
        className={cn(
          'flex h-[76px] items-center border-b border-white/10 bg-[#e31325]',
          compact ? 'justify-center px-2' : 'gap-3 px-4',
        )}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
          <img
            src={`${import.meta.env.BASE_URL}LogoCompacto.webp`}
            alt="Logo TechNET"
            width={48}
            height={48}
            className="block h-full w-full object-contain"
          />
        </div>
        {!compact && (
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold leading-tight">TechNET</p>
            <p className="truncate text-[11px] font-medium text-white/80">Indicadores operacionais</p>
          </div>
        )}
      </div>

      <nav
        className={cn('flex-1 space-y-1.5 overflow-y-auto py-4', compact ? 'px-2' : 'px-3')}
        aria-label="Navegação principal"
      >
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path;
          const restricted = item.adminOnly && !isAdmin;

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavigate(item)}
              aria-current={active ? 'page' : undefined}
              aria-label={restricted ? `${item.label}, acesso restrito` : item.label}
              title={compact ? item.label : undefined}
              className={cn(
                'flex min-h-10 w-full items-center rounded-md text-left text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                compact ? 'justify-center px-0' : 'gap-3 px-3',
                active
                  ? 'bg-[#e31325] text-white'
                  : 'text-slate-300 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!compact && <span className="min-w-0 flex-1 leading-5">{item.label}</span>}
              {restricted && !compact && <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
            </button>
          );
        })}
      </nav>

      {showCollapseControl && (
        <div className="border-t border-white/10 p-2">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            className={cn(
              'flex min-h-10 w-full items-center rounded-md text-sm font-semibold text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
              compact ? 'justify-center px-0' : 'gap-3 px-3',
            )}
            aria-label={compact ? 'Expandir menu' : 'Recolher menu'}
            title={compact ? 'Expandir menu' : undefined}
          >
            {compact ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!compact && <span>Recolher menu</span>}
          </button>
        </div>
      )}

      <div className={cn('border-t border-white/10', compact ? 'p-2' : 'p-3')}>
        <div
          className={cn(
            'mb-2 flex items-center rounded-md bg-white/[0.06]',
            compact ? 'justify-center p-2' : 'gap-3 p-3',
          )}
          title={compact ? `${displayName} - ${isAdmin ? 'Administrador' : 'Usuário'}` : undefined}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#111827]">
            {initials}
          </div>
          {!compact && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{displayName}</p>
                <p className="truncate text-xs text-slate-400">{isAdmin ? 'Administrador' : 'Usuário'}</p>
              </div>
              <UserRound className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            'flex min-h-10 w-full items-center rounded-md text-sm font-semibold text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
            compact ? 'justify-center px-0' : 'gap-3 px-3',
          )}
          aria-label="Sair"
          title={compact ? 'Sair' : undefined}
        >
          <LogOut className="h-[18px] w-[18px]" />
          {!compact && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f6f7f9]">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        {renderSidebar(sidebarCollapsed, true)}
      </div>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
            <img
              src={`${import.meta.env.BASE_URL}LogoCompacto.webp`}
              alt="Logo TechNET"
              width={48}
              height={48}
              className="block h-full w-full object-contain"
            />
          </div>
          <span className="font-extrabold text-slate-950">TechNET</span>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-xs font-extrabold text-white">
          {initials}
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu ao tocar fora"
          />
          <div className="relative h-full w-[236px] shadow-2xl">
            {renderSidebar(false, false)}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute left-[244px] top-4 flex h-9 w-9 items-center justify-center rounded-md bg-white text-slate-800 shadow-lg hover:bg-slate-100"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div
        className={cn(
          'min-w-0 transition-[padding-left] duration-200',
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[236px]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
