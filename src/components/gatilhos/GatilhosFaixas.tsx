import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Loader2, Save, Target } from 'lucide-react';
import type { GatilhoFaixa, GatilhoTipo } from '@/types/gatilhos';
import { GATILHO_TIPOS } from '@/types/gatilhos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

interface GatilhosFaixasProps {
  faixas: GatilhoFaixa[];
  onSave: (faixas: GatilhoFaixa[]) => Promise<void>;
}

export function GatilhosFaixas({ faixas, onSave }: GatilhosFaixasProps) {
  const [draft, setDraft] = useState<GatilhoFaixa[]>(faixas);
  const [savingType, setSavingType] = useState<GatilhoTipo | null>(null);

  useEffect(() => setDraft(faixas), [faixas]);

  const grouped = useMemo(() => new Map(
    GATILHO_TIPOS.map((tipo) => [
      tipo.value,
      draft.filter((faixa) => faixa.tipo === tipo.value).sort((a, b) => a.nivel - b.nivel),
    ]),
  ), [draft]);

  const update = (id: string, field: 'pontos' | 'premio', rawValue: string) => {
    const value = Math.max(0, Number(rawValue) || 0);
    setDraft((current) => current.map((faixa) => faixa.id === id ? { ...faixa, [field]: value } : faixa));
  };

  const saveType = async (tipo: GatilhoTipo) => {
    const items = grouped.get(tipo) || [];
    if (items.some((item) => item.pontos <= 0)) {
      toast({ title: 'Os pontos precisam ser maiores que zero', variant: 'destructive' });
      return;
    }
    for (let index = 1; index < items.length; index += 1) {
      if (items[index].pontos <= items[index - 1].pontos) {
        toast({ title: 'As faixas de pontos precisam estar em ordem crescente', variant: 'destructive' });
        return;
      }
    }

    setSavingType(tipo);
    try {
      await onSave(items);
      toast({ title: 'Faixas atualizadas' });
    } catch (caught: unknown) {
      toast({
        title: 'Erro ao salvar faixas',
        description: caught instanceof Error ? caught.message : 'Não foi possível atualizar os valores.',
        variant: 'destructive',
      });
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-xl font-extrabold text-slate-950">Faixas de premiação</h2>
        <p className="mt-1 text-sm text-slate-500">Os valores abaixo alimentam automaticamente o gatilho atingido e a premiação do ranking.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {GATILHO_TIPOS.map((tipo) => {
          const items = grouped.get(tipo.value) || [];
          return (
            <section key={tipo.value} className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
                <div>
                  <h3 className="font-extrabold text-slate-950">{tipo.label}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Quatro níveis de produção</p>
                </div>
                <Button type="button" size="sm" onClick={() => saveType(tipo.value)} disabled={Boolean(savingType)}>
                  {savingType === tipo.value ? <Loader2 className="animate-spin" /> : <Save />}
                  Salvar
                </Button>
              </header>
              <div className="divide-y divide-slate-100">
                {items.map((faixa) => (
                  <div key={faixa.id} className="grid grid-cols-[70px_1fr_1fr] items-end gap-3 px-5 py-4">
                    <div className="pb-2 text-sm font-extrabold text-[#e31325]">{faixa.nivel}º gatilho</div>
                    <div className="space-y-1.5">
                      <label htmlFor={`pontos-${faixa.id}`} className="flex items-center gap-1 text-xs font-bold text-slate-500"><Target className="h-3.5 w-3.5" /> Pontos</label>
                      <Input id={`pontos-${faixa.id}`} type="number" min="1" step="1" value={faixa.pontos} onChange={(event) => update(faixa.id, 'pontos', event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`premio-${faixa.id}`} className="flex items-center gap-1 text-xs font-bold text-slate-500"><CircleDollarSign className="h-3.5 w-3.5" /> Prêmio (R$)</label>
                      <Input id={`premio-${faixa.id}`} type="number" min="0" step="0.01" value={faixa.premio} onChange={(event) => update(faixa.id, 'premio', event.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

