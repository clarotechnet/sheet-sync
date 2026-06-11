import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { brToIsoDate } from '@/types/atividade';
import { useToast } from '@/hooks/use-toast';

interface EditRowDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    item: Record<string, string | undefined> | null;
    onSaved?: () => void;
}

const STATUS_OPTIONS = ['Produtiva', 'Pendente', 'Improdutiva', 'Cancelada'] as const;

const pick = (item: Record<string, string | undefined>, keys: string[]) => {
    for (const k of keys) {
        const v = item[k];
        if (v != null && String(v).trim() !== '') return v;
    }
    return undefined;
};

const getCodBaixa = (item: Record<string, string | undefined>) =>
    pick(item, ['Cód de Baixa 1', 'CÃ³d de Baixa 1', 'Cod de Baixa 1']) || '';

const getNumericCode = (cod: string) => {
    const m = (cod || '').match(/^(\d+)/);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
};

export const EditRowDialog: React.FC<EditRowDialogProps> = ({ open, onOpenChange, item, onSaved }) => {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        recurso: '',
        tipo_atividade: '',
        contrato: '',
        cod_baixa_1: '',
        status_atividade: 'Pendente',
        data: '',
        intervalo_tempo: '',
        bairro: '',
        cidade: '',
        tecnologia: '',
    });

    useEffect(() => {
        if (!item) return;
        setForm({
            recurso: item.Recurso || '',
            tipo_atividade: item['Tipo de Atividade'] || '',
            contrato: item.Contrato || item.contrato || '',
            cod_baixa_1: getCodBaixa(item),
            status_atividade: item['Status da Atividade'] || 'Pendente',
            data: item.Data || '',
            intervalo_tempo: item['Intervalo de Tempo'] || '',
            bairro: item.Bairro || '',
            cidade: item.Cidade || item.cidade || '',
            tecnologia: item.Tecnologia || '',
        });
    }, [item]);

    if (!item) return null;

    const numericCod = getNumericCode(form.cod_baixa_1);
    const statusOS = (item['Status da O.S 1'] || '').trim().toLowerCase();
    const computedStatus =
        numericCod != null
            ? (numericCod >= 409 || statusOS === 'executada' ? 'Produtiva' : 'Improdutiva')
            : form.status_atividade;

    const buildMatch = () => {
        const match: Record<string, string> = {};
        const numeroWo = pick(item, ['Número da WO', 'NÃºmero da WO', 'Numero da WO']);
        const numeroOs1 = pick(item, ['Número da O.S 1', 'NÃºmero da O.S 1', 'Numero da O.S 1']);
        const contrato = pick(item, ['Contrato', 'contrato']);
        const dataIso = brToIsoDate(pick(item, ['Data']));
        if (numeroWo) match.numero_os = numeroWo;
        if (numeroOs1) match.numero_os1 = numeroOs1;
        if (contrato) match.contrato = contrato;
        if (dataIso) match.data_atividade = dataIso;
        return match;
    };

    const handleSave = async () => {
        const match = buildMatch();
        if (Object.keys(match).length === 0) {
            toast({ title: 'Erro', description: 'Não foi possível identificar a linha.', variant: 'destructive' });
            return;
        }

        setSaving(true);
        const payload: Record<string, unknown> = {
            recurso: form.recurso || null,
            tipo_atividade: form.tipo_atividade || null,
            contrato: form.contrato || null,
            cod_baixa_1: form.cod_baixa_1 || null,
            status_atividade: computedStatus,
            data_atividade: brToIsoDate(form.data) || null,
            intervalo_tempo: form.intervalo_tempo || null,
            bairro: form.bairro || null,
            cidade: form.cidade || null,
            tecnologia: form.tecnologia || null,
        };

        const { error } = await externalSupabase.from('atividades').update(payload).match(match);
        setSaving(false);

        if (error) {
            console.error('Erro ao atualizar atividade:', error);
            toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
            return;
        }

        toast({ title: 'Atividade atualizada' });
        onOpenChange(false);
        onSaved?.();
    };

    const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Editar Atividade</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                    <div className="space-y-2">
                        <Label>Recurso</Label>
                        <Input value={form.recurso} onChange={(e) => set('recurso', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Tipo de Atividade</Label>
                        <Input value={form.tipo_atividade} onChange={(e) => set('tipo_atividade', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Contrato</Label>
                        <Input value={form.contrato} onChange={(e) => set('contrato', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Cód de Baixa 1</Label>
                        <Input value={form.cod_baixa_1} onChange={(e) => set('cod_baixa_1', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>
                            Status {numericCod != null && <span className="text-xs text-muted-foreground">(automático pelo código)</span>}
                        </Label>
                        <select
                            value={computedStatus}
                            disabled={numericCod != null}
                            onChange={(e) => set('status_atividade', e.target.value)}
                            className="w-full bg-transparent border border-border rounded px-3 py-2 text-sm h-10"
                        >
                            {STATUS_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label>Data (dd/mm/aaaa)</Label>
                        <Input value={form.data} onChange={(e) => set('data', e.target.value)} placeholder="dd/mm/aaaa" />
                    </div>
                    <div className="space-y-2">
                        <Label>Intervalo de Tempo</Label>
                        <Input value={form.intervalo_tempo} onChange={(e) => set('intervalo_tempo', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Cidade</Label>
                        <Input value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Bairro</Label>
                        <Input value={form.bairro} onChange={(e) => set('bairro', e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label>Tecnologia</Label>
                        <select
                            value={form.tecnologia}
                            onChange={(e) => set('tecnologia', e.target.value)}
                            className="w-full bg-transparent border border-border rounded px-3 py-2 text-sm h-10"
                        >
                            <option value="">Nenhuma</option>
                            <option value="GPON">GPON</option>
                            <option value="HFC">HFC</option>
                        </select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};