import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Download, FileText, Image, Loader2, Search, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { useRankingTechnicians, useTechnicianRankingActivities, useRankingManagementActivities } from '@/hooks/useTechnicianRanking';
import { calculateTechnicianRanking, resolveRankingReturns } from '@/utils/technicianRanking';
import { reconcileRankingActivities } from '@/utils/reconcileRankingActivities';
import { normalizePersonName } from '@/utils/normalizeName';
import { buildTechnicianRankingReport } from '@/utils/technicianRankingReportData';
import type { RankingReportImageDownload } from '@/utils/technicianRankingReportExport';
import type { RankingActivity, RankingTechnicianInput, TechnicianRankingRow, DatabaseRankingActivity, RankedReturn } from '@/types/technicianRanking';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-white px-3 text-sm';
const formatPercent = (value: number | null) => value === null ? '-' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const formatDate = (date: string) => date.split('-').reverse().join('/');
const SORT_LABELS: Record<string, string> = { porcentagem: 'Maior % 409', '409': 'Mais contratos 409', contratos: 'Mais contratos', retornos: 'Mais retornos', nome: 'Nome (A-Z)' };
const todayIso = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).formatToParts(new Date());
  const part = (key: string) => parts.find((value) => value.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

interface PanelProps {
  activities: RankingActivity[];
  technicians: RankingTechnicianInput[];
  managementRecords: DatabaseRankingActivity[];
  startDate: string;
  endDate: string;
  onPeriodChange: (start: string, end: string) => void;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  importing: boolean;
  onImport: (file: File) => Promise<void>;
}

export function TechnicianRankingPanel({ activities, technicians, managementRecords, startDate, endDate, onPeriodChange, loading, error, isAdmin, importing, onImport }: PanelProps) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);
  const [reportImages, setReportImages] = useState<RankingReportImageDownload[]>([]);
  const reportMounted = useRef(true);
  const [sort, setSort] = useState('porcentagem');
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const [returnDetails, setReturnDetails] = useState<{ title: string; nome: string; rows: RankedReturn[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reconciled = useMemo(() => reconcileRankingActivities(activities, managementRecords, technicians), [activities, managementRecords, technicians]);
  const returns = useMemo(() => resolveRankingReturns(reconciled, managementRecords), [reconciled, managementRecords]);
  const ranking = useMemo(() => calculateTechnicianRanking(reconciled, technicians, returns), [reconciled, technicians, returns]);
  const details = ranking.find((row) => row.key === detailsKey) || null;
  const pendingReturns = returns.filter((row) => !row.ofensor && (!city || row.cidade === city));
  const cities = useMemo(() => [...new Set([...ranking.map((row) => row.cidade), ...(city ? [city] : [])])].sort(), [ranking, city]);
  const supervisors = useMemo(() => [...new Set([...ranking.map((row) => row.supervisor), ...(supervisor ? [supervisor] : [])])].sort(), [ranking, supervisor]);
  const visible = useMemo(() => ranking.filter((row) => (!city || row.cidade === city) && (!supervisor || row.supervisor === supervisor)
    && normalizePersonName(`${row.login} ${row.nome} ${row.supervisor}`).includes(normalizePersonName(search))).sort((a, b) => {
    if (sort === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
    const value = (row: TechnicianRankingRow) => sort === 'contratos' ? row.contratos : sort === '409' ? row.contratos409 : sort === 'retornos' ? row.retornosCredenciados : row.porcentagem ?? -1;
    return value(b) - value(a) || b.contratos409 - a.contratos409 || a.nome.localeCompare(b.nome, 'pt-BR');
  }), [ranking, city, supervisor, search, sort]);
  const totals = useMemo(() => visible.reduce((sum, row) => ({ contratos: sum.contratos + row.contratos, code409: sum.code409 + row.contratos409, retornos: sum.retornos + row.retornosCredenciados, atividades: sum.atividades + row.atividades }), { contratos: 0, code409: 0, retornos: 0, atividades: 0 }), [visible]);
  const unmatched = ranking.filter((row) => !row.cadastrado).length;
  const lastImport = activities.reduce<string | null>((last, row) => row.importado_em && (!last || row.importado_em > last) ? row.importado_em : last, null);

  const exportReport = async (format: 'pdf' | 'png') => {
    if (exporting || loading || importing || error || !visible.length) return;
    const report = buildTechnicianRankingReport(visible, { startDate, endDate, city, supervisor, search, sortLabel: SORT_LABELS[sort] }, lastImport);
    setExporting(format);
    try {
      const { downloadTechnicianRankingReport } = await import('@/utils/technicianRankingReportExport');
      const images = await downloadTechnicianRankingReport(report, format);
      if (reportMounted.current) setReportImages(images);
      else setTimeout(() => images.forEach((image) => URL.revokeObjectURL(image.url)), 1000);
    } catch (caught) { toast({ title: 'Falha ao gerar relatório', description: caught instanceof Error ? caught.message : 'Não foi possível exportar o relatório.', variant: 'destructive' }); }
    finally { if (reportMounted.current) setExporting(null); }
  };
  useEffect(() => { reportMounted.current = true; return () => { reportMounted.current = false; }; }, []);
  useEffect(() => () => reportImages.forEach((image) => URL.revokeObjectURL(image.url)), [reportImages]);

  const exportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(visible.map((row) => ({ Login: row.login, Nome: row.nome, Contratos: row.contratos, 'Contratos 409': row.contratos409, '% 409': row.porcentagem === null ? '' : row.porcentagem / 100, 'Retorno credenciados': row.retornosCredenciados, Cidade: row.cidade, Supervisor: row.supervisor })));
    for (let index = 1; index <= visible.length; index++) if (worksheet[`E${index + 1}`]) worksheet[`E${index + 1}`].z = '0.0%';
    worksheet['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 23 }, { wch: 24 }, { wch: 24 }];
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Ranking técnico');
    XLSX.writeFile(workbook, `ranking-tecnico-${startDate}-${endDate}.xlsx`);
  };

  return (
    <section className="space-y-5" aria-label="Ranking técnico">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-slate-950">Ranking técnico</h2><p className="mt-1 text-sm text-slate-500">Contratos por técnico e data</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={loading || importing || Boolean(error) || Boolean(exporting) || !visible.length}><Download className="h-4 w-4" />Exportar Excel</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={loading || importing || Boolean(error) || Boolean(exporting) || !visible.length}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Gerar relatório<ChevronDown className="h-4 w-4" />
          </Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void exportReport('pdf')}><FileText className="mr-2 h-4 w-4" />PDF</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void exportReport('png')}><Image className="mr-2 h-4 w-4" />Imagem PNG</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
          {isAdmin && <><input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImport(file).finally(() => { if (input.current) input.current.value = ''; }); }} />
            <Button onClick={() => input.current?.click()} disabled={loading || importing || Boolean(exporting)} title="Inclui atividades novas e atualiza os mesmos IDs. As outras datas e cidades são preservadas.">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Importar atividades</Button></>}
        </div>
      </div>
      <div className="grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label htmlFor="technical-ranking-start">Data inicial</Label><Input id="technical-ranking-start" type="date" value={startDate} max={endDate || undefined} disabled={importing} onChange={(event) => onPeriodChange(event.target.value, endDate)} /></div>
        <div className="space-y-1.5"><Label htmlFor="technical-ranking-end">Data final</Label><Input id="technical-ranking-end" type="date" value={endDate} min={startDate || undefined} disabled={importing} onChange={(event) => onPeriodChange(startDate, event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="technical-ranking-city">Cidade</Label><select id="technical-ranking-city" className={selectClass} value={city} onChange={(event) => setCity(event.target.value)}><option value="">Todas as cidades</option>{cities.map((value) => <option key={value}>{value}</option>)}</select></div>
        <div className="space-y-1.5"><Label htmlFor="technical-ranking-supervisor">Supervisor</Label><select id="technical-ranking-supervisor" className={selectClass} value={supervisor} onChange={(event) => setSupervisor(event.target.value)}><option value="">Todos os supervisores</option>{supervisors.map((value) => <option key={value}>{value}</option>)}</select></div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar login ou nome..." aria-label="Buscar técnico no ranking" className="pl-9" /></div>
        <select className={cn(selectClass, 'sm:w-52')} value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenação do ranking"><option value="porcentagem">Maior % 409</option><option value="409">Mais contratos 409</option><option value="contratos">Mais contratos</option><option value="retornos">Mais retornos</option><option value="nome">Nome (A-Z)</option></select>
      </div>
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-5 lg:grid-cols-4">
        {[['Contratos', totals.contratos], ['Contratos 409', totals.code409], ['% 409', formatPercent(totals.contratos ? totals.code409 / totals.contratos * 100 : null)], ['Retorno credenciados', totals.retornos]].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{loading || error ? '-' : value}</p></div>)}
      </div>
      {unmatched > 0 && !loading && !error && <p className="text-sm text-amber-700">{unmatched} {unmatched === 1 ? 'técnico não possui cadastro de supervisor' : 'técnicos não possuem cadastro de supervisor'}. {isAdmin && <a href="/admin?tab=supervisors" className="font-semibold underline">Técnicos e supervisores em Configurações</a>}</p>}
      {pendingReturns.length > 0 && !loading && !error && <Button variant="outline" className="h-auto max-w-full justify-start whitespace-normal border-amber-200 text-left text-amber-800" onClick={() => setReturnDetails({ title: 'Retornos sem atribuição', nome: 'Sem ofensor identificado no resultado do trigger', rows: pendingReturns })}><AlertTriangle className="h-4 w-4 shrink-0" />{pendingReturns.length} {pendingReturns.length === 1 ? 'retorno sem atribuição no histórico' : 'retornos sem atribuição no histórico'}</Button>}
      {loading ? <div className="flex min-h-52 items-center justify-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Carregando ranking...</div> : !error && <>
        <div className="overflow-x-auto border-t-2 border-[#e31325] bg-white">
          <table className="w-full min-w-[1150px] text-sm"><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>
            <th className="w-10 px-3 py-3">#</th><th className="px-3 py-3">Login</th><th className="px-3 py-3">Nome</th>
            <th className="px-3 py-3 text-right" title="Contrato contado uma vez por técnico e data">Contratos</th>
            <th className="px-3 py-3 text-right" title="Código 409 em qualquer tarefa do contrato">Contratos 409</th>
            <th className="w-40 px-3 py-3" title="Contratos 409 divididos por contratos, multiplicado por 100">% 409</th>
            <th className="px-3 py-3 text-right" title="Ofensor calculado pelo trigger de Retorno Credenciada. Não inclui revisita de Visita Técnica.">Retorno credenciados</th><th className="px-3 py-3">Cidade</th><th className="px-3 py-3">Supervisor</th>
          </tr></thead><tbody className="divide-y divide-slate-100">{visible.map((row, index) => <tr key={row.key} className="hover:bg-slate-50/70">
            <td className="px-3 py-3 text-slate-400">{index + 1}</td><td className="px-3 py-3 font-mono text-xs">{row.login}</td><td className="min-w-64 max-w-96 break-words px-3 py-3 text-xs font-semibold leading-5 text-slate-900">{row.nome}</td>
            <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" className="h-8 px-2 font-bold text-sky-700" title={`Ver contratos de ${row.nome}`} aria-label={`Ver contratos de ${row.nome}`} onClick={() => setDetailsKey(row.key)}>{row.contratos}</Button></td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.contratos409}</td>
            <td className={cn('px-3 py-3 tabular-nums', row.porcentagem === null ? 'text-slate-400' : row.porcentagem >= 80 ? 'bg-emerald-50 text-emerald-800' : row.porcentagem >= 50 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700')}>
              <p className="font-bold">{formatPercent(row.porcentagem)}</p><div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/5"><div className="h-full bg-current" style={{ width: `${row.porcentagem || 0}%` }} /></div>
            </td><td className="px-3 py-2 text-right tabular-nums">{row.retornosCredenciados > 0 ? <Button variant="ghost" size="sm" className="h-8 px-2 font-bold text-amber-800" title={`Ver retornos atribuídos a ${row.nome}`} aria-label={`Ver retornos atribuídos a ${row.nome}`} onClick={() => setReturnDetails({ title: 'Retornos atribuídos ao técnico', nome: row.nome, rows: row.retornosDetalhes })}>{row.retornosCredenciados}</Button> : 0}</td><td className="px-3 py-3 text-xs text-slate-600">{row.cidade}</td><td className={cn('px-3 py-3 text-xs font-semibold', row.cadastrado ? 'text-slate-700' : 'text-amber-700')}>{row.supervisor}</td>
          </tr>)}</tbody></table>
          {!visible.length && <p className="px-4 py-12 text-center text-sm text-slate-500">Nenhum contrato ou retorno encontrado no período e filtros selecionados.</p>}
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{visible.length} técnicos · {totals.atividades} atividades com contrato{totals.atividades > totals.contratos ? ` · ${totals.atividades - totals.contratos} repetições agrupadas` : ''}</span>
          {lastImport && <span>Última importação: {new Date(lastImport).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>}
        </div>
      </>}
      <Dialog open={Boolean(details)} onOpenChange={(open) => !open && setDetailsKey(null)}><DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Contratos do técnico</DialogTitle><DialogDescription>{details?.login} · {details?.nome}</DialogDescription></DialogHeader>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-3">Data</th><th className="px-3 py-3">Contrato</th><th className="px-3 py-3">409</th><th className="px-3 py-3">Atendeu retorno</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Códigos de baixa</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{details?.detalhes.map((row) => <tr key={`${row.data}|${row.contrato}`}><td className="whitespace-nowrap px-3 py-3">{formatDate(row.data)}</td><td className="px-3 py-3 font-mono">{row.contrato}</td><td className="px-3 py-3">{row.codigo409 ? 'Sim' : 'Não'}</td><td className="px-3 py-3">{row.retornoCredenciada ? 'Sim' : 'Não'}</td><td className="px-3 py-3">{row.statuses.join(', ')}</td><td className="max-w-72 px-3 py-3 leading-5">{row.codigos.join(' · ') || '-'}</td></tr>)}</tbody></table></div>
      </DialogContent></Dialog>
      <Dialog open={reportImages.length > 0} onOpenChange={(open) => !open && setReportImages([])}><DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Imagens do relatório</DialogTitle><DialogDescription>{reportImages.length} {reportImages.length === 1 ? 'supervisor' : 'supervisores'}</DialogDescription></DialogHeader>
        <ul className="divide-y divide-slate-200">{reportImages.map((image) => <li key={image.filename} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{image.supervisor}</p><p className="mt-1 break-all text-xs text-slate-500">{image.filename}</p></div>
          <Button variant="outline" size="icon" asChild><a href={image.url} download={image.filename} title={`Baixar imagem de ${image.supervisor}`} aria-label={`Baixar imagem de ${image.supervisor}`}><Download className="h-4 w-4" /></a></Button>
        </li>)}</ul>
      </DialogContent></Dialog>
      <Dialog open={Boolean(returnDetails)} onOpenChange={(open) => !open && setReturnDetails(null)}><DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>{returnDetails?.title}</DialogTitle><DialogDescription>{returnDetails?.nome}</DialogDescription></DialogHeader>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-3">Data do retorno</th><th className="px-3 py-3">Contrato</th><th className="px-3 py-3">Técnico ofensor</th><th className="px-3 py-3">Atendente do retorno</th><th className="px-3 py-3">Status / Pendência</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{returnDetails?.rows.map((row) => <tr key={`${row.data}|${row.contrato}|${row.cidade}`}><td className="whitespace-nowrap px-3 py-3">{formatDate(row.data)}</td><td className="px-3 py-3 font-mono">{row.contrato}</td><td className="px-3 py-3 font-semibold">{row.ofensor || 'Não atribuído'}</td><td className="px-3 py-3">{row.atendentes.join(' / ')}</td><td className="px-3 py-3"><p>{row.statuses.join(', ')}</p>{row.pendencia && <p className="mt-1 text-amber-700">{row.pendencia}</p>}</td></tr>)}</tbody></table></div>
      </DialogContent></Dialog>
    </section>
  );
}

export function TechnicianRanking({ refreshKey, onLoadingChange }: { refreshKey: number; onLoadingChange: (loading: boolean) => void }) {
  const { isAdmin } = useAuth();
  const [period, setPeriod] = useState(() => ({ start: todayIso(), end: todayIso() }));
  const [importing, setImporting] = useState(false);
  const registry = useRankingTechnicians(refreshKey);
  const source = useTechnicianRankingActivities(period.start, period.end, refreshKey);
  const management = useRankingManagementActivities(period.start, period.end, refreshKey);
  const loading = registry.loading || source.loading || management.loading;
  useEffect(() => { onLoadingChange(loading || importing); }, [loading, importing, onLoadingChange]);
  useEffect(() => () => onLoadingChange(false), [onLoadingChange]);
  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const result = await source.importFile(file);
      setPeriod({ start: result.startDate, end: result.endDate });
      toast({ title: 'Atividades do ranking importadas', description: `${result.count} IDs processados. Dados de outros períodos e cidades preservados.` });
    } catch (error) { toast({ title: 'Falha ao importar atividades', description: error instanceof Error ? error.message : 'Não foi possível processar o arquivo.', variant: 'destructive' }); }
    finally { setImporting(false); }
  };
  return <TechnicianRankingPanel activities={source.rows} technicians={registry.rows} managementRecords={management.rows} startDate={period.start} endDate={period.end} onPeriodChange={(start, end) => setPeriod({ start, end })} loading={loading} error={registry.error || source.error || management.error} isAdmin={isAdmin} importing={importing} onImport={importFile} />;
}
