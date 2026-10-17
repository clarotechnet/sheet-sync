import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ComissionamentoData } from '@/types/comissionamento';
import { normalizePersonName } from '@/utils/normalizeName';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PAGE_SIZE = 25;
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (value: string | null) => {
  const date = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : '-';
};

export function CommissionReportSalesDialog({ sales, label, period, onClose }: {
  sales: ComissionamentoData[]; label: string; period: string; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const visible = useMemo(() => {
    const query = normalizePersonName(search);
    return sales.filter((row) => normalizePersonName([
      row.contrato, row.nome, row.login_criador, row.alocacao, row.frente,
      row.tipo_venda, row.proposta, formatDate(row.data_exec), row.status,
    ].join(' ')).includes(query)).sort((a, b) => (b.data_exec || '').localeCompare(a.data_exec || '')
      || a.nome.localeCompare(b.nome, 'pt-BR') || (a.contrato || '').localeCompare(b.contrato || ''));
  }, [sales, search]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const pageSales = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return <Dialog open onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-[1600px] flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 pr-6 text-left">
        <DialogTitle>Vendas confirmadas</DialogTitle>
        <DialogDescription className="break-words">{label} · {period} · {sales.length.toLocaleString('pt-BR')} {sales.length === 1 ? 'venda' : 'vendas'}</DialogDescription>
      </DialogHeader>
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar nas vendas..." aria-label="Buscar vendas do detalhamento" className="pl-9" />
      </div>
      <div className="min-h-0 overflow-auto border-y border-slate-200">
        <table className="w-full min-w-[1250px] text-xs">
          <caption className="sr-only">Vendas confirmadas de {label} em {period}, por Data Exec.</caption>
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-slate-600"><tr>
            {['Data Exec.', 'Contrato', 'Técnico', 'Login do criador', 'Cidade / Alocação', 'Frente', 'Tipo de Oferta', 'Proposta / Produto', 'Status', 'Valor'].map((title) => <th key={title} scope="col" className="whitespace-nowrap px-3 py-3 last:text-right">{title}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{pageSales.map((row, index) => <tr key={row.id || row.row_hash || `${currentPage}-${index}`} className="odd:bg-white even:bg-slate-50/60">
            <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatDate(row.data_exec)}</td>
            <td className="whitespace-nowrap px-3 py-3 font-mono">{row.contrato || '-'}</td>
            <td className="min-w-52 max-w-72 break-words px-3 py-3 font-semibold leading-5">{row.nome || '-'}</td>
            <td className="px-3 py-3">{row.login_criador || '-'}</td>
            <td className="min-w-36 max-w-52 break-words px-3 py-3">{row.alocacao || '-'}</td>
            <td className="min-w-32 max-w-48 break-words px-3 py-3">{row.frente || '-'}</td>
            <td className="min-w-32 max-w-48 break-words px-3 py-3">{row.tipo_venda || '-'}</td>
            <td className="min-w-32 max-w-48 break-words px-3 py-3">{row.proposta || '-'}</td>
            <td className="px-3 py-3 font-semibold text-emerald-700">CONFIRMADA</td>
            <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{row.valores == null ? '-' : currency.format(row.valores)}</td>
          </tr>)}</tbody>
        </table>
        {!visible.length && <p className="px-4 py-10 text-center text-sm text-slate-500">Nenhuma venda encontrada.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>{visible.length.toLocaleString('pt-BR')} {visible.length === 1 ? 'venda' : 'vendas'}{search && ` de ${sales.length.toLocaleString('pt-BR')}`} · Página {currentPage + 1} de {pages}</span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Página anterior" aria-label="Página anterior das vendas" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" title="Próxima página" aria-label="Próxima página das vendas" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
