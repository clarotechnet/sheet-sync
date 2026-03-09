import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle } from 'lucide-react';
import { ComissionamentoData } from '@/types/comissionamento';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<ComissionamentoData>) => Promise<void>;
  record: ComissionamentoData | null;
  uniqueNomes: string[];
  uniqueCidades: string[];
}

const STATUS_OPTIONS = ['PENDENTE', 'CONFIRMADA', 'CANCELADA'];

const formatDateForInput = (val: string | null) => {
  if (!val) return '';
  const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? val.substring(0, 10) : '';
};

export const ComissionamentoEditDialog: React.FC<Props> = ({ open, onClose, onSave, record, uniqueNomes, uniqueCidades }) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (record) {
      setForm({
        nome: record.nome || '',
        login_criador: record.login_criador || '',
        alocacao: record.alocacao || '',
        data: formatDateForInput(record.data),
        mes_instalado: record.mes_instalado || '',
        tipo_venda: record.tipo_venda || '',
        proposta: record.proposta || '',
        data_envio_grupo: formatDateForInput(record.data_envio_grupo),
        contrato: record.contrato || '',
        valores: record.valores != null ? String(record.valores) : '',
        data_agen: formatDateForInput(record.data_agen),
        data_exec: formatDateForInput(record.data_exec),
        observacoes: record.observacoes || '',
        janela: record.janela || '',
        pagamento: record.pagamento || '',
        mes_ano_proposta: record.mes_ano_proposta || '',
        status: record.status || 'PENDENTE',
      });
      setError('');
      setSuccess(false);
    }
  }, [record]);

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!record?.id) return;
    setSubmitting(true);
    setError('');
    try {
      const updates: Partial<ComissionamentoData> = {
        nome: form.nome,
        login_criador: form.login_criador || null,
        alocacao: form.alocacao || null,
        data: form.data || null,
        mes_instalado: form.mes_instalado || null,
        tipo_venda: form.tipo_venda || null,
        proposta: form.proposta || null,
        data_envio_grupo: form.data_envio_grupo || null,
        contrato: form.contrato || null,
        valores: form.valores ? parseFloat(form.valores.replace(/[^\d.,\-]/g, '').replace(',', '.')) : null,
        data_agen: form.data_agen || null,
        data_exec: form.data_exec || null,
        observacoes: form.observacoes || null,
        janela: form.janela || null,
        pagamento: form.pagamento || null,
        mes_ano_proposta: form.mes_ano_proposta || null,
        status: (form.status as any) || 'PENDENTE',
      };
      await onSave(record.id, updates);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  const selectClass = "w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-sm";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Registro</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="w-12 h-12 text-primary" />
            <p className="text-lg font-semibold text-foreground">Registro atualizado com sucesso!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Nome</Label>
                <Input list="edit-nomes" value={form.nome} onChange={e => set('nome', e.target.value)} />
                <datalist id="edit-nomes">
                  {uniqueNomes.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Login Criador</Label>
                <Input list="edit-logins" value={form.login_criador} onChange={e => set('login_criador', e.target.value)} />
                <datalist id="edit-logins">
                  {uniqueNomes.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Alocação</Label>
                <select className={selectClass} value={form.alocacao} onChange={e => set('alocacao', e.target.value)}>
                  <option value="">Selecione...</option>
                  {uniqueCidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Data</Label>
                <Input type="date" value={form.data} onChange={e => set('data', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Mês Instalado</Label>
                <Input value={form.mes_instalado} onChange={e => set('mes_instalado', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Tipo Venda</Label>
                <Input value={form.tipo_venda} onChange={e => set('tipo_venda', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Proposta</Label>
                <Input value={form.proposta} onChange={e => set('proposta', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Envio Grupo</Label>
                <Input type="date" value={form.data_envio_grupo} onChange={e => set('data_envio_grupo', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Contrato</Label>
                <Input value={form.contrato} onChange={e => set('contrato', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Valores</Label>
                <Input value={form.valores} onChange={e => set('valores', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Agen.</Label>
                <Input type="date" value={form.data_agen} onChange={e => set('data_agen', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Exec.</Label>
                <Input type="date" value={form.data_exec} onChange={e => set('data_exec', e.target.value)} />
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label className="text-sm text-muted-foreground">Observações</Label>
                <Input value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Janela</Label>
                <Input value={form.janela} onChange={e => set('janela', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Pagamento</Label>
                <Input value={form.pagamento} onChange={e => set('pagamento', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Mês/Ano Proposta</Label>
                <Input value={form.mes_ano_proposta} onChange={e => set('mes_ano_proposta', e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label className="text-sm font-medium">Status</Label>
                <select className={selectClass} value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>Fechar</Button>
              <Button onClick={handleSave} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salvar Alterações
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};