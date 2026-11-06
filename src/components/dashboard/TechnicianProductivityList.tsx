import { useMemo, useState } from 'react';
import { Activity, Search, X } from 'lucide-react';
import type { TechnicianProductivity } from '@/types/activity';
import { normalizePersonName } from '@/utils/normalizeName';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TechnicianProductivityList({ technicians }: { technicians: TechnicianProductivity[] }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('productivity');
  const visible = useMemo(() => {
    const term = normalizePersonName(search);
    return technicians.filter((technician) => normalizePersonName(technician.name).includes(term))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR')
        : sort === 'count' ? b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')
          : b.productivity - a.productivity);
  }, [technicians, search, sort]);

  return (
    <section className="space-y-4 border-t border-slate-200 pt-5" aria-labelledby="technician-productivity-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h3 id="technician-productivity-title" className="flex items-center gap-2 text-lg font-bold">
            <Activity className="h-5 w-5 text-accent" />Produtividade técnica
          </h3>
          <span className="text-sm text-muted-foreground">
            {visible.length === technicians.length ? technicians.length : `${visible.length} de ${technicians.length}`} {technicians.length === 1 ? 'técnico' : 'técnicos'}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar técnico..." aria-label="Buscar técnico na produtividade" className="pl-9 pr-10" />
            {search && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-8 w-8" aria-label="Limpar busca de produtividade" title="Limpar busca" onClick={() => setSearch('')}><X className="h-4 w-4" /></Button>}
          </div>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenação da produtividade técnica" className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm sm:w-52">
            <option value="productivity">Maior produtividade</option>
            <option value="name">Nome (A-Z)</option>
            <option value="count">Mais OS</option>
          </select>
        </div>
      </div>

      <div role="region" aria-label="Lista de produtividade técnica" tabIndex={0} className="max-h-[560px] overflow-auto border-y border-slate-200 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <colgroup><col className="w-[34%]" /><col className="w-[17%]" /><col className="w-[17%]" /><col className="w-[32%]" /></colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500">
            <tr><th scope="col" className="px-4 py-3">Técnico</th><th scope="col" className="px-4 py-3 text-right">OS produtivas</th><th scope="col" className="px-4 py-3 text-right">Total de OS</th><th scope="col" className="px-4 py-3">Produtividade</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((technician) => <tr key={technician.name} className="hover:bg-slate-50/70">
              <td className="break-words px-4 py-3 font-medium [overflow-wrap:anywhere]">{technician.name}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{technician.productiveCount.toLocaleString('pt-BR')}</td>
              <td className="px-4 py-3 text-right tabular-nums">{technician.count.toLocaleString('pt-BR')}</td>
              <td className="px-4 py-3">
                <span className="font-semibold tabular-nums">{technician.productivity.toFixed(1)}%</span>
                <div role="progressbar" aria-label={`Produtividade de ${technician.name}`} aria-valuenow={technician.productivity} aria-valuemin={0} aria-valuemax={100} className="mt-1.5 h-2 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-sky-600" style={{ width: `${Math.max(0, Math.min(100, technician.productivity))}%` }} />
                </div>
              </td>
            </tr>)}
            {!visible.length && <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">{technicians.length ? 'Nenhum técnico encontrado para a busca.' : 'Nenhum técnico com atividades nos filtros atuais.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
