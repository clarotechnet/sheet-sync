import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, LockKeyhole, RefreshCw, Upload } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { TabNavigation } from '@/components/dashboard/TabNavigation';
import { LoadingSpinner } from '@/components/dashboard/LoadingSpinner';
import { GatilhosImportDialog } from '@/components/gatilhos/GatilhosImportDialog';
import { GatilhosRanking } from '@/components/gatilhos/GatilhosRanking';
import { GatilhosVinculos } from '@/components/gatilhos/GatilhosVinculos';
import { GatilhosFaixas } from '@/components/gatilhos/GatilhosFaixas';
import { GatilhoVinculoDialog } from '@/components/gatilhos/GatilhoVinculoDialog';
import { GatilhoPontuacaoDialog } from '@/components/gatilhos/GatilhoPontuacaoDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGatilhos } from '@/hooks/useGatilhos';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { GatilhoRankingItem } from '@/types/gatilhos';

const TABS = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'vinculos', label: 'IDs e Equipes' },
  { id: 'faixas', label: 'Faixas de Premiação' },
];

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export default function Gatilhos() {
  const hook = useGatilhos();
  const { isAdmin } = useAuth();
  const { fetchData } = hook;
  const [activeTab, setActiveTab] = useState('ranking');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GatilhoRankingItem | null>(null);
  const [scoreItem, setScoreItem] = useState<GatilhoRankingItem | null>(null);
  const [closeTarget, setCloseTarget] = useState<{ inicio: string; fim: string; total: number } | null>(null);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const period = useMemo(
    () => hook.periods.find((item) => item.inicio === hook.activePeriod),
    [hook.activePeriod, hook.periods],
  );
  const busy = hook.isLoading || hook.isHistoryLoading || hook.isImporting || hook.isClosing;
  const readOnly = !isAdmin || Boolean(hook.fechamento) || busy || Boolean(hook.error);

  useEffect(() => {
    setSelectedItem(null);
    setScoreItem(null);
    setCloseTarget(null);
  }, [hook.activePeriod, hook.fechamento]);

  const confirmClose = async () => {
    if (!closeTarget || !isAdmin || busy) return;
    try {
      await hook.closePeriod(closeTarget.inicio);
      setCloseTarget(null);
      toast({ title: 'Período fechado', description: 'Os dados e as equipes desse período foram preservados.' });
    } catch (caught) {
      toast({ title: 'Falha ao fechar período', description: typeof caught === 'object' && caught && 'message' in caught ? String(caught.message) : 'Não foi possível concluir o fechamento.', variant: 'destructive' });
    }
  };

  return (
    <AppShell>
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Gatilhos</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Ranking operacional e premiação por produção</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={hook.activePeriod || undefined} onValueChange={hook.setSelectedPeriod} disabled={busy || hook.periods.length === 0}>
                <SelectTrigger className="w-full min-w-0 bg-white sm:w-auto" aria-label="Período dos gatilhos">
                  <CalendarDays className="h-4 w-4" />
                  <SelectValue placeholder="Sem período" />
                </SelectTrigger>
                <SelectContent>
                  {hook.periods.map((item) => (
                    <SelectItem key={item.inicio} value={item.inicio}>
                      {formatDate(item.inicio)} até {formatDate(item.fim)} ({item.total} IDs) · {item.fechado ? 'Fechado' : 'Aberto'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={fetchData} disabled={busy}>
                <RefreshCw className={hook.isLoading ? 'animate-spin' : ''} />
                Atualizar
              </Button>
              {isAdmin && !hook.fechamento && <Button type="button" variant="outline" disabled={busy || !period || hook.closureAvailable !== true || Boolean(hook.error)} onClick={() => setCloseTarget(period || null)}>
                <LockKeyhole /> Fechar período
              </Button>}
              {isAdmin && <Button type="button" disabled={busy || Boolean(hook.error)} onClick={() => setImportOpen(true)} className="bg-[#e31325] hover:bg-[#c81020]">
                <Upload />
                Importar Excel
              </Button>}
            </div>
          </header>

          <TabNavigation tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          {period && <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>Período selecionado: {formatDate(period.inicio)} até {formatDate(period.fim)}</span>
            <Badge variant="outline" className={hook.fechamento ? 'gap-1 border-emerald-200 bg-emerald-50 text-emerald-800' : ''}>
              {hook.fechamento && <LockKeyhole className="h-3 w-3" />}{hook.fechamento ? 'Fechado' : 'Aberto'}
            </Badge>
            {hook.fechamento && <span>Fechado em {new Date(hook.fechamento.fechado_em).toLocaleString('pt-BR')} · Somente leitura</span>}
          </div>}

          {hook.closureAvailable === false && <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Fechamento indisponível: a atualização do banco ainda não foi aplicada. Os períodos continuam abertos, sem proteção de fechamento.
          </div>}

          {hook.error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {hook.error}
            </div>
          )}

          {hook.isLoading || hook.isHistoryLoading ? (
            <LoadingSpinner message={hook.fechamento ? 'Carregando período fechado...' : 'Carregando gatilhos...'} />
          ) : !hook.error && (
            <div>
              {activeTab === 'ranking' && <GatilhosRanking ranking={hook.ranking} vinculos={hook.viewVinculos} periodo={period || null}
                readOnly={readOnly} disabled={busy} onEditVinculo={(item) => !readOnly && setSelectedItem(item)} onEditPontuacao={(item) => !readOnly && setScoreItem(item)} />}
              {activeTab === 'vinculos' && <GatilhosVinculos ranking={hook.ranking} readOnly={readOnly} onEdit={(item) => !readOnly && setSelectedItem(item)} />}
              {activeTab === 'faixas' && <GatilhosFaixas faixas={hook.viewFaixas} readOnly={readOnly} onSave={hook.saveFaixas} />}
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={Boolean(closeTarget)} onOpenChange={(open) => !hook.isClosing && !open && setCloseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar período de gatilhos?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTarget && <>De {formatDate(closeTarget.inicio)} até {formatDate(closeTarget.fim)}: todos os {closeTarget.total} IDs serão preservados, inclusive os que não aparecem nos filtros atuais. </>}
              Equipes, colaboradores, CPF, setor, cidade, pontuação e premiação ficarão registrados como estão agora.
              Não será possível editar, reimportar ou reabrir esse período. Mudanças futuras valerão apenas para períodos abertos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hook.isClosing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy || !closeTarget} onClick={(event) => { event.preventDefault(); void confirmClose(); }}>
              {hook.isClosing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LockKeyhole className="mr-2 h-4 w-4" />}Confirmar fechamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GatilhosImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        importing={hook.isImporting}
        onImport={hook.importWorkbook}
      />

      <GatilhoVinculoDialog
        open={Boolean(selectedItem) && !readOnly}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        item={selectedItem}
        vinculos={hook.vinculos}
        colaboradores={hook.colaboradores}
        tecnicosFrente={hook.tecnicosFrente}
        onSave={hook.saveVinculo}
        onDelete={hook.deleteVinculo}
      />
      <GatilhoPontuacaoDialog
        open={Boolean(scoreItem) && !readOnly}
        onOpenChange={(open) => !open && setScoreItem(null)}
        item={scoreItem}
        onSave={hook.savePontuacao}
      />
    </AppShell>
  );
}

