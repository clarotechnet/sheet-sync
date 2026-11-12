import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
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
import type { GatilhosImportBatch } from '@/utils/gatilhosImport';

interface GatilhosImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importing: boolean;
  onPrepare: (files: File[], inicio: string) => Promise<GatilhosImportBatch>;
  onImport: (batch: GatilhosImportBatch, inicio: string, fim: string, confirmPartial: boolean) => Promise<number>;
}

export function GatilhosImportDialog({
  open,
  onOpenChange,
  importing,
  onPrepare,
  onImport,
}: GatilhosImportDialogProps) {
  const defaultPeriod = getDefaultGatilhoPeriod();
  const [files, setFiles] = useState<File[]>([]);
  const [inicio, setInicio] = useState(defaultPeriod.inicio);
  const [fim, setFim] = useState(defaultPeriod.fim);
  const [review, setReview] = useState<GatilhosImportBatch | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!open) return;
    const period = getDefaultGatilhoPeriod();
    setInicio(period.inicio);
    setFim(period.fim);
    setFiles([]);
    setReview(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [open]);

  useEffect(() => { if (review) reviewRef.current?.scrollIntoView({ block: 'start' }); }, [review]);

  const submit = async () => {
    if (submitting.current || importing) return;
    if (!files.length) {
      toast({ title: 'Selecione pelo menos um arquivo Excel', variant: 'destructive' });
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      toast({ title: 'Período inválido', description: 'A data final deve ser igual ou posterior à inicial.', variant: 'destructive' });
      return;
    }

    submitting.current = true;
    try {
      const batch = review || await onPrepare(files, inicio);
      if (!review && (batch.conflitos.length || batch.falhas.length)) {
        setReview(batch);
        return;
      }
      const total = await onImport(batch, inicio, fim, Boolean(review));
      toast({
        title: 'Carga de gatilhos atualizada',
        description: `${total} IDs processados em ${batch.totalArquivosAceitos} ${batch.totalArquivosAceitos === 1 ? 'arquivo' : 'arquivos'}.${batch.conflitos.length ? ` ${batch.conflitos.length} IDs repetidos não foram alterados.` : ''}`,
      });
      onOpenChange(false);
    } catch (caught: unknown) {
      toast({
        title: 'Falha ao importar gatilhos',
        description: caught instanceof Error ? caught.message : 'Não foi possível processar os arquivos.',
        variant: 'destructive',
      });
    } finally {
      submitting.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !importing && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-lg">
        <DialogHeader className="shrink-0 pr-5">
          <DialogTitle>Importar atualização de gatilhos</DialogTitle>
          <DialogDescription>
            O sistema lerá somente a aba Comiss.Sintético de cada arquivo.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gatilho-inicio">Data inicial</Label>
              <Input id="gatilho-inicio" type="date" value={inicio} disabled={importing} onChange={(event) => { setInicio(event.target.value); setReview(null); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gatilho-fim">Data final</Label>
              <Input id="gatilho-fim" type="date" value={fim} disabled={importing} onChange={(event) => { setFim(event.target.value); setReview(null); }} />
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            disabled={importing}
            aria-label="Selecionar arquivos Excel"
            className="hidden"
            onChange={(event) => {
              const added = Array.from(event.target.files || []);
              setFiles((current) => [...current, ...added]);
              setReview(null);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-28 w-full items-center gap-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-5 py-4 text-left transition-colors hover:border-[#e31325] hover:bg-red-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white text-[#e31325] shadow-sm">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">{files.length ? 'Adicionar arquivos' : 'Selecionar arquivos XLSX'}</span>
              <span className="mt-1 block text-xs text-slate-500">Colunas: Id, Valor, Valor Instalador, Valor Auxiliar e Valor Deslocamento</span>
            </span>
          </button>

          {files.length > 0 && <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">{files.length} {files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}</p>
            <ul aria-label="Arquivos selecionados" className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {files.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-3 py-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-[#e31325]" />
                <span className="min-w-0 flex-1 break-all text-sm text-slate-700">{file.name}</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={importing} title={`Remover ${file.name}`} aria-label={`Remover ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, position) => position !== index)); setReview(null); }}><X className="h-4 w-4" /></Button>
              </li>)}
            </ul>
          </div>}

          {review && <div ref={reviewRef} role="region" aria-label="Revisão da importação" className="space-y-4 border-y border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <div>
              <h3 className="font-bold">Revisar pendências da carga</h3>
              <p className="mt-1"><strong>{review.rows.length} IDs sem conflito</strong> em {review.totalArquivosAceitos} {review.totalArquivosAceitos === 1 ? 'arquivo' : 'arquivos'}.</p>
              <p className="mt-2">{review.rows.length ? 'Deseja enviar somente os válidos? Os IDs repetidos e os arquivos inválidos ficarão de fora. Nenhum valor repetido será somado ou substituído.' : 'Não há IDs sem conflito para enviar. Revise os arquivos antes de continuar.'}</p>
            </div>
            {review.conflitos.length > 0 && <div>
              <h4 className="font-semibold">IDs repetidos ({review.conflitos.length})</h4>
              <ul aria-label="IDs repetidos" className="mt-2 max-h-48 divide-y divide-amber-200 overflow-y-auto">
                {review.conflitos.map((conflict) => <li key={conflict.idExterno} className="space-y-1 py-2 first:pt-0">
                  <p className="font-semibold">ID {conflict.idExterno} · {conflict.nomes.length ? conflict.nomes.join(' / ') : 'Sem colaborador vinculado a este ID'}</p>
                  <p className="break-words text-xs">Arquivos: {conflict.arquivos.join(' · ')}</p>
                  <p className="text-xs">{conflict.ocorrencias} ocorrências excluídas do envio</p>
                </li>)}
              </ul>
            </div>}
            {review.falhas.length > 0 && <div>
              <h4 className="font-semibold">Arquivos inválidos ({review.falhas.length})</h4>
              <ul aria-label="Arquivos inválidos" className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                {review.falhas.map((failure, index) => <li key={`${failure.arquivo}-${index}`}><p className="break-all font-semibold">{failure.arquivo}</p><p className="text-xs">{failure.motivo}</p></li>)}
              </ul>
            </div>}
          </div>}

          <div className="flex gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Os IDs desta carga serão atualizados apenas no período escolhido. Períodos anteriores e outras cidades serão preservados. Ajustes manuais de pontuação desse período também permanecem.</p>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={importing || !files.length || Boolean(review && !review.rows.length)} className="bg-[#e31325] hover:bg-[#c81020]">
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            {importing ? 'Processando carga...' : review ? 'Enviar somente os válidos' : 'Atualizar carga'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
