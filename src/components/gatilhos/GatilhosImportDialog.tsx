import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { getDefaultGatilhoPeriod } from '@/hooks/useGatilhos';

interface GatilhosImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importing: boolean;
  onImport: (file: File, inicio: string, fim: string) => Promise<number>;
}

export function GatilhosImportDialog({
  open,
  onOpenChange,
  importing,
  onImport,
}: GatilhosImportDialogProps) {
  const defaultPeriod = getDefaultGatilhoPeriod();
  const [file, setFile] = useState<File | null>(null);
  const [inicio, setInicio] = useState(defaultPeriod.inicio);
  const [fim, setFim] = useState(defaultPeriod.fim);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const period = getDefaultGatilhoPeriod();
    setInicio(period.inicio);
    setFim(period.fim);
    setFile(null);
  }, [open]);

  const submit = async () => {
    if (!file) {
      toast({ title: 'Selecione o arquivo Excel', variant: 'destructive' });
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      toast({ title: 'Período inválido', description: 'A data final deve ser igual ou posterior à inicial.', variant: 'destructive' });
      return;
    }

    try {
      const total = await onImport(file, inicio, fim);
      toast({
        title: 'Carga de gatilhos atualizada',
        description: `${total} IDs foram processados a partir da aba Comiss.Sintético.`,
      });
      onOpenChange(false);
    } catch (caught: unknown) {
      toast({
        title: 'Falha ao importar gatilhos',
        description: caught instanceof Error ? caught.message : 'Não foi possível processar o arquivo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !importing && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar atualização de gatilhos</DialogTitle>
          <DialogDescription>
            O sistema lerá somente a aba Comiss.Sintético do arquivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gatilho-inicio">Data inicial</Label>
              <Input id="gatilho-inicio" type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gatilho-fim">Data final</Label>
              <Input id="gatilho-fim" type="date" value={fim} onChange={(event) => setFim(event.target.value)} />
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-28 w-full items-center gap-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-left transition-colors hover:border-[#e31325] hover:bg-red-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white text-[#e31325] shadow-sm">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-slate-900">{file?.name || 'Selecionar arquivo XLSX'}</span>
              <span className="mt-1 block text-xs text-slate-500">Colunas: Id, Valor, Valor Instalador, Valor Auxiliar e Valor Deslocamento</span>
            </span>
          </button>

          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>IDs novos serão incluídos. Quando o ID já existir, somente seus valores e período serão substituídos. Os demais estados serão preservados.</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={importing} className="bg-[#e31325] hover:bg-[#c81020]">
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            Atualizar carga
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
