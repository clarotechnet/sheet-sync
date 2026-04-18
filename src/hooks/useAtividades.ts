import { useState, useCallback, useRef } from 'react';
import { ActivityData } from '@/types/activity';
import { externalSupabase } from '@/integrations/supabase/externalClient'
import { Atividade, atividadeToActivityData, activityDataToAtividade } from '@/types/atividade'


interface UseAtividadesReturn {
  data: ActivityData[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  syncData: (rows: ActivityData[]) => Promise<void>;
  setData: (data: ActivityData[]) => void;
  mergeNewData: (newData: ActivityData[]) => void;
}

export const useAtividades = (): UseAtividadesReturn => {
  const [data, setDataState] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isInitialLoadRef = useRef(true);
  const lastSyncedDataRef = useRef<string>('');
  const pendingSyncRef = useRef<ActivityData[] | null>(null);

  // Deduplicação: para o UPSERT funcionar, o índice/constraint no banco precisa ser
  // em cima das COLUNAS (numero_os1,numero_os,contrato,data_atividade) e essas colunas devem
  // ser NOT NULL (com defaults).
  const deduplicateByCompositeKey = useCallback(
    (atividades: Omit<Atividade, 'id' | 'created_at'>[]) => {
      // Remove espaços invisíveis (NBSP) e normaliza string
      const normalizeTextKey = (v: unknown) => {
        if (v === null || v === undefined) return '';
        return String(v)
          .replace(/\u00A0/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Normaliza data para YYYY-MM-DD (para bater com coluna DATE)
      const normalizeDateKey = (v: unknown) => {
        if (!v) return '1900-01-01';
        const s = String(v).trim();
        if (s.includes('T')) return s.split('T')[0];
        if (s.includes(' ')) return s.split(' ')[0];
        return s;
      };

      const seen = new Map<string, Omit<Atividade, 'id' | 'created_at'>>();

      for (const item of atividades) {
        const numero_os1 = normalizeTextKey(item.numero_os1);
        const numero_os = normalizeTextKey(item.numero_os);
        const contrato = normalizeTextKey(item.contrato);
        const data_atividade = normalizeDateKey(item.data_atividade);

        const key = `${numero_os1}|${numero_os}|${contrato}|${data_atividade}`;

        const normalizedItem: Omit<Atividade, 'id' | 'created_at'> = {
          ...item,
          numero_os1,
          numero_os,
          contrato,
          data_atividade,
        };

        // Mantém a última ocorrência (dados mais recentes do arquivo)
        seen.set(key, normalizedItem);
      }

      return Array.from(seen.values());
    },
    []
  );

  // Envia um lote UPSERT com retry e backoff exponencial
  // UPSERT = sobrescreve dados repetidos (pela chave composta) e insere dados novos
  const sendBatchWithRetry = useCallback(async (
    batch: Omit<Atividade, 'id' | 'created_at'>[],
    batchNum: number,
    totalBatches: number
  ): Promise<boolean> => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const { error: upsertError } = await externalSupabase
        .from('atividades')
        .upsert(batch, {
          onConflict: 'numero_os1,numero_os,contrato,data_atividade',
          ignoreDuplicates: false
        });

      if (!upsertError) {
        return true;
      }

      if (upsertError.message.includes('timeout') || upsertError.message.includes('Timeout')) {
        const waitMs = attempt * 2500; // 2.5s, 5s, 7.5s, 10s
        console.warn(`Lote ${batchNum}/${totalBatches} timeout (tentativa ${attempt}/4), aguardando ${waitMs / 1000}s...`);
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        console.warn(`Erro no lote ${batchNum}/${totalBatches}:`, upsertError.message);
        return false;
      }
    }
    return false;
  }, []);

  // Lock para evitar syncs simultâneos
  const syncInProgressRef = useRef(false);

  const doSync = useCallback(async (rows: ActivityData[]) => {
    // Guard: evita syncs simultâneos (múltiplos arquivos enviados ao mesmo tempo)
    if (syncInProgressRef.current) {
      console.log("⏳ Sincronização já em andamento, aguardando...");
      for (let wait = 0; wait < 150; wait++) {
        await new Promise(r => setTimeout(r, 2000));
        if (!syncInProgressRef.current) break;
      }
      if (syncInProgressRef.current) {
        console.warn("⚠️ Timeout aguardando sync anterior. Iniciando nova sync.");
      }
    }

    const currentRef = String(rows.length);
    if (currentRef === lastSyncedDataRef.current && rows.length > 0) {
      console.log("Quantidade de dados idêntica — possível duplicata de sincronização, pulando.");
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
      const atividades = deduplicateByCompositeKey(atividadesRaw);
      console.log(`Após deduplicação: ${atividades.length} registros únicos (${atividadesRaw.length - atividades.length} duplicatas removidas)`);

      // UPSERT: dados repetidos (mesma chave composta) são sobrescritos, novos são inseridos.
      // Lotes de 50 com 2 paralelos para balancear velocidade e evitar timeout.
      const batchSize = 50;
      const concurrency = 2;
      const totalBatches = Math.ceil(atividades.length / batchSize);
      let successCount = 0;
      let failCount = 0;
      let completedCount = 0;
      let consecutiveFails = 0;

      console.log(`🚀 UPSERT: ${atividades.length} registros em ${totalBatches} lotes (${batchSize}/lote, ${concurrency} paralelos)`);

      // Divide em lotes
      const batches: Omit<Atividade, 'id' | 'created_at'>[][] = [];
      for (let i = 0; i < atividades.length; i += batchSize) {
        batches.push(atividades.slice(i, i + batchSize));
      }

      // === PRIMEIRA PASSADA: envia todos os lotes ===
      let failedBatches: { index: number; batch: Omit<Atividade, 'id' | 'created_at'>[] }[] = [];

      for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency);
        const chunkIndices = chunk.map((_, idx) => i + idx);
        const promises = chunk.map((batch, idx) => {
          const batchNum = i + idx + 1;
          return sendBatchWithRetry(batch, batchNum, totalBatches);
        });

        const results = await Promise.all(promises);

        for (let j = 0; j < results.length; j++) {
          completedCount++;
          if (results[j]) {
            successCount++;
            consecutiveFails = 0;
          } else {
            failCount++;
            consecutiveFails++;
            failedBatches.push({ index: chunkIndices[j], batch: chunk[j] });
          }
        }

        // Aborta se 10 falhas consecutivas (DB sobrecarregado)
        if (consecutiveFails >= 10) {
          console.error(`❌ 10 falhas consecutivas. Pausando envio inicial.`);
          // Adiciona os lotes restantes como "falhos" para tentar no retry
          for (let k = i + concurrency; k < batches.length; k++) {
            failedBatches.push({ index: k, batch: batches[k] });
          }
          break;
        }

        // Log de progresso a cada ~5%
        const pct = Math.round((completedCount / totalBatches) * 100);
        const logInterval = Math.max(1, Math.floor(totalBatches / 20));
        if (completedCount % logInterval === 0 || completedCount === totalBatches) {
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(0);
          console.log(`Progresso: ${pct}% (${completedCount}/${totalBatches}) | ${successCount} OK, ${failCount} falhas | ${elapsed}s`);
        }
      }

      // === REENVIO DOS LOTES QUE FALHARAM ===
      const maxRetryRounds = 5;
      let retryRound = 0;

      while (failedBatches.length > 0 && retryRound < maxRetryRounds) {
        retryRound++;
        const waitSecs = retryRound * 5; // 5s, 10s, 15s, 20s, 25s entre rodadas
        console.log(`🔁 Rodada ${retryRound}/${maxRetryRounds}: reenviando ${failedBatches.length} lotes que falharam (aguardando ${waitSecs}s)...`);
        await new Promise(r => setTimeout(r, waitSecs * 1000));

        const stillFailed: typeof failedBatches = [];
        let roundSuccess = 0;

        for (let i = 0; i < failedBatches.length; i += concurrency) {
          const retryChunk = failedBatches.slice(i, i + concurrency);
          const promises = retryChunk.map(({ index, batch }) =>
            sendBatchWithRetry(batch, index + 1, totalBatches)
          );

          const results = await Promise.all(promises);

          for (let j = 0; j < results.length; j++) {
            if (results[j]) {
              roundSuccess++;
              successCount++;
              failCount--;
            } else {
              stillFailed.push(retryChunk[j]);
            }
          }
        }

        console.log(`🔁 Rodada ${retryRound}: ${roundSuccess}/${failedBatches.length} recuperados, ${stillFailed.length} ainda pendentes.`);
        failedBatches = stillFailed;
      }

      if (failedBatches.length > 0) {
        console.warn(`⚠️ ${failedBatches.length} lotes não puderam ser enviados após ${maxRetryRounds} rodadas de reenvio.`);
      }

      lastSyncedDataRef.current = currentRef;
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Sincronização completa em ${elapsed}s! ${successCount}/${totalBatches} lotes OK${failedBatches.length > 0 ? `, ${failedBatches.length} falharam` : ''}.`);
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
      syncInProgressRef.current = false;
    }
  }, [deduplicateByCompositeKey, sendBatchWithRetry]);

  const processPendingSync = useCallback(async () => {
    const pending = pendingSyncRef.current;
    if (pending) {
      pendingSyncRef.current = null;
      console.log("Processando sincronização pendente da fila...");
      await doSync(pending);
    }
  }, [doSync]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    isInitialLoadRef.current = true;

    try {
      console.log("Buscando dados do Supabase...");
      const startTime = performance.now();

      // Colunas específicas ao invés de select('*')
      const columns = 'numero_os,contrato,data_atividade,recurso,status_atividade,tipo_atividade,cod_baixa_1,intervalo_tempo,duracao_minutos,latitude,longitude,cidade,bairro,numero_os1,tempo_de_deslocamento,contador_log,tecnico_referencia,status_execucao,is_revisita,ofensor_revisita';

      // Primeiro: descobre quantos registros existem (HEAD request, não traz dados)
      const { count, error: countError } = await externalSupabase
        .from('atividades')
        .select('id', { count: 'exact', head: true });

      if (countError) {
        throw new Error(countError.message);
      }

      const totalRows = count || 0;
      console.log(`Total de registros: ${totalRows}`);

      if (totalRows === 0) {
        console.log("Nenhum dado encontrado no Supabase.");
        setDataState([]);
        return;
      }

      // Paginação em PARALELO (Promise.all) ao invés de sequencial
      const pageSize = 1000;
      const totalPages = Math.ceil(totalRows / pageSize);

      const pagePromises = Array.from({ length: totalPages }, (_, i) =>
        externalSupabase
          .from('atividades')
          .select(columns)
          .range(i * pageSize, (i + 1) * pageSize - 1)
          .order('data_atividade', { ascending: false })
      );

      const results = await Promise.all(pagePromises);

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
      console.error("Erro ao buscar dados:", err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
    } finally {
      setIsLoading(false);
      isInitialLoadRef.current = false;
      console.log("Sistema pronto para sincronização.");
      processPendingSync();
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
