import { useMemo, useState } from 'react';
import { BadgeCheck, CircleDollarSign, Link2, MapPin, Search, Trophy, UsersRound } from 'lucide-react';
import type { GatilhoRankingItem, GatilhoTipo } from '@/types/gatilhos';
import { GATILHO_CIDADES, GATILHO_TIPOS, getGatilhoTipoLabel } from '@/types/gatilhos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface GatilhosRankingProps {
  ranking: GatilhoRankingItem[];
  onEditVinculo: (item: GatilhoRankingItem) => void;
}

const formatPoints = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function GatilhosRanking({ ranking, onEditVinculo }: GatilhosRankingProps) {
  const [tipo, setTipo] = useState<'TODOS' | GatilhoTipo>('TODOS');
  const [cidade, setCidade] = useState('TODAS');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleUpperCase('pt-BR');
    return ranking.filter((item) => {
      if (tipo !== 'TODOS' && item.tipo !== tipo) return false;
      if (cidade !== 'TODAS' && item.cidade !== cidade) return false;
      if (term && !`${item.nome_exibicao} ${item.id_externo}`.toLocaleUpperCase('pt-BR').includes(term)) return false;
      return true;
    });
  }, [cidade, ranking, search, tipo]);

  const totals = useMemo(() => ({
    pontos: filtered.reduce((sum, item) => sum + item.valor, 0),
    premio: filtered.reduce((sum, item) => sum + item.premio, 0),
    vinculados: filtered.filter((item) => item.vinculado).length,
    atingiram: filtered.filter((item) => item.faixa_atual).length,
  }), [filtered]);

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white p-1 shadow-sm">
        <div className="grid min-w-[690px] grid-cols-5 gap-1">
          <button
            type="button"
            onClick={() => setTipo('TODOS')}
            className={cn('h-11 rounded-md px-3 text-sm font-bold transition-colors', tipo === 'TODOS' ? 'bg-[#e31325] text-white' : 'text-slate-600 hover:bg-slate-100')}
          >
            Todos
          </button>
          {GATILHO_TIPOS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTipo(item.value)}
              className={cn('h-11 rounded-md px-3 text-sm font-bold transition-colors', tipo === item.value ? 'bg-[#e31325] text-white' : 'text-slate-600 hover:bg-slate-100')}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome ou ID" className="pl-9" />
        </div>
        <Select value={cidade} onValueChange={setCidade}>
          <SelectTrigger className="w-full sm:w-64"><MapPin className="h-4 w-4" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas as cidades</SelectItem>
            {GATILHO_CIDADES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Pontos</span><Trophy className="h-4 w-4 text-amber-500" /></div>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">{formatPoints(totals.pontos)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Premiação</span><CircleDollarSign className="h-4 w-4 text-emerald-600" /></div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">{formatMoney(totals.premio)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Vinculados</span><UsersRound className="h-4 w-4 text-sky-600" /></div>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">{totals.vinculados}<span className="text-sm text-slate-400">/{filtered.length}</span></p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">No gatilho</span><BadgeCheck className="h-4 w-4 text-violet-600" /></div>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">{totals.atingiram}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1260px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Equipe / colaborador</th>
                <th className="px-4 py-3">Cidade</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-right">Pontuação</th>
                <th className="px-4 py-3">Composição</th>
                <th className="px-4 py-3">Progresso</th>
                <th className="px-4 py-3">Gatilho</th>
                <th className="px-4 py-3 text-right">Premiação</th>
                <th className="w-28 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item, index) => {
                const target = item.proxima_faixa?.pontos || item.faixa_atual?.pontos || 0;
                const progress = target > 0 ? Math.min(100, (item.valor / target) * 100) : 0;
                return (
                  <tr key={item.id_externo} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-bold text-slate-400">{index + 1}</td>
                    <td className="max-w-[340px] px-4 py-3">
                      <p className={cn('font-bold', item.vinculado ? 'text-slate-950' : 'text-amber-700')}>{item.nome_exibicao}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">ID {item.id_externo}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.cidade || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{getGatilhoTipoLabel(item.tipo)}</td>
                    <td className="px-4 py-3 text-right text-base font-extrabold text-slate-950">{formatPoints(item.valor)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      <p><span className="font-semibold text-slate-700">Inst.</span> {formatMoney(item.valor_instalador)}</p>
                      <p><span className="font-semibold text-slate-700">Aux.</span> {formatMoney(item.valor_auxiliar)}</p>
                      <p><span className="font-semibold text-slate-700">Desl.</span> {formatMoney(item.valor_deslocamento)}</p>
                    </td>
                    <td className="w-44 px-4 py-3">
                      {target > 0 ? (
                        <div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${progress}%` }} /></div>
                          <p className="mt-1 text-[11px] text-slate-500">{item.proxima_faixa ? `Faltam ${formatPoints(Math.max(0, item.proxima_faixa.pontos - item.valor))}` : 'Faixa máxima'}</p>
                        </div>
                      ) : <span className="text-xs text-slate-400">Classifique o ID</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{item.faixa_atual ? `${item.faixa_atual.nivel}º gatilho` : '-'}</td>
                    <td className="px-4 py-3 text-right font-extrabold text-emerald-700">{formatMoney(item.premio)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => onEditVinculo(item)}>
                        <Link2 /> {item.vinculado ? 'Editar' : 'Vincular'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="py-14 text-center text-sm text-slate-500">Nenhum resultado encontrado.</div>}
      </div>
    </div>
  );
}
