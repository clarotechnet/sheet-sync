import { useCallback, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import type { ColaboradorCadastrado, TecnicoFrente } from '@/types/comissionamento';
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
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
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
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [resultadosResult, vinculosResult, faixasResult, colaboradoresResult, tecnicosResult] =
        await Promise.all([
          externalSupabase.from('gatilhos_resultados').select('*').order('valor', { ascending: false }),
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
        resultadosResult.error,
        vinculosResult.error,
        faixasResult.error,
        colaboradoresResult.error,
        tecnicosResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      setState({
        resultados: (resultadosResult.data || []) as GatilhoResultado[],
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

  const ranking = useMemo<GatilhoRankingItem[]>(() => {
    const vinculosPorId = new Map<string, GatilhoVinculo[]>();
    state.vinculos.forEach((vinculo) => {
      const current = vinculosPorId.get(vinculo.id_externo) || [];
      current.push(vinculo);
      vinculosPorId.set(vinculo.id_externo, current);
    });

    return state.resultados.map((resultado) => {
      const vinculos = (vinculosPorId.get(resultado.id_externo) || [])
        .sort((a, b) => (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1));
      const tipo = vinculos[0]?.tipo || null;
      const cidade = vinculos[0]?.cidade || null;
      const faixas = state.faixas
        .filter((faixa) => faixa.tipo === tipo)
        .sort((a, b) => a.pontos - b.pontos);
      const atingidas = faixas.filter((faixa) => Number(resultado.valor) >= Number(faixa.pontos));
      const faixaAtual = atingidas.at(-1) || null;
      const proximaFaixa = faixas.find((faixa) => Number(resultado.valor) < Number(faixa.pontos)) || null;
      const nomes = vinculos.map((vinculo) => vinculo.colaborador.nome);

      return {
        ...resultado,
        valor: Number(resultado.valor),
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
        premio: faixaAtual ? Number(faixaAtual.premio) : 0,
      };
    }).sort((a, b) => b.valor - a.valor);
  }, [state.faixas, state.resultados, state.vinculos]);

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
      await fetchData();
      return Number(data) || rows.length;
    } finally {
      setIsImporting(false);
    }
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
    isLoading,
    isImporting,
    error,
    fetchData,
    importWorkbook,
    saveVinculo,
    deleteVinculo,
    saveFaixas,
  };
}
