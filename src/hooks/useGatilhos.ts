import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import type { ColaboradorCadastrado, TecnicoFrente } from '@/types/comissionamento';
import { buildLiveGatilhosRanking, readClosedGatilhos } from '@/utils/gatilhosHistory';
import type {
  GatilhoFaixa,
  GatilhoImportRow,
  GatilhoFechamento,
  GatilhoResultadoFechado,
  GatilhoResultado,
  GatilhosDataState,
  GatilhoTipo,
  GatilhoVinculo,
} from '@/types/gatilhos';

const EMPTY_STATE: GatilhosDataState & { fechamentos: GatilhoFechamento[]; closureAvailable: boolean | null } = {
  resultados: [],
  vinculos: [],
  faixas: [],
  colaboradores: [],
  tecnicosFrente: [],
  fechamentos: [],
  closureAvailable: null,
};

const errorMessage = (caught: unknown, fallback: string) =>
  typeof caught === 'object' && caught !== null && 'message' in caught ? String(caught.message) : fallback;

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
  const [state, setState] = useState(EMPTY_STATE);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const hasKnownClosures = useRef(false);
  const [snapshot, setSnapshot] = useState<{
    key: string; view: ReturnType<typeof readClosedGatilhos> | null; error: string | null;
  } | null>(null);

  const fetchData = useCallback(async () => {
    const currentRequest = ++request.current;
    setIsLoading(true);
    setError(null);

    try {
      const fechamentos: GatilhoFechamento[] = [];
      let closureAvailable = true;
      for (let offset = 0; ; offset += 1000) {
        const result = await externalSupabase.from('gatilhos_fechamentos').select('*')
          .order('periodo_inicio', { ascending: false }).range(offset, offset + 999);
        if (result.error) {
          if (['PGRST205', '42P01'].includes(result.error.code)) {
            if (hasKnownClosures.current) {
              throw new Error('Não foi possível verificar os fechamentos. Os dados foram bloqueados; atualize para tentar novamente.');
            }
            closureAvailable = false;
            break;
          }
          throw result.error;
        }
        const rows = (result.data || []) as GatilhoFechamento[];
        fechamentos.push(...rows);
        if (rows.length < 1000) break;
      }
      if (fechamentos.length) hasKnownClosures.current = true;
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

      if (currentRequest !== request.current) return;
      setState({
        fechamentos,
        closureAvailable,
        resultados,
        vinculos: (vinculosResult.data || []) as unknown as GatilhoVinculo[],
        faixas: (faixasResult.data || []) as GatilhoFaixa[],
        colaboradores: (colaboradoresResult.data || []) as ColaboradorCadastrado[],
        tecnicosFrente: (tecnicosResult.data || []) as TecnicoFrente[],
      });
    } catch (caught: unknown) {
      if (currentRequest === request.current) setError(errorMessage(caught, 'Não foi possível carregar os gatilhos.'));
    } finally {
      if (currentRequest === request.current) setIsLoading(false);
    }
  }, []);

  const periods = useMemo(() => {
    const byStart = new Map<string, { inicio: string; fim: string; total: number; fechado?: boolean }>();
    state.resultados.forEach((row) => {
      const current = byStart.get(row.periodo_inicio);
      byStart.set(row.periodo_inicio, {
        inicio: row.periodo_inicio,
        fim: current && current.fim > row.periodo_fim ? current.fim : row.periodo_fim,
        total: (current?.total || 0) + 1,
      });
    });
    state.fechamentos.forEach((row) => byStart.set(row.periodo_inicio, {
      inicio: row.periodo_inicio, fim: row.periodo_fim, total: row.total_ids, fechado: true,
    }));
    return Array.from(byStart.values()).sort((a, b) => b.inicio.localeCompare(a.inicio));
  }, [state.resultados, state.fechamentos]);
  const activePeriod = periods.some((period) => period.inicio === selectedPeriod)
    ? selectedPeriod
    : periods[0]?.inicio || null;

  const fechamento = state.fechamentos.find((row) => row.periodo_inicio === activePeriod) || null;
  const snapshotKey = fechamento ? `${fechamento.periodo_inicio}:${fechamento.fechado_em}` : null;
  useEffect(() => {
    if (!fechamento || !snapshotKey) { setSnapshot(null); return; }
    const controller = new AbortController();
    const key = snapshotKey;
    setSnapshot({ key, view: null, error: null });
    void (async () => {
      try {
        const rows: GatilhoResultadoFechado[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await externalSupabase.from('gatilhos_resultados_fechados').select('*')
            .eq('periodo_inicio', fechamento.periodo_inicio).order('id_externo')
            .range(offset, offset + 999).abortSignal(controller.signal);
          if (result.error) throw result.error;
          const page = (result.data || []) as unknown as GatilhoResultadoFechado[];
          rows.push(...page);
          if (page.length < 1000) break;
        }
        const view = readClosedGatilhos(fechamento, rows);
        if (!controller.signal.aborted) setSnapshot({ key, view, error: null });
      } catch (caught) {
        if (!controller.signal.aborted) setSnapshot({ key, view: null, error: errorMessage(caught, 'Não foi possível carregar o período fechado.') });
      }
    })();
    return () => controller.abort();
  }, [fechamento, snapshotKey]);

  const liveRanking = useMemo(() => buildLiveGatilhosRanking(state, activePeriod), [state, activePeriod]);
  const closedView = snapshot?.key === snapshotKey ? snapshot : null;
  const isHistoryLoading = Boolean(fechamento && !closedView?.view && !closedView?.error);
  const ranking = fechamento ? closedView?.view?.ranking || [] : liveRanking;
  const viewVinculos = fechamento ? closedView?.view?.vinculos || [] : state.vinculos;
  const viewFaixas = fechamento ? closedView?.view?.faixas || [] : state.faixas;

  const assertOpen = useCallback((periodo = activePeriod) => {
    if (isLoading || error || isClosing) throw new Error('Atualize os dados antes de editar.');
    if (state.fechamentos.some((row) => row.periodo_inicio === periodo)) {
      throw new Error('Esse período está fechado e não permite alterações.');
    }
  }, [activePeriod, state.fechamentos, isLoading, error, isClosing]);

  const closePeriod = useCallback(async (periodo: string) => {
    if (state.closureAvailable !== true) throw new Error('O fechamento ainda não está disponível no banco.');
    assertOpen(periodo);
    setIsClosing(true);
    try {
      const result = await externalSupabase.rpc('fechar_periodo_gatilhos', { p_periodo_inicio: periodo });
      if (result.error) throw result.error;
      hasKnownClosures.current = true;
      await fetchData();
    } finally { setIsClosing(false); }
  }, [assertOpen, fetchData, state.closureAvailable]);

  const importWorkbook = useCallback(async (
    file: File,
    periodoInicio: string,
    periodoFim: string,
  ) => {
    assertOpen(periodoInicio);
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
  }, [assertOpen, fetchData]);

  const savePontuacao = useCallback(async (
    idExterno: string,
    periodoInicio: string,
    valorAjustado: number | null,
    motivo: string,
  ) => {
    assertOpen(periodoInicio);
    const { error: saveError } = await externalSupabase.rpc('ajustar_gatilho_pontuacao', {
      p_id_externo: idExterno,
      p_periodo_inicio: periodoInicio,
      p_valor_ajustado: valorAjustado,
      p_motivo: motivo,
    });
    if (saveError) throw saveError;
    await fetchData();
  }, [assertOpen, fetchData]);

  const saveVinculo = useCallback(async (
    idExterno: string,
    cidade: string,
    tipo: GatilhoTipo,
    colaboradorIds: string[],
  ) => {
    assertOpen();
    const { error: saveError } = await externalSupabase.rpc('salvar_gatilho_vinculo', {
      p_id_externo: idExterno,
      p_cidade: cidade,
      p_tipo: tipo,
      p_colaboradores: colaboradorIds,
    });
    if (saveError) throw saveError;
    await fetchData();
  }, [assertOpen, fetchData]);

  const deleteVinculo = useCallback(async (idExterno: string) => {
    assertOpen();
    const { error: deleteError } = await externalSupabase
      .from('gatilhos_vinculos')
      .delete()
      .eq('id_externo', idExterno);
    if (deleteError) throw deleteError;
    await fetchData();
  }, [assertOpen, fetchData]);

  const saveFaixas = useCallback(async (faixas: GatilhoFaixa[]) => {
    assertOpen();
    const payload = faixas.map(({ id: _id, ...faixa }) => faixa);
    const { error: saveError } = await externalSupabase
      .from('gatilhos_faixas')
      .upsert(payload, { onConflict: 'tipo,nivel' });
    if (saveError) throw saveError;
    await fetchData();
  }, [assertOpen, fetchData]);

  return {
    ...state,
    ranking,
    viewVinculos,
    viewFaixas,
    fechamento,
    isHistoryLoading,
    isClosing,
    closePeriod,
    periods,
    activePeriod,
    setSelectedPeriod,
    isLoading,
    isImporting,
    error: error || closedView?.error || null,
    fetchData,
    importWorkbook,
    savePontuacao,
    saveVinculo,
    deleteVinculo,
    saveFaixas,
  };
}
