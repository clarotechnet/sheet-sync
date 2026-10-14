import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Save, Search, Upload, UserPlus } from 'lucide-react';
import { useRankingTechnicians } from '@/hooks/useTechnicianRanking';
import { normalizeRankingCity, normalizeTechnicianLogin } from '@/utils/technicianRanking';
import { normalizePersonName } from '@/utils/normalizeName';
import type { RankingTechnician, RankingTechnicianInput } from '@/types/technicianRanking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm';
const EMPTY_FORM: RankingTechnicianInput = { login: '', nome: '', cidade: '', supervisor: '' };

export function TechnicianSupervisors({ refreshKey, onLoadingChange }: { refreshKey: number; onLoadingChange: (loading: boolean) => void }) {
  const hook = useRankingTechnicians(refreshKey);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [editing, setEditing] = useState<RankingTechnician | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const busy = hook.loading || importing || saving;

  useEffect(() => { onLoadingChange(busy); }, [busy, onLoadingChange]);
  useEffect(() => () => onLoadingChange(false), [onLoadingChange]);
  const cities = useMemo(() => [...new Set(hook.rows.map((row) => row.cidade))].sort(), [hook.rows]);
  const supervisors = useMemo(() => [...new Set(hook.rows.map((row) => row.supervisor))].sort(), [hook.rows]);
  const visible = useMemo(() => hook.rows.filter((row) => (!city || row.cidade === city) && (!supervisor || row.supervisor === supervisor)
    && normalizePersonName(`${row.login} ${row.nome} ${row.supervisor}`).includes(normalizePersonName(search))), [city, supervisor, search, hook.rows]);

  const edit = (row: RankingTechnician | null) => {
    setEditing(row); setForm(row ? { login: row.login, nome: row.nome, cidade: row.cidade, supervisor: row.supervisor } : { ...EMPTY_FORM });
    setSaveError(''); setOpen(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setSaveError('');
    try {
      const payload = { login: normalizeTechnicianLogin(form.login), nome: form.nome.trim().replace(/\s+/g, ' '), cidade: normalizeRankingCity(form.cidade), supervisor: form.supervisor.trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR') };
      if (Object.values(payload).some((value) => !value) || /\s/.test(payload.login)) throw new Error('Preencha os quatro campos. O login não pode conter espaços.');
      await hook.save(payload, editing);
      setOpen(false);
      toast({ title: editing ? 'Técnico atualizado' : 'Técnico cadastrado', description: `${payload.nome} · ${payload.supervisor}` });
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar o cadastro.'); }
    finally { setSaving(false); }
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const count = await hook.importFile(file);
      toast({ title: 'Cadastro importado', description: `${count} técnicos processados por login.` });
    } catch (error) { toast({ title: 'Falha ao importar cadastro', description: error instanceof Error ? error.message : 'Arquivo inválido.', variant: 'destructive' }); }
    finally { setImporting(false); if (input.current) input.current.value = ''; }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-950">Técnicos e supervisores</h2><p className="mt-1 text-sm text-slate-500">Ranking técnico do Sistema de Gestão</p></div>
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => void importFile(event.target.files?.[0])} />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()} title="Colunas: Login, Nome, Cidade e Supervisor. Atualiza pelo login e mantém os demais cadastros.">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Importar cadastro
          </Button>
          <Button disabled={busy} onClick={() => edit(null)}><UserPlus className="h-4 w-4" />Adicionar técnico</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative sm:col-span-2 lg:col-span-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar login, nome ou supervisor..." aria-label="Buscar técnicos e supervisores" className="pl-9" /></div>
        <select className={selectClass} value={city} onChange={(event) => setCity(event.target.value)} aria-label="Cidade do cadastro"><option value="">Todas as cidades</option>{cities.map((value) => <option key={value}>{value}</option>)}</select>
        <select className={selectClass} value={supervisor} onChange={(event) => setSupervisor(event.target.value)} aria-label="Supervisor do cadastro"><option value="">Todos os supervisores</option>{supervisors.map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      {hook.error && <p role="alert" className="text-sm text-destructive">{hook.error}</p>}
      {hook.loading ? <div className="flex min-h-40 items-center justify-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Carregando cadastros...</div> : !hook.error && <>
        <p className="text-sm text-slate-500">{visible.length} técnicos</p>
        <Table><TableHeader><TableRow><TableHead>Login</TableHead><TableHead>Nome</TableHead><TableHead>Cidade</TableHead><TableHead>Supervisor</TableHead><TableHead className="w-16" /></TableRow></TableHeader>
          <TableBody>{visible.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.login}</TableCell><TableCell className="min-w-52 font-medium">{row.nome}</TableCell><TableCell>{row.cidade}</TableCell><TableCell>{row.supervisor}</TableCell><TableCell>
            <Button variant="ghost" size="icon" title={`Editar ${row.nome}`} aria-label={`Editar supervisor de ${row.nome}`} onClick={() => edit(row)}><Pencil className="h-4 w-4" /></Button>
          </TableCell></TableRow>)}{!visible.length && <TableRow><TableCell colSpan={5} className="py-10 text-center text-slate-500">Nenhum técnico encontrado.</TableCell></TableRow>}</TableBody>
        </Table>
      </>}
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}><DialogContent className="max-w-lg"><form onSubmit={save} className="space-y-5">
        <DialogHeader><DialogTitle>{editing ? 'Editar técnico e supervisor' : 'Adicionar técnico'}</DialogTitle><DialogDescription>Cadastro do Ranking técnico</DialogDescription></DialogHeader>
        <div className="space-y-1.5"><Label htmlFor="ranking-technician-login">Login</Label><Input id="ranking-technician-login" value={form.login} onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))} readOnly={Boolean(editing)} disabled={saving} required /></div>
        <div className="space-y-1.5"><Label htmlFor="ranking-technician-name">Nome completo</Label><Input id="ranking-technician-name" value={form.nome} onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} disabled={saving} required /></div>
        <div className="space-y-1.5"><Label htmlFor="ranking-technician-city">Cidade</Label><Input id="ranking-technician-city" list="ranking-cities" value={form.cidade} onChange={(event) => setForm((current) => ({ ...current, cidade: event.target.value }))} disabled={saving} required /><datalist id="ranking-cities">{cities.map((value) => <option key={value} value={value} />)}</datalist></div>
        <div className="space-y-1.5"><Label htmlFor="ranking-technician-supervisor">Supervisor</Label><Input id="ranking-technician-supervisor" list="ranking-supervisors" value={form.supervisor} onChange={(event) => setForm((current) => ({ ...current, supervisor: event.target.value }))} disabled={saving} required /><datalist id="ranking-supervisors">{supervisors.map((value) => <option key={value} value={value} />)}</datalist></div>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button></DialogFooter>
      </form></DialogContent></Dialog>
    </section>
  );
}
