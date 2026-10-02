import { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import type { ColaboradorCadastrado, TecnicoFrente } from '@/types/comissionamento';
import { calcularGatilhoPontuacao } from '@/utils/gatilhosPontuacao';
import type {
  GatilhoFaixa,
  GatilhoImportRow,
  GatilhoRankingItem,
  GatilhoResultado,
  GatilhosDataState,
  GatilhoTipo,
  GatilhoVinculo,
} from '@/types/gatilhos';

const EMPTY_STATE: GatilhosDataState = {
  resultados: [],
  vinculos: [],
  faixas: [],
  colaboradores: [],
  tecnicosFrente: [],
};

const normalizeLabel = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');

const parseDecimal = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '')
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\.(?=.*[,])/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseExternalId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return String(value ?? '').trim().replace(/\.0+$/, '');
};

const findHeader = (headers: unknown[], expected: string) =>
  headers.findIndex((header) => normalizeLabel(header) === normalizeLabel(expected));

export const getDefaultGatilhoPeriod = () => {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const firstDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
  const format = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return { inicio: format(firstDay), fim: format(yesterday) };
};

const parseGatilhosWorkbook = async (file: File): Promise<GatilhoImportRow[]> => {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheetName = workbook.SheetNames.find(
    (name) => normalizeLabel(name) === 'comiss sintetico',
  );

  if (!sheetName) {
    throw new Error('A aba "Comiss.Sintético" não foi encontrada no arquivo.');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  });

  const headers = rows[0] || [];
  const indexes = {
    id: findHeader(headers, 'Id'),
    valor: findHeader(headers, 'Valor'),
    instalador: findHeader(headers, 'Valor Instalador'),
    auxiliar: findHeader(headers, 'Valor Auxiliar'),
    deslocamento: findHeader(headers, 'Valor Deslocamento'),
  };

  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error('A aba Comiss.Sintético não possui todas as colunas esperadas.');
  }

  const parsed = rows.slice(1).flatMap((row) => {
    const id = parseExternalId(row[indexes.id]);
    if (!id) return [];

    return [{
      id_externo: id,
      valor: parseDecimal(row[indexes.valor]),
      valor_instalador: parseDecimal(row[indexes.instalador]),
      valor_auxiliar: parseDecimal(row[indexes.auxiliar]),
      valor_deslocamento: parseDecimal(row[indexes.deslocamento]),
    }];
  });

  if (parsed.length === 0) throw new Error('Nenhum resultado válido foi encontrado na planilha.');

  const ids = new Set<string>();
  for (const row of parsed) {
    if (ids.has(row.id_externo)) {
      throw new Error(`O ID ${row.id_externo} aparece mais de uma vez na aba Comiss.Sintético.`);
    }
    ids.add(row.id_externo);
  }

  return parsed;
};

export function useGatilhos() {
  const [state, setState] = useState<GatilhosDataState>(EMPTY_STATE);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const resultados: GatilhoResultado[] = [];
      let page = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error: queryError } = await externalSupabase
          .from('gatilhos_resultados')
          .select('*')
          .order('periodo_inicio', { ascending: false })
          .order('id_externo')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (queryError) throw queryError;
        const rows = (data || []) as GatilhoResultado[];
        resultados.push(...rows);
        if (rows.length < pageSize) break;
        page += 1;
      }

      const [vinculosResult, faixasResult, colaboradoresResult, tecnicosResult] =
        await Promise.all([
          externalSupabase
            .from('gatilhos_vinculos')
            .select('id, id_externo, colaborador_id, cidade, tipo, papel, colaborador:colaboradores_cadastrados(id, nome, cpf, setor)')
            .order('papel', { ascending: true }),
          externalSupabase.from('gatilhos_faixas').select('*').order('tipo').order('nivel'),
          externalSupabase
            .from('colaboradores_cadastrados')
            .select('id, nome, cpf, setor')
            .order('nome'),
          externalSupabase.from('tecnicos_frentes').select('id, nome, frente, cidade'),
        ]);

      const firstError = [
        vinculosResult.error,
        faixasResult.error,
        colaboradoresResult.error,
        tecnicosResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      setState({
        resultados,
        vinculos: (vinculosResult.data || []) as unknown as GatilhoVinculo[],
        faixas: (faixasResult.data || []) as GatilhoFaixa[],
        colaboradores: (colaboradoresResult.data || []) as ColaboradorCadastrado[],
        tecnicosFrente: (tecnicosResult.data || []) as TecnicoFrente[],
      });
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os gatilhos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const periods = useMemo(() => {
    const byStart = new Map<string, { inicio: string; fim: string; total: number }>();
    state.resultados.forEach((row) => {
      const current = byStart.get(row.periodo_inicio);
      byStart.set(row.periodo_inicio, {
        inicio: row.periodo_inicio,
        fim: current && current.fim > row.periodo_fim ? current.fim : row.periodo_fim,
        total: (current?.total || 0) + 1,
      });
    });
    return Array.from(byStart.values()).sort((a, b) => b.inicio.localeCompare(a.inicio));
  }, [state.resultados]);
  const activePeriod = periods.some((period) => period.inicio === selectedPeriod)
    ? selectedPeriod
    : periods[0]?.inicio || null;

  const ranking = useMemo<GatilhoRankingItem[]>(() => {
    const vinculosPorId = new Map<string, GatilhoVinculo[]>();
    state.vinculos.forEach((vinculo) => {
      const current = vinculosPorId.get(vinculo.id_externo) || [];
      current.push(vinculo);
      vinculosPorId.set(vinculo.id_externo, current);
    });

    return state.resultados.filter((resultado) => resultado.periodo_inicio === activePeriod).map((resultado) => {
      const vinculos = (vinculosPorId.get(resultado.id_externo) || [])
        .sort((a, b) => (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1));
      const tipo = vinculos[0]?.tipo || null;
      const cidade = vinculos[0]?.cidade || null;
      const faixas = state.faixas.filter((faixa) => faixa.tipo === tipo);
      const { pontuacao, faixaAtual, proximaFaixa, premio } = calcularGatilhoPontuacao(resultado, faixas);
      const nomes = vinculos.map((vinculo) => vinculo.colaborador.nome);

      return {
        ...resultado,
        valor: Number(resultado.valor),
        valor_ajustado: resultado.valor_ajustado == null ? null : Number(resultado.valor_ajustado),
        pontuacao,
        valor_instalador: Number(resultado.valor_instalador),
        valor_auxiliar: Number(resultado.valor_auxiliar),
        valor_deslocamento: Number(resultado.valor_deslocamento),
        nomes,
        nome_exibicao: nomes.length > 0 ? nomes.join(' / ') : `ID ${resultado.id_externo} não vinculado`,
        cidade,
        tipo,
        vinculado: nomes.length > 0 && Boolean(tipo) && Boolean(cidade),
        faixa_atual: faixaAtual,
        proxima_faixa: proximaFaixa,
        premio,
      };
    }).sort((a, b) => b.pontuacao - a.pontuacao);
  }, [activePeriod, state.faixas, state.resultados, state.vinculos]);

  const importWorkbook = useCallback(async (
    file: File,
    periodoInicio: string,
    periodoFim: string,
  ) => {
    setIsImporting(true);
    setError(null);
    try {
      const rows = await parseGatilhosWorkbook(file);
      const { data, error: importError } = await externalSupabase.rpc('substituir_gatilhos_resultados', {
        p_dados: rows,
        p_periodo_inicio: periodoInicio,
        p_periodo_fim: periodoFim,
        p_arquivo_nome: file.name,
      });
      if (importError) {
        const message = [importError.message, importError.details, importError.hint]
          .filter(Boolean)
          .join(' ');
        throw new Error(message || 'O banco rejeitou a substituição da carga.');
      }
      setSelectedPeriod(periodoInicio);
      await fetchData();
      return Number(data) || rows.length;
    } finally {
      setIsImporting(false);
    }
  }, [fetchData]);

  const savePontuacao = useCallback(async (
    idExterno: string,
    periodoInicio: string,
    valorAjustado: number | null,
    motivo: string,
  ) => {
    const { error: saveError } = await externalSupabase.rpc('ajustar_gatilho_pontuacao', {
      p_id_externo: idExterno,
      p_periodo_inicio: periodoInicio,
      p_valor_ajustado: valorAjustado,
      p_motivo: motivo,
    });
    if (saveError) throw saveError;
    await fetchData();
  }, [fetchData]);

  const saveVinculo = useCallback(async (
    idExterno: string,
    cidade: string,
    tipo: GatilhoTipo,
    colaboradorIds: string[],
  ) => {
    const { error: saveError } = await externalSupabase.rpc('salvar_gatilho_vinculo', {
      p_id_externo: idExterno,
      p_cidade: cidade,
      p_tipo: tipo,
      p_colaboradores: colaboradorIds,
    });
    if (saveError) throw saveError;
    await fetchData();
  }, [fetchData]);

  const deleteVinculo = useCallback(async (idExterno: string) => {
    const { error: deleteError } = await externalSupabase
      .from('gatilhos_vinculos')
      .delete()
      .eq('id_externo', idExterno);
    if (deleteError) throw deleteError;
    await fetchData();
  }, [fetchData]);

  const saveFaixas = useCallback(async (faixas: GatilhoFaixa[]) => {
    const payload = faixas.map(({ id: _id, ...faixa }) => faixa);
    const { error: saveError } = await externalSupabase
      .from('gatilhos_faixas')
      .upsert(payload, { onConflict: 'tipo,nivel' });
    if (saveError) throw saveError;
    await fetchData();
  }, [fetchData]);

  return {
    ...state,
    ranking,
    periods,
    activePeriod,
    setSelectedPeriod,
    isLoading,
    isImporting,
    error,
    fetchData,
    importWorkbook,
    savePontuacao,
    saveVinculo,
    deleteVinculo,
    saveFaixas,
  };
}
