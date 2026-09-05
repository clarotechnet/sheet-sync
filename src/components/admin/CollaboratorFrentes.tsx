import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Save, Search } from 'lucide-react';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { TecnicoFrente } from '@/types/comissionamento';
import { normalizePersonName } from '@/utils/normalizeName';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';

type FrenteRow = TecnicoFrente & { id: string };

const selectClassName = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';

export function CollaboratorFrentes({ refreshKey, onLoadingChange }: {
  refreshKey: number;
  onLoadingChange: (loading: boolean) => void;
}) {
  const [rows, setRows] = useState<FrenteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [front, setFront] = useState('');
  const [editing, setEditing] = useState<FrenteRow | null>(null);
  const [selectedFront, setSelectedFront] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      onLoadingChange(true);
      setLoadError('');
      try {
        const result: FrenteRow[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await externalSupabase.from('tecnicos_frentes')
            .select('id, nome, cidade, frente').order('nome').order('id')
            .range(offset, offset + 999);
          if (error) throw error;
          result.push(...(data || []) as FrenteRow[]);
          if (!data || data.length < 1000) break;
        }
        if (active) setRows(result);
      } catch {
        if (active) setLoadError('Não foi possível carregar as frentes. Tente atualizar novamente.');
      } finally {
        if (active) {
          setLoading(false);
          onLoadingChange(false);
        }
      }
    };
    void load();
    return () => { active = false; onLoadingChange(false); };
  }, [refreshKey, onLoadingChange]);

  const fronts = useMemo(() => [...new Set(rows.map(row => row.frente).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const cities = useMemo(() => [...new Set(rows.map(row => row.cidade).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')), [rows]);
  const visibleRows = useMemo(() => rows.filter(row =>
    (!search || normalizePersonName(row.nome).includes(normalizePersonName(search)))
    && (!city || row.cidade === city) && (!front || row.frente === front)
  ), [rows, search, city, front]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !selectedFront || saving || selectedFront === editing.frente) return;
    setSaving(true);
    setSaveError('');
    try {
      const { data, error } = await externalSupabase.from('tecnicos_frentes')
        .update({ frente: selectedFront })
        .eq('id', editing.id).eq('frente', editing.frente)
        .select('id, nome, cidade, frente').single();
      if (error) {
        if (error.code === 'PGRST116') {
          throw new Error('O cadastro mudou ou a edição não foi autorizada. Feche esta janela, atualize a lista e tente novamente.');
        }
        throw new Error(error.message || 'Não foi possível salvar a frente.');
      }
      setRows(current => current.map(row => row.id === editing.id ? data as FrenteRow : row));
      setEditing(null);
      toast({ title: 'Frente atualizada', description: `${data.nome}: ${data.frente}.` });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar a frente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Frentes dos colaboradores</h2>
        <p className="mt-1 text-sm text-muted-foreground">Comissionamento Técnico</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Buscar colaborador nas frentes" placeholder="Buscar colaborador..." value={search}
            onChange={event => setSearch(event.target.value)} className="h-10 pl-9" />
        </div>
        <select aria-label="Filtrar cidade" className={selectClassName} value={city} onChange={event => setCity(event.target.value)}>
          <option value="">Todas as cidades</option>
          {cities.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Filtrar frente" className={selectClassName} value={front} onChange={event => setFront(event.target.value)}>
          <option value="">Todas as frentes</option>
          {fronts.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
      {loading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando frentes...
        </div>
      ) : !loadError && (
        <>
          <p className="text-sm text-muted-foreground">{visibleRows.length} colaboradores</p>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Colaborador</TableHead><TableHead>Cidade</TableHead>
              <TableHead>Frente atual</TableHead><TableHead className="w-16 text-right">Ação</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visibleRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum colaborador encontrado.</TableCell></TableRow>}
              {visibleRows.map(row => <TableRow key={row.id}>
                <TableCell className="min-w-48 font-medium">{row.nome}</TableCell>
                <TableCell>{row.cidade || '-'}</TableCell><TableCell>{row.frente}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title={`Editar frente de ${row.nome}`} aria-label={`Editar frente de ${row.nome}`}
                    onClick={() => { setEditing(row); setSelectedFront(row.frente); setSaveError(''); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !saving) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <form onSubmit={save} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Editar frente</DialogTitle>
              <DialogDescription className="break-words">{editing?.nome}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">{editing?.cidade || 'Cidade não informada'}</p>
            <div className="space-y-2">
              <Label htmlFor="collaborator-front">Frente</Label>
              <select id="collaborator-front" className={selectClassName} value={selectedFront}
                onChange={event => setSelectedFront(event.target.value)} disabled={saving} required>
                {fronts.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={saving || !selectedFront || selectedFront === editing?.frente}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
