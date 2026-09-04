import { useMemo, useState } from 'react';
import { Link2, Search, UsersRound } from 'lucide-react';
import type { GatilhoRankingItem } from '@/types/gatilhos';
import { getGatilhoTipoLabel } from '@/types/gatilhos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GatilhosVinculosProps {
  ranking: GatilhoRankingItem[];
  onEdit: (item: GatilhoRankingItem) => void;
}

export function GatilhosVinculos({ ranking, onEdit }: GatilhosVinculosProps) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleUpperCase('pt-BR');
    if (!term) return ranking;
    return ranking.filter((item) =>
      `${item.id_externo} ${item.nome_exibicao} ${item.cidade || ''} ${getGatilhoTipoLabel(item.tipo)}`
        .toLocaleUpperCase('pt-BR')
        .includes(term),
    );
  }, [ranking, search]);

  const linked = ranking.filter((item) => item.vinculado).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-950">IDs e equipes</h2>
          <p className="mt-1 text-sm text-slate-500">Associe cada ID do relatório a uma cidade, um tipo e até dois colaboradores.</p>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <UsersRound className="h-4 w-4 text-sky-600" />
          {linked} de {ranking.length} classificados
        </div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ID, colaborador, cidade ou tipo" className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Colaborador(es)</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3 text-right">Pontuação atual</th>
                <th className="w-32 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => (
                <tr key={item.id_externo} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono font-bold text-slate-700">{item.id_externo}</td>
                  <td className="max-w-[360px] px-4 py-3 font-semibold text-slate-900">{item.nomes.join(' / ') || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.cidade || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{getGatilhoTipoLabel(item.tipo)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={item.vinculado ? 'default' : 'outline'} className={item.vinculado ? 'bg-emerald-600 hover:bg-emerald-600' : 'border-amber-300 bg-amber-50 text-amber-800'}>
                      {item.vinculado ? 'Vinculado' : 'Pendente'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-slate-950">{item.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={() => onEdit(item)}>
                      <Link2 /> {item.vinculado ? 'Editar' : 'Vincular'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="py-14 text-center text-sm text-slate-500">Nenhum ID encontrado.</div>}
      </div>
    </div>
  );
}

