import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle, Plus, Minus } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Record<string, any>) => Promise<void>;
  uniqueNomes: string[];
  uniqueCidades: string[];
}

const STATUS_OPTIONS = ['PENDENTE', 'CONFIRMADA', 'CANCELADA'];

const emptyForm = {
  nome: '', login_criador: '', alocacao: '', data: '', mes_instalado: '',
  tipo_venda: '', proposta: '', data_envio_grupo: '', contrato: '', valores: '',
  data_agen: '', data_exec: '', observacoes: '', janela: '', pagamento: '',
  mes_ano_proposta: '', status: 'PENDENTE'
};

export const ComissionamentoFormDialog: React.FC<Props> = ({ open, onClose, onSubmit, uniqueNomes, uniqueCidades }) => {
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [quantity, setQuantity] = useState(1);

  const set = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));


  const requiredFields = ['nome', 'login_criador', 'alocacao', 'data', 'tipo_venda', 'proposta', 'data_envio_grupo', 'contrato', 'valores', 'data_agen', 'data_exec', 'status'];

  const isValid = requiredFields.every(f => (form as any)[f]?.toString().trim());

  const handleSubmit = async () => {
    if (!isValid) { setError('Preencha todos os campos obrigatórios.'); return; }
    setSubmitting(true);
    setError('');
    try {
     const payload = {
        ...form,
        valores: form.valores ? parseFloat(form.valores.replace(/[^\d.,\-]/g, '').replace(',', '.')) : null,
        observacoes: form.observacoes || null,
        janela: form.janela || null,
        pagamento: form.pagamento || null,
        mes_ano_proposta: form.mes_ano_proposta || null,
        mes_instalado: form.mes_instalado || null,
     };
      for (let i = 0; i < quantity; i++) {
        await onSubmit({ ...payload });
      }
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setForm({ ...emptyForm });
        setQuantity(1);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    setForm({ ...emptyForm });
    setQuantity(1);
    setError('');
  };

  const selectClass = "w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground text-sm";


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preencher Formulário de Comissionamento</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle className="w-12 h-12 text-primary" />
                        <p className="text-lg font-semibold text-foreground">
              {quantity > 1 ? `${quantity} registros enviados com sucesso!` : 'Registro enviado com sucesso!'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          
              <div className="space-y-1">
                <Label className="text-sm font-medium">Nome *</Label>
                <Input list="nomes-list" placeholder="Digite ou selecione..." value={form.nome} onChange={e => set('nome', e.target.value)} />
                <datalist id="nomes-list">
                  {uniqueNomes.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              {/* LOGIN CRIADOR - datalist for suggestions + free typing */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Login Criador *</Label>
                <Input list="logins-list" placeholder="Digite ou selecione..." value={form.login_criador} onChange={e => set('login_criador', e.target.value)} />
                <datalist id="logins-list">
                  {uniqueNomes.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>

              {/* ALOCAÇÃO - select */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Alocação *</Label>
                <select className={selectClass} value={form.alocacao} onChange={e => set('alocacao', e.target.value)}>
                  <option value="">Selecione...</option>
                  {uniqueCidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div> 

              {/* DATA */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Criação *</Label>
                <Input type="date" value={form.data} onChange={e => set('data', e.target.value)} />
              </div>

              {/* MÊS INSTALADO */}
              {/* <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Mês Instalado</Label>
                <Input placeholder="Ex: Janeiro" value={form.mes_instalado} onChange={e => set('mes_instalado', e.target.value)} />
              </div> */}

             {/* TIPO VENDA - free text */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Tipo Venda *</Label>
                <Input placeholder="Ex: WIFI MESH" value={form.tipo_venda} onChange={e => set('tipo_venda', e.target.value)} />
              </div>

              {/* PROPOSTA - free text */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Proposta *</Label>
                <Input placeholder="Ex: CONEX, VNA" value={form.proposta} onChange={e => set('proposta', e.target.value)} />
              </div>

              {/* DATA ENVIO GRUPO */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Envio Grupo *</Label>
                <Input type="date" value={form.data_envio_grupo} onChange={e => set('data_envio_grupo', e.target.value)} />
              </div>

              {/* CONTRATO */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Contrato *</Label>
                <Input placeholder="Nº do contrato" value={form.contrato} onChange={e => set('contrato', e.target.value)} />
              </div>

              {/* VALORES */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Valores *</Label>
                <Input placeholder="R$ 0,00" value={form.valores} onChange={e => set('valores', e.target.value)} />
              </div>

              {/* DATA AGEN */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Agendamento. *</Label>
                <Input type="date" value={form.data_agen} onChange={e => set('data_agen', e.target.value)} />
              </div>

              {/* DATA EXEC */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Execução. </Label>
                <Input type="date" value={form.data_exec} onChange={e => set('data_exec', e.target.value)} />
              </div>

             {/* OBSERVAÇÕES - optional */}
              <div className="space-y-1 md:col-span-2">
                 <Label className="text-sm text-muted-foreground">Observações</Label>
                <Input placeholder="Observações (opcional)" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
              </div>

              {/* JANELA */}
              {/* <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Janela</Label>
                <Input placeholder="Janela (opcional)" value={form.janela} onChange={e => set('janela', e.target.value)} />
              </div> */}

              {/* PAGAMENTO */}
              {/* <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Pagamento</Label>
                <Input placeholder="Pagamento (opcional)" value={form.pagamento} onChange={e => set('pagamento', e.target.value)} />
              </div> */}

              {/* MÊS/ANO PROPOSTA */}
              {/* <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Mês/Ano Proposta</Label>
                <Input placeholder="Ex: 01/2025" value={form.mes_ano_proposta} onChange={e => set('mes_ano_proposta', e.target.value)} />
              </div> */}

              {/* STATUS - select */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">Status *</Label>
                <select className={selectClass} value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

                 {/* QUANTITY MULTIPLIER */}
              <div className="space-y-1 md:col-span-2">
                <Label className="text-sm font-medium">Quantidade (multiplicar envio)</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={quantity <= 1}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="text-lg font-bold text-foreground min-w-[2rem] text-center">{quantity}</span>
                  <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setQuantity(q => q + 1)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                  {quantity > 1 && (
                    <span className="text-xs text-muted-foreground">
                      Este formulário será enviado {quantity}x
                    </span>
                  )}
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="ghost" onClick={onClose} disabled={submitting}>Fechar</Button>
              <Button variant="outline" onClick={handleClear} disabled={submitting}>Limpar</Button>
              <Button onClick={handleSubmit} disabled={submitting || !isValid}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {quantity > 1 ? `Enviar (${quantity}x)` : 'Enviar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
