import { useState, useCallback, useRef } from 'react';
import { ActivityData } from '@/types/activity';
import { externalSupabase } from '@/integrations/supabase/externalClient'
import { Atividade, atividadeToActivityData, activityDataToAtividade } from '@/types/atividade'


interface UseAtividadesReturn {
  data: ActivityData[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  fetchData: (startDate?: string, endDate?: string) => Promise<void>;
  syncData: (rows: ActivityData[]) => Promise<void>;
  setData: (data: ActivityData[]) => void;
  mergeNewData: (newData: ActivityData[]) => void;
}

type AtividadePayload = Omit<Atividade, 'id' | 'created_at'>;

const buildCompositeKey = (item: AtividadePayload) =>
  `${item.numero_os1 || ''}|${item.numero_os || ''}|${item.contrato || ''}|${item.data_atividade || ''}`;

export const useAtividades = (): UseAtividadesReturn => {
  const [data, setDataState] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInitialLoadRef = useRef(true);
  const lastSyncedDataRef = useRef<string>('');
  const pendingSyncRef = useRef<ActivityData[] | null>(null);
  const adaptiveBatchSizeRef = useRef(25);
  const fetchRequestIdRef = useRef(0);

  // Deduplica por numero_os1 + numero_os + contrato + data_atividade antes do upsert.
  const prepareAtividadesForUpsert = useCallback(
    (atividades: AtividadePayload[]) => {
      const normalizeTextKey = (v: unknown) => {
        if (v === null || v === undefined) return '';
        return String(v)
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const normalizeDateKey = (v: unknown) => {
        if (!v) return '';
        const s = String(v).trim();
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
        return isoMatch ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` : '';
      };

      const seen = new Map<string, AtividadePayload>();
      let skippedInvalid = 0;
      let validRows = 0;

      for (const item of atividades) {
        const numero_os1 = normalizeTextKey(item.numero_os1);
        const numero_os = normalizeTextKey(item.numero_os);
        const contrato = normalizeTextKey(item.contrato);
        const data_atividade = normalizeDateKey(item.data_atividade);

        if (!numero_os1 || !numero_os || !contrato || !data_atividade) {
          skippedInvalid++;
          continue;
        }

        validRows++;
        const key = `${numero_os1}|${numero_os}|${contrato}|${data_atividade}`;

        const normalizedItem: AtividadePayload = {
          ...item,
          numero_os1,
          numero_os,
          contrato,
          data_atividade,
        };

        seen.set(key, normalizedItem);
      }

      return {
        atividades: Array.from(seen.values()),
        skippedInvalid,
        duplicateCount: validRows - seen.size,
      };
    },
    []
  );

  // Envia um lote UPSERT com retry e backoff exponencial
  // UPSERT = sobrescreve dados repetidos (pela chave composta) e insere dados novos
  const sendBatchWithRetry = useCallback(async (
    batch: AtividadePayload[],
    batchNum: number,
    totalBatches: number
  ): Promise<void> => {
    const sendSegment = async (
      items: AtividadePayload[],
      segmentPath = ''
    ): Promise<void> => {
      const label = `Lote ${batchNum}/${totalBatches}${segmentPath ? `, sublote ${segmentPath}` : ''}`;
      const firstKey = buildCompositeKey(items[0]);
      const lastKey = buildCompositeKey(items[items.length - 1]);

      console.log(
        `[atividades] ${label}: ${items.length} registros | primeira chave=${firstKey} | ultima chave=${lastKey}`
      );

      for (let attempt = 1; attempt <= 4; attempt++) {
        const { error: upsertError } = await externalSupabase
          .from('atividades')
          .upsert(items, {
            onConflict: 'numero_os1,numero_os,contrato,data_atividade',
            ignoreDuplicates: false
          });

        if (!upsertError) {
          console.log(`[atividades] ${label} OK na tentativa ${attempt}/4.`);
          return;
        }

        const isStatementTimeout =
          upsertError.code === '57014'
          || /statement timeout/i.test(upsertError.message);

        console.warn(
          `[atividades] ${label} falhou na tentativa ${attempt}/4: ${upsertError.message}`
        );

        // Um timeout cancela toda a instrucao no Postgres. Divide o segmento
        // e aguarda cada metade em sequencia para reduzir o trabalho dos triggers.
        if (isStatementTimeout && items.length > 1) {
          const nextSize = Math.max(1, Math.floor(items.length / 2));
          adaptiveBatchSizeRef.current = Math.min(adaptiveBatchSizeRef.current, nextSize);
          const middle = Math.ceil(items.length / 2);

          console.warn(
            `[atividades] ${label} excedeu o timeout; dividindo em ${middle} + ${items.length - middle} registros sequenciais.`
          );

          await sendSegment(items.slice(0, middle), `${segmentPath || '1'}.1`);
          await sendSegment(items.slice(middle), `${segmentPath || '1'}.2`);
          return;
        }

        if (attempt === 4) {
          throw new Error(`${label} falhou apos 4 tentativas: ${upsertError.message}`);
        }

        const waitMs = attempt * 2500;
        await new Promise(r => setTimeout(r, waitMs));
      }
    };

    const learnedBatchSize = adaptiveBatchSizeRef.current;
    if (batch.length > learnedBatchSize) {
      const learnedSegments = Math.ceil(batch.length / learnedBatchSize);
      console.warn(
        `[atividades] Lote ${batchNum}/${totalBatches}: usando ${learnedSegments} sublotes sequenciais de ate ${learnedBatchSize} registros apos timeout anterior.`
      );

      for (let start = 0, part = 1; start < batch.length; start += learnedBatchSize, part++) {
        await sendSegment(
          batch.slice(start, start + learnedBatchSize),
          `adaptativo-${part}/${learnedSegments}`
        );
      }
      return;
    }

    await sendSegment(batch);
  }, []);

  // Lock para evitar syncs simultâneos
  const syncInProgressRef = useRef(false);

  const doSync = useCallback(async (rows: ActivityData[]) => {
    // Guard: evita syncs simultâneos (múltiplos arquivos enviados ao mesmo tempo)
    if (syncInProgressRef.current) {
      console.warn("Sincronizacao de atividades ja esta em andamento. Novo envio ignorado.");
      return;
    }

    if (!rows || rows.length === 0) {
      console.log("Nenhum dado para sincronizar.");
      return;
    }

    syncInProgressRef.current = true;
    setIsSyncing(true);
    const startTime = performance.now();
    console.log(`🔄 Sincronizando ${rows.length} registros com Supabase (UPSERT)...`);

    try {
      const atividadesRaw = rows.map(activityDataToAtividade);
      const { atividades, skippedInvalid, duplicateCount } = prepareAtividadesForUpsert(atividadesRaw);

      if (skippedInvalid > 0) {
        console.warn(`[atividades] ${skippedInvalid} registros ignorados por chave incompleta.`);
      }

      console.log(
        `[atividades] Apos deduplicacao: ${atividades.length} registros unicos (${duplicateCount} duplicatas removidas).`
      );

      if (atividades.length === 0) {
        throw new Error('Nenhum registro com chave completa para sincronizar.');
      }

      // UPSERT sequencial para reduzir pressao no trigger fn_calc_log_atividades.
      const batchSize = 25;
      const totalBatches = Math.ceil(atividades.length / batchSize);
      let successCount = 0;

      console.log(`[atividades] UPSERT: ${atividades.length} registros em ${totalBatches} lotes sequenciais (${batchSize}/lote).`);

      // Divide em lotes
      const batches: AtividadePayload[][] = [];
      for (let i = 0; i < atividades.length; i += batchSize) {
        batches.push(atividades.slice(i, i + batchSize));
      }

      for (let i = 0; i < batches.length; i++) {
        await sendBatchWithRetry(batches[i], i + 1, totalBatches);
        successCount++;

        const completedCount = i + 1;
        const pct = Math.round((completedCount / totalBatches) * 100);
        const logInterval = Math.max(1, Math.floor(totalBatches / 20));
        if (completedCount % logInterval === 0 || completedCount === totalBatches) {
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(0);
          console.log(`[atividades] Progresso: ${pct}% (${completedCount}/${totalBatches}) | ${successCount} OK | ${elapsed}s`);
        }
      }

      lastSyncedDataRef.current = String(atividades.length);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`[atividades] Sincronizacao completa em ${elapsed}s! ${successCount}/${totalBatches} lotes OK.`);
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [prepareAtividadesForUpsert, sendBatchWithRetry]);

  const processPendingSync = useCallback(async () => {
    const pending = pendingSyncRef.current;
    if (pending) {
      pendingSyncRef.current = null;
      console.log("Processando sincronização pendente da fila...");
      await doSync(pending);
    }
  }, [doSync]);

  const fetchData = useCallback(async (startDate?: string, endDate?: string) => {
    const requestId = ++fetchRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    isInitialLoadRef.current = true;


    try {
      const periodLabel = startDate || endDate
        ? `${startDate || 'inicio'} ate ${endDate || 'hoje'}`
        : 'todo o historico';
      console.log(`Buscando dados do Supabase: ${periodLabel}...`);
      const startTime = performance.now();

      // Colunas específicas ao invés de select('*')
      const columns = 'id,numero_os,contrato,data_atividade,recurso,status_atividade,tipo_atividade,tipo_os1,cod_baixa_1,intervalo_tempo,duracao_minutos,latitude,longitude,cidade,bairro,numero_os1,tempo_de_deslocamento,contador_log,tecnico_referencia,status_execucao,is_revisita,ofensor_revisita,habilidade_trabalho,tecnologia';

      // Conta e busca somente o periodo selecionado, sem baixar todo o historico.
      let countQuery = externalSupabase
        .from('atividades')
        .select('id', { count: 'exact', head: true });

      if (startDate) countQuery = countQuery.gte('data_atividade', startDate);
      if (endDate) countQuery = countQuery.lte('data_atividade', endDate);

      const { count, error: countError } = await countQuery;

      if (countError) {
        throw new Error(countError.message);
      }

      if (requestId !== fetchRequestIdRef.current) return;

      const totalRows = count || 0;
      console.log(`Total de registros no periodo: ${totalRows}`);

      if (totalRows === 0) {
        console.log("Nenhum dado encontrado no Supabase.");
        setDataState([]);
        return;
      }

      // Paginação em PARALELO (Promise.all) ao invés de sequencial
      const pageSize = 1000;
      const totalPages = Math.ceil(totalRows / pageSize);

      const pagePromises = Array.from({ length: totalPages }, (_, i) => {
        let pageQuery = externalSupabase
          .from('atividades')
          .select(columns);

        if (startDate) pageQuery = pageQuery.gte('data_atividade', startDate);
        if (endDate) pageQuery = pageQuery.lte('data_atividade', endDate);

        return pageQuery
          .order('data_atividade', { ascending: false })
          .order('id', { ascending: false })
          .range(i * pageSize, (i + 1) * pageSize - 1);
      });

      const results = await Promise.all(pagePromises);

      if (requestId !== fetchRequestIdRef.current) return;

      // Acumula com push (sem spread/cópia de array)
      const allData: Atividade[] = [];
      for (const result of results) {
        if (result.error) {
          console.warn('Erro em página:', result.error.message);
          continue;
        }
        if (result.data) {
          allData.push(...result.data);
        }
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`Dados recebidos: ${allData.length} linhas em ${elapsed}s.`);

      const convertedData = allData.map(atividadeToActivityData) as ActivityData[];
      setDataState(convertedData);
      // Usa length como referência simples ao invés de JSON.stringify pesado
      lastSyncedDataRef.current = String(convertedData.length);
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      console.error("Erro ao buscar dados:", err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
    } finally {
      if (requestId === fetchRequestIdRef.current) {
        setIsLoading(false);
        isInitialLoadRef.current = false;
        console.log("Sistema pronto para sincronização.");
        processPendingSync();
      }
    }
  }, [processPendingSync]);

  const syncData = useCallback(async (rows: ActivityData[]) => {
    if (isInitialLoadRef.current) {
      console.log("Carregamento inicial em andamento - dados adicionados à fila de sincronização.");
      pendingSyncRef.current = rows;
      return;
    }
    await doSync(rows);
  }, [doSync]);

  const setData = useCallback((newData: ActivityData[]) => {
    setDataState(newData);
  }, []);

  const mergeNewData = useCallback((newData: ActivityData[]) => {
    console.log(`Substituindo dados: ${newData.length} registros do arquivo.`);
    setDataState(newData);

    lastSyncedDataRef.current = '';
    syncData(newData);
  }, [syncData]);

  return {
    data,
    isLoading,
    isSyncing,
    error,
    fetchData,
    syncData,
    setData,
    mergeNewData
  };
};
