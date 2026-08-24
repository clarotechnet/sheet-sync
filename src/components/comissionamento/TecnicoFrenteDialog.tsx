import React, { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TecnicoFrente } from '@/types/comissionamento';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<TecnicoFrente, 'id'>) => Promise<TecnicoFrente>;
  frenteOptions: string[];
  cidadeOptions: string[];
}

const emptyForm = { nome: '', frente: '', cidade: '' };

export const TecnicoFrenteDialog: React.FC<Props> = ({
  open,
  onClose,
  onSubmit,
  frenteOptions,
  cidadeOptions,
}) => {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isValid = Boolean(form.nome.trim() && form.frente && form.cidade);

  const closeDialog = () => {
    if (submitting) return;
    setForm({ ...emptyForm });
    setError('');
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) {
      setError('Preencha nome, frente e cidade.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const tecnico = await onSubmit({
        nome: form.nome,
        frente: form.frente,
        cidade: form.cidade,
      });

      toast({
        title: 'Colaborador adicionado',
        description: `${tecnico.nome} já está disponível no formulário.`,
      });
      setForm({ ...emptyForm });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar o colaborador.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectClass = 'w-full h-10 bg-card border border-border rounded-md px-3 py-2 text-foreground text-sm';

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); }}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Adicionar colaborador</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tecnico-nome">Nome *</Label>
              <Input
                id="tecnico-nome"
                value={form.nome}
                onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                placeholder="Nome completo"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tecnico-frente">Frente *</Label>
              <select
                id="tecnico-frente"
                className={selectClass}
                value={form.frente}
                onChange={(event) => setForm((prev) => ({ ...prev, frente: event.target.value }))}
              >
                <option value="">Selecione...</option>
                {frenteOptions.map((frente) => (
                  <option key={frente} value={frente}>{frente}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tecnico-cidade">Cidade *</Label>
              <select
                id="tecnico-cidade"
                className={selectClass}
                value={form.cidade}
                onChange={(event) => setForm((prev) => ({ ...prev, cidade: event.target.value }))}
              >
                <option value="">Selecione...</option>
                {cidadeOptions.map((cidade) => (
                  <option key={cidade} value={cidade}>{cidade}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !isValid}>
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
