import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, RefreshCw, Upload } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGatilhos } from '@/hooks/useGatilhos';
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
  const { fetchData } = hook;
  const [activeTab, setActiveTab] = useState('ranking');
  const [importOpen, setImportOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<GatilhoRankingItem | null>(null);
  const [scoreItem, setScoreItem] = useState<GatilhoRankingItem | null>(null);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const period = useMemo(
    () => hook.periods.find((item) => item.inicio === hook.activePeriod),
    [hook.activePeriod, hook.periods],
  );

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
              <Select value={hook.activePeriod || undefined} onValueChange={hook.setSelectedPeriod} disabled={hook.periods.length === 0}>
                <SelectTrigger className="w-full min-w-[230px] bg-white sm:w-auto" aria-label="Período dos gatilhos">
                  <CalendarDays className="h-4 w-4" />
                  <SelectValue placeholder="Sem período" />
                </SelectTrigger>
                <SelectContent>
                  {hook.periods.map((item) => (
                    <SelectItem key={item.inicio} value={item.inicio}>
                      {formatDate(item.inicio)} até {formatDate(item.fim)} ({item.total} IDs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={fetchData} disabled={hook.isLoading}>
                <RefreshCw className={hook.isLoading ? 'animate-spin' : ''} />
                Atualizar
              </Button>
              <Button type="button" onClick={() => setImportOpen(true)} className="bg-[#e31325] hover:bg-[#c81020]">
                <Upload />
                Importar Excel
              </Button>
            </div>
          </header>

          <TabNavigation tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

          {period && <p className="text-sm text-slate-500">Período selecionado: {formatDate(period.inicio)} até {formatDate(period.fim)}</p>}

          {hook.error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {hook.error}
            </div>
          )}

          {hook.isLoading && hook.faixas.length === 0 ? (
            <LoadingSpinner message="Carregando gatilhos..." />
          ) : (
            <div>
              {activeTab === 'ranking' && <GatilhosRanking ranking={hook.ranking} onEditVinculo={setSelectedItem} onEditPontuacao={setScoreItem} />}
              {activeTab === 'vinculos' && <GatilhosVinculos ranking={hook.ranking} onEdit={setSelectedItem} />}
              {activeTab === 'faixas' && <GatilhosFaixas faixas={hook.faixas} onSave={hook.saveFaixas} />}
            </div>
          )}
        </div>
      </main>

      <GatilhosImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        importing={hook.isImporting}
        onImport={hook.importWorkbook}
      />

      <GatilhoVinculoDialog
        open={Boolean(selectedItem)}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        item={selectedItem}
        vinculos={hook.vinculos}
        colaboradores={hook.colaboradores}
        tecnicosFrente={hook.tecnicosFrente}
        onSave={hook.saveVinculo}
        onDelete={hook.deleteVinculo}
      />
      <GatilhoPontuacaoDialog
        open={Boolean(scoreItem)}
        onOpenChange={(open) => !open && setScoreItem(null)}
        item={scoreItem}
        onSave={hook.savePontuacao}
      />
    </AppShell>
  );
}

