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

  // Envia um único lote com retry automático em caso de timeout
  const sendBatchWithRetry = useCallback(async (
    batch: Omit<Atividade, 'id' | 'created_at'>[],
    batchNum: number,
    totalBatches: number
  ): Promise<boolean> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: insertError } = await externalSupabase
        .from('atividades')
        .upsert(batch, {
          onConflict: 'numero_os1,numero_os,contrato,data_atividade',
          ignoreDuplicates: false
        });

      if (!insertError) {
        return true;
      }

      if (insertError.message.includes('timeout') || insertError.message.includes('Timeout')) {
        console.warn(`Lote ${batchNum}/${totalBatches} timeout (tentativa ${attempt}/3), aguardando...`);
        await new Promise(r => setTimeout(r, attempt * 2000));
      } else {
        console.warn(`Erro no lote ${batchNum}/${totalBatches}:`, insertError.message);
        return false;
      }
    }
    return false;
  }, []);

  const doSync = useCallback(async (rows: ActivityData[]) => {
    const currentRef = String(rows.length);
    if (currentRef === lastSyncedDataRef.current && rows.length > 0) {
      console.log("Quantidade de dados idêntica — possível duplicata de sincronização, pulando.");
      return;
    }

    if (!rows || rows.length === 0) {
      console.log("Nenhum dado para sincronizar.");
      return;
    }

    setIsSyncing(true);
    const startTime = performance.now();
    console.log(`Sincronizando ${rows.length} registros com Supabase...`);

    try {
      // Converte para formato do banco
      const atividadesRaw = rows.map(activityDataToAtividade);

      // Deduplica pelo conjunto de 4 campos antes de enviar
      const atividades = deduplicateByCompositeKey(atividadesRaw);
      console.log(`Após deduplicação: ${atividades.length} registros únicos (${atividadesRaw.length - atividades.length} duplicatas removidas)`);

      // Configuração otimizada: lotes de 75 com 3 requisições paralelas
      const batchSize = 75;
      const concurrency = 3;
      const totalBatches = Math.ceil(atividades.length / batchSize);
      let successCount = 0;
      let failCount = 0;
      let completedCount = 0;

      // Divide em lotes
      const batches: Omit<Atividade, 'id' | 'created_at'>[][] = [];
      for (let i = 0; i < atividades.length; i += batchSize) {
        batches.push(atividades.slice(i, i + batchSize));
      }

      // Envia lotes em paralelo com limite de concorrência
      for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency);
        const promises = chunk.map((batch, idx) => {
          const batchNum = i + idx + 1;
          return sendBatchWithRetry(batch, batchNum, totalBatches);
        });

        const results = await Promise.all(promises);

        for (const ok of results) {
          completedCount++;
          if (ok) successCount++;
          else failCount++;
        }

        // Log de progresso a cada grupo
        const pct = Math.round((completedCount / totalBatches) * 100);
        console.log(`Progresso: ${pct}% (${completedCount}/${totalBatches} lotes)`);
      }

      lastSyncedDataRef.current = currentRef;
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`Sincronização completa em ${elapsed}s! ${successCount} lotes OK, ${failCount} falharam.`);
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
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
