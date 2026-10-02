import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import type { GatilhoRankingItem } from '@/types/gatilhos';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';

interface GatilhoPontuacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GatilhoRankingItem | null;
  onSave: (idExterno: string, periodoInicio: string, valorAjustado: number | null, motivo: string) => Promise<void>;
}

const formatPoints = (value: number) => value.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parsePoints = (value: string) => {
  const clean = value.trim();
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(clean)) return null;
  const parsed = Number(clean.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999999999999.99 ? parsed : null;
};

export function GatilhoPontuacaoDialog({ open, onOpenChange, item, onSave }: GatilhoPontuacaoDialogProps) {
  const [value, setValue] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setValue(formatPoints(item.pontuacao));
    setMotivo(item.ajuste_motivo || '');
  }, [item, open]);

  const persist = async (adjusted: number | null) => {
    if (!item) return;
    setSaving(true);
    try {
      await onSave(item.id_externo, item.periodo_inicio, adjusted, adjusted === null ? '' : motivo.trim());
      toast({ title: adjusted === null ? 'Pontuação original restaurada' : 'Pontuação ajustada' });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({
        title: 'Não foi possível salvar a pontuação',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const parsed = parsePoints(value);
    if (parsed === null) {
      toast({ title: 'Pontuação inválida', description: 'Use o formato 9.000,00.', variant: 'destructive' });
      return;
    }
    persist(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar pontuação</DialogTitle>
          <DialogDescription>{item?.nome_exibicao} · ID {item?.id_externo}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">Valor importado: <strong className="text-slate-900">{formatPoints(Number(item?.valor || 0))}</strong></p>
          <div className="space-y-1.5">
            <Label htmlFor="gatilho-pontuacao">Pontuação para o gatilho</Label>
            <Input id="gatilho-pontuacao" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="9.000,00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gatilho-motivo">Motivo do ajuste (opcional)</Label>
            <Input id="gatilho-motivo" value={motivo} onChange={(event) => setMotivo(event.target.value)} maxLength={300} />
          </div>
          {item?.ajustado_em && <p className="text-xs text-slate-500">Último ajuste: {new Date(item.ajustado_em).toLocaleString('pt-BR')}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {item?.valor_ajustado !== null ? (
            <Button type="button" variant="outline" disabled={saving} onClick={() => persist(null)}>
              <RotateCcw className="h-4 w-4" /> Restaurar original
            </Button>
          ) : <span />}
          <Button type="button" disabled={saving} onClick={save} className="bg-[#e31325] hover:bg-[#c81020]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
