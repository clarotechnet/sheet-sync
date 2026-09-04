import { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2, UsersRound } from 'lucide-react';
import type { ColaboradorCadastrado, TecnicoFrente } from '@/types/comissionamento';
import type { GatilhoRankingItem, GatilhoTipo, GatilhoVinculo } from '@/types/gatilhos';
import { GATILHO_CIDADES, GATILHO_TIPOS } from '@/types/gatilhos';
import { normalizePersonName } from '@/utils/normalizeName';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { CollaboratorPicker } from './CollaboratorPicker';

interface GatilhoVinculoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: GatilhoRankingItem | null;
  vinculos: GatilhoVinculo[];
  colaboradores: ColaboradorCadastrado[];
  tecnicosFrente: TecnicoFrente[];
  onSave: (idExterno: string, cidade: string, tipo: GatilhoTipo, colaboradorIds: string[]) => Promise<void>;
  onDelete: (idExterno: string) => Promise<void>;
}

export function GatilhoVinculoDialog({
  open,
  onOpenChange,
  item,
  vinculos,
  colaboradores,
  tecnicosFrente,
  onSave,
  onDelete,
}: GatilhoVinculoDialogProps) {
  const [tipo, setTipo] = useState<GatilhoTipo | ''>('');
  const [cidade, setCidade] = useState('');
  const [primeiroId, setPrimeiroId] = useState('');
  const [segundoId, setSegundoId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const current = useMemo(
    () => (item ? vinculos.filter((vinculo) => vinculo.id_externo === item.id_externo) : []),
    [item, vinculos],
  );
  const hasCurrent = current.length > 0;

  useEffect(() => {
    if (!open || !item) return;
    const ordered = [...current]
      .sort((a, b) => (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1));
    setTipo(ordered[0]?.tipo || '');
    setCidade(ordered[0]?.cidade || '');
    setPrimeiroId(ordered[0]?.colaborador_id || '');
    setSegundoId(ordered[1]?.colaborador_id || '');
  }, [current, item, open]);

  const inferCity = (colaboradorId: string) => {
    if (cidade) return;
    const colaborador = colaboradores.find((itemColaborador) => itemColaborador.id === colaboradorId);
    const tecnico = tecnicosFrente.find(
      (itemTecnico) => normalizePersonName(itemTecnico.nome) === normalizePersonName(colaborador?.nome),
    );
    if (tecnico?.cidade && GATILHO_CIDADES.includes(tecnico.cidade as (typeof GATILHO_CIDADES)[number])) {
      setCidade(tecnico.cidade);
    }
  };

  const save = async () => {
    if (!item || !tipo || !cidade || !primeiroId) {
      toast({ title: 'Preencha tipo, cidade e colaborador', variant: 'destructive' });
      return;
    }
    if (tipo === 'DUPLA' && (!segundoId || segundoId === primeiroId)) {
      toast({ title: 'Selecione dois colaboradores diferentes para a dupla', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const ids = tipo === 'DUPLA' ? [primeiroId, segundoId] : [primeiroId];
      await onSave(item.id_externo, cidade, tipo, ids);
      toast({ title: 'Vínculo salvo', description: `O ID ${item.id_externo} já está disponível no ranking.` });
      onOpenChange(false);
    } catch (caught: unknown) {
      toast({
        title: 'Erro ao salvar vínculo',
        description: caught instanceof Error ? caught.message : 'Não foi possível salvar o vínculo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await onDelete(item.id_externo);
      toast({ title: 'Vínculo removido' });
      onOpenChange(false);
    } catch (caught: unknown) {
      toast({
        title: 'Erro ao remover vínculo',
        description: caught instanceof Error ? caught.message : 'Não foi possível remover o vínculo.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !deleting && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-[#e31325]" />
            Vincular ID à equipe
          </DialogTitle>
          <DialogDescription>O mesmo ID pode ter dois colaboradores quando o tipo selecionado for Dupla.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gatilho-id">ID do relatório</Label>
            <Input id="gatilho-id" value={item?.id_externo || ''} readOnly className="bg-slate-50 font-mono" />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(value) => {
              const next = value as GatilhoTipo;
              setTipo(next);
              if (next !== 'DUPLA') setSegundoId('');
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {GATILHO_TIPOS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Cidade</Label>
            <Select value={cidade} onValueChange={setCidade}>
              <SelectTrigger><SelectValue placeholder="Selecione a cidade..." /></SelectTrigger>
              <SelectContent>
                {GATILHO_CIDADES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tipo === 'DUPLA' ? 'Instalador da dupla' : 'Colaborador'}</Label>
            <CollaboratorPicker
              colaboradores={colaboradores}
              value={primeiroId}
              onChange={(id) => { setPrimeiroId(id); inferCity(id); }}
              placeholder="Selecionar colaborador..."
              ariaLabel="Selecionar primeiro colaborador"
              excludeIds={segundoId ? [segundoId] : []}
            />
          </div>

          {tipo === 'DUPLA' && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Auxiliar da dupla</Label>
              <CollaboratorPicker
                colaboradores={colaboradores}
                value={segundoId}
                onChange={(id) => { setSegundoId(id); inferCity(id); }}
                placeholder="Selecionar segundo colaborador..."
                ariaLabel="Selecionar segundo colaborador"
                excludeIds={primeiroId ? [primeiroId] : []}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {hasCurrent && (
              <Button type="button" variant="destructive" onClick={remove} disabled={saving || deleting}>
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Remover vínculo
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || deleting}>Cancelar</Button>
            <Button type="button" onClick={save} disabled={saving || deleting} className="bg-[#e31325] hover:bg-[#c81020]">
              {saving && <Loader2 className="animate-spin" />}
              Salvar vínculo
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
