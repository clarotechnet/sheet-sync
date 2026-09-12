import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CircleDollarSign, Download, MapPin, RefreshCw, Search, UsersRound } from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { useGatilhos } from '@/hooks/useGatilhos';
import { normalizePersonName } from '@/utils/normalizeName';
import { getGatilhoTipoLabel } from '@/types/gatilhos';
import type { GatilhoTipo, GatilhoVinculo } from '@/types/gatilhos';

interface ComissionamentoPremiacao {
  nome: string;
  valores: number | null;
  data_exec: string | null;
  contrato: string | null;
  proposta: string | null;
  status: string | null;
}

interface PremiacaoLinha {
  key: string;
  nome: string;
  cpf: string;
  setor: string;
  cidades: string[];
  tipos: GatilhoTipo[];
  papeis: string[];
  idsGatilho: string[];
  valorInstalador: number;
  valorAuxiliar: number;
  valorDeslocamento: number;
  premioGatilho: number;
  comissionamento: number;
  qtdComissionamento: number;
  total: number;
}

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDatePtBr = (value: string | null | undefined) => {
  if (!value) return '-';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

const formatMoney = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
export default function Premiacao() {
  const gatilhos = useGatilhos();
  const [inicio, setInicio] = useState(formatDateInput(monthStart));
  const [fim, setFim] = useState(formatDateInput(today));
  const [cidade, setCidade] = useState('TODAS');
  const [search, setSearch] = useState('');
  const [comissionamento, setComissionamento] = useState<ComissionamentoPremiacao[]>([]);
  const [loadingComissionamento, setLoadingComissionamento] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComissionamento = useCallback(async () => {
    setLoadingComissionamento(true);
    setError(null);
    try {
      let rows: ComissionamentoPremiacao[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error: queryError } = await externalSupabase
          .from('comissionamento')
          .select('nome, valores, data_exec, contrato, proposta, status')
          .eq('status', 'CONFIRMADA')
          .gte('data_exec', inicio)
          .lte('data_exec', fim)
          .order('data_exec', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (queryError) throw queryError;
        const pageRows = (data || []) as ComissionamentoPremiacao[];
        rows = [...rows, ...pageRows];
        hasMore = pageRows.length === pageSize;
        page += 1;
      }

      setComissionamento(rows);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o comissionamento.');
    } finally {
      setLoadingComissionamento(false);
    }
  }, [fim, inicio]);

  const refresh = useCallback(async () => {
    await Promise.all([gatilhos.fetchData(), fetchComissionamento()]);
  }, [fetchComissionamento, gatilhos.fetchData]);

  useEffect(() => {
    gatilhos.fetchData();
  }, [gatilhos.fetchData]);

  useEffect(() => {
    if (!inicio || !fim || fim < inicio) return;
    fetchComissionamento();
  }, [fetchComissionamento, fim, inicio]);

  const periodoGatilho = useMemo(() => {
    const first = gatilhos.resultados[0];
    if (!first) return null;
    return `${formatDatePtBr(first.periodo_inicio)} até ${formatDatePtBr(first.periodo_fim)}`;
  }, [gatilhos.resultados]);
  const linhas = useMemo<PremiacaoLinha[]>(() => {
    const colaboradoresByName = new Map(
      gatilhos.colaboradores.map((colaborador) => [normalizePersonName(colaborador.nome), colaborador]),
    );
    const tecnicosByName = new Map(
      gatilhos.tecnicosFrente.map((tecnico) => [normalizePersonName(tecnico.nome), tecnico]),
    );
    const comissaoByName = new Map<string, { nome: string; valor: number; quantidade: number }>();

    comissionamento.forEach((row) => {
      const key = normalizePersonName(row.nome);
      if (!key) return;
      const current = comissaoByName.get(key) || { nome: row.nome, valor: 0, quantidade: 0 };
      current.valor += Number(row.valores) || 0;
      current.quantidade += 1;
      comissaoByName.set(key, current);
    });

    const vinculosPorId = new Map<string, GatilhoVinculo[]>();
    gatilhos.vinculos.forEach((vinculo) => {
      const current = vinculosPorId.get(vinculo.id_externo) || [];
      current.push(vinculo);
      vinculosPorId.set(vinculo.id_externo, current);
    });

    const result = new Map<string, PremiacaoLinha>();

    const ensure = (nome: string, colaboradorId?: string) => {
      const normalizedName = normalizePersonName(nome);
      const cadastro = gatilhos.colaboradores.find((item) => item.id === colaboradorId)
        || colaboradoresByName.get(normalizedName);
      const tecnico = tecnicosByName.get(normalizePersonName(cadastro?.nome || nome));
      const key = cadastro?.id || `nome:${normalizedName}`;
      if (!result.has(key)) {
        result.set(key, {
          key,
          nome: cadastro?.nome || nome,
          cpf: cadastro?.cpf || '',
          setor: cadastro?.setor || '',
          cidades: tecnico?.cidade ? [tecnico.cidade] : [],
          tipos: [],
          papeis: [],
          idsGatilho: [],
          valorInstalador: 0,
          valorAuxiliar: 0,
          valorDeslocamento: 0,
          premioGatilho: 0,
          comissionamento: 0,
          qtdComissionamento: 0,
          total: 0,
        });
      }
      return result.get(key)!;
    };

    gatilhos.ranking.forEach((item) => {
      const membros = (vinculosPorId.get(item.id_externo) || [])
        .sort((a, b) => (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1));

      membros.forEach((vinculo) => {
        const linha = ensure(vinculo.colaborador.nome, vinculo.colaborador_id);
        const dupla = item.tipo === 'DUPLA';
        if (dupla) {
          if (vinculo.papel === 'INSTALADOR') {
            linha.valorInstalador += item.valor_instalador;
            linha.valorDeslocamento += item.valor_deslocamento;
          } else {
            linha.valorAuxiliar += item.valor_auxiliar;
          }
        } else {
          linha.valorInstalador += item.valor_instalador;
          linha.valorAuxiliar += item.valor_auxiliar;
          linha.valorDeslocamento += item.valor_deslocamento;
        }

        // O prêmio da faixa é pessoal para cada membro vinculado à equipe.
        linha.premioGatilho += item.premio;
        linha.cidades = unique([...linha.cidades, item.cidade || vinculo.cidade || '-']);
        linha.tipos = unique([...linha.tipos, ...(item.tipo ? [item.tipo] : [])]);
        linha.papeis = unique([...linha.papeis, vinculo.papel]);
        linha.idsGatilho = unique([...linha.idsGatilho, item.id_externo]);
      });
    });

    comissaoByName.forEach((comissao, normalizedName) => {
      const cadastro = colaboradoresByName.get(normalizedName);
      const linha = ensure(cadastro?.nome || comissao.nome, cadastro?.id);
      linha.comissionamento += comissao.valor;
      linha.qtdComissionamento += comissao.quantidade;
    });

    return Array.from(result.values())
      .map((linha) => ({
        ...linha,
        total: linha.valorInstalador
          + linha.valorAuxiliar
          + linha.valorDeslocamento
          + linha.premioGatilho
          + linha.comissionamento,
      }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [comissionamento, gatilhos.colaboradores, gatilhos.ranking, gatilhos.tecnicosFrente, gatilhos.vinculos]);

  const cidadesDisponiveis = useMemo(
    () => unique(linhas.flatMap((linha) => linha.cidades).filter((item) => item && item !== '-')).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [linhas],
  );

  const filtered = useMemo(() => {
    const term = normalizePersonName(search);
    return linhas.filter((linha) => {
      if (cidade !== 'TODAS' && !linha.cidades.includes(cidade)) return false;
      if (!term) return true;
      return normalizePersonName(`${linha.nome} ${linha.cpf} ${linha.setor} ${linha.cidades.join(' ')}`).includes(term);
    });
  }, [cidade, linhas, search]);

  const totals = useMemo(() => ({
    pessoas: filtered.length,
    gatilhoBase: filtered.reduce(
      (sum, linha) => sum + linha.valorInstalador + linha.valorAuxiliar + linha.valorDeslocamento,
      0,
    ),
    premioGatilho: filtered.reduce((sum, linha) => sum + linha.premioGatilho, 0),
    comissionamento: filtered.reduce((sum, linha) => sum + linha.comissionamento, 0),
    total: filtered.reduce((sum, linha) => sum + linha.total, 0),
  }), [filtered]);

  const exportExcel = useCallback(() => {
    const resumo = filtered.map((linha) => ({
      Nome: linha.nome,
      CPF: linha.cpf,
      Setor: linha.setor,
      Cidade: linha.cidades.join(' / '),
      Tipo: linha.tipos.map(getGatilhoTipoLabel).join(' / '),
      Papel: linha.papeis.join(' / '),
      'ID Gatilho': linha.idsGatilho.join(' / '),
      'Inst.': linha.valorInstalador,
      'Aux.': linha.valorAuxiliar,
      'Desl.': linha.valorDeslocamento,
      'Prêmio Gatilho': linha.premioGatilho,
      'Comissionamento Confirmado': linha.comissionamento,
      'Qtd. Comissionamento': linha.qtdComissionamento,
      Total: linha.total,
    }));
    const nomesFiltrados = new Set(filtered.map((linha) => normalizePersonName(linha.nome)));
    const detalhes = comissionamento
      .filter((row) => nomesFiltrados.has(normalizePersonName(row.nome)))
      .map((row) => ({
        Nome: row.nome,
        'Data Exec.': formatDatePtBr(row.data_exec),
        Status: row.status || '',
        Contrato: row.contrato || '',
        Proposta: row.proposta || '',
        Valor: Number(row.valores) || 0,
      }));

    const wb = XLSX.utils.book_new();
    const wsResumo = XLSX.utils.json_to_sheet(resumo);
    const wsDetalhes = XLSX.utils.json_to_sheet(detalhes);
    wsResumo['!cols'] = [
      { wch: 40 }, { wch: 15 }, { wch: 36 }, { wch: 22 }, { wch: 20 }, { wch: 16 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 16 },
    ];
    wsDetalhes['!cols'] = [
      { wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
    ];

    for (let row = 2; row <= resumo.length + 1; row += 1) {
      for (const column of ['H', 'I', 'J', 'K', 'L', 'N']) {
        const cell = wsResumo[`${column}${row}`];
        if (cell) cell.z = 'R$ #,##0.00';
      }
    }
    for (let row = 2; row <= detalhes.length + 1; row += 1) {
      const cell = wsDetalhes[`F${row}`];
      if (cell) cell.z = 'R$ #,##0.00';
    }
    XLSX.utils.book_append_sheet(wb, wsResumo, 'Premiação');
    XLSX.utils.book_append_sheet(wb, wsDetalhes, 'Comissionamento');
    XLSX.writeFile(wb, `premiacao_${inicio}_${fim}.xlsx`);
  }, [comissionamento, filtered, fim, inicio]);

  const isLoading = gatilhos.isLoading || loadingComissionamento;
  const invalidPeriod = Boolean(inicio && fim && fim < inicio);

  return (
    <AppShell>
      <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1750px] space-y-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">Premiação</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Consolidação de gatilhos e comissionamento confirmado pela Data Exec.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={refresh} disabled={isLoading || invalidPeriod}>
                <RefreshCw className={isLoading ? 'animate-spin' : ''} /> Atualizar
              </Button>
              <Button type="button" onClick={exportExcel} disabled={filtered.length === 0 || invalidPeriod} className="bg-[#e31325] hover:bg-[#c81020]">
                <Download /> Exportar relatório
              </Button>
            </div>
          </header>
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr_auto] lg:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="premiacao-inicio">Data Exec. inicial</Label>
                <Input id="premiacao-inicio" type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="premiacao-fim">Data Exec. final</Label>
                <Input id="premiacao-fim" type="date" value={fim} onChange={(event) => setFim(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Select value={cidade} onValueChange={setCidade}>
                  <SelectTrigger>
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODAS">Todas as cidades</SelectItem>
                    {cidadesDisponiveis.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="premiacao-busca">Colaborador</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="premiacao-busca"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nome, CPF, setor ou cidade"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="pb-2 text-sm font-semibold text-slate-500">
                {periodoGatilho ? `Gatilhos: ${periodoGatilho}` : 'Sem período de gatilho carregado'}
              </div>
            </div>
            {invalidPeriod && <p className="mt-3 text-sm font-semibold text-red-700">A data final deve ser igual ou posterior à data inicial.</p>}
          </section>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Colaboradores</span><UsersRound className="h-4 w-4 text-sky-600" /></div>
              <p className="mt-2 text-2xl font-extrabold text-slate-950">{totals.pessoas}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Composição gatilho</span><CircleDollarSign className="h-4 w-4 text-violet-600" /></div>
              <p className="mt-2 text-2xl font-extrabold text-slate-950">{formatMoney(totals.gatilhoBase)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Prêmio gatilho</span><CircleDollarSign className="h-4 w-4 text-amber-600" /></div>
              <p className="mt-2 text-2xl font-extrabold text-amber-700">{formatMoney(totals.premioGatilho)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold uppercase">Comissionamento</span><CalendarDays className="h-4 w-4 text-emerald-600" /></div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">{formatMoney(totals.comissionamento)}</p>
            </div>
            <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm xl:col-span-1">
              <div className="text-xs font-bold uppercase text-emerald-700">Total a pagar</div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-800">{formatMoney(totals.total)}</p>
            </div>
          </div>
          {(error || gatilhos.error) && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {error || gatilhos.error}
            </div>
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="font-extrabold text-slate-950">Relatório de premiação por colaborador</h2>
              <p className="mt-1 text-xs text-slate-500">
                Comissionamento: somente CONFIRMADA com Data Exec. dentro do período selecionado.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1450px] text-sm">
                <thead className="bg-white text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">Setor</th>
                    <th className="px-4 py-3">Equipe</th>
                    <th className="px-4 py-3 text-right">Inst.</th>
                    <th className="px-4 py-3 text-right">Aux.</th>
                    <th className="px-4 py-3 text-right">Desl.</th>
                    <th className="px-4 py-3 text-right">Prêmio gatilho</th>
                    <th className="px-4 py-3 text-right">Comissionamento</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((linha) => (
                    <tr key={linha.key} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-950">{linha.nome}</p>
                        <p className="mt-0.5 text-xs text-slate-500">CPF: {linha.cpf || 'não cadastrado'}</p>
                      </td>
                      <td className="max-w-[280px] px-4 py-3 text-slate-600">{linha.setor || '-'}</td>
                      <td className="max-w-[300px] px-4 py-3 text-slate-600">
                        <p>{linha.cidades.join(' / ') || '-'}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {linha.tipos.map(getGatilhoTipoLabel).join(' / ') || 'Sem gatilho'}
                          {linha.papeis.length > 0 ? ` • ${linha.papeis.join(' / ')}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(linha.valorInstalador)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(linha.valorAuxiliar)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">{formatMoney(linha.valorDeslocamento)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{formatMoney(linha.premioGatilho)}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-emerald-700">{formatMoney(linha.comissionamento)}</p>
                        <p className="text-[11px] text-slate-400">{linha.qtdComissionamento} registro(s)</p>
                      </td>
                      <td className="px-4 py-3 text-right text-base font-extrabold text-emerald-800">{formatMoney(linha.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="py-14 text-center text-sm text-slate-500">
                Nenhum colaborador encontrado para os filtros atuais.
              </div>
            )}
          </section>

          <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900">
            <strong>Regra aplicada:</strong> individual recebe Inst. + Aux. + Desl. + prêmio do gatilho. Em dupla,
            o instalador recebe Inst. + Desl. e o auxiliar recebe Aux.; o prêmio do gatilho é somado a cada membro
            vinculado. O valor do Comissionamento só entra quando o status é CONFIRMADA e a Data Exec. está no período.
          </div>
        </div>
      </main>
    </AppShell>
  );
}
