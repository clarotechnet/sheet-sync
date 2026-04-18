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

  // Envia um lote INSERT (sem conflito) com retry
  const sendInsertWithRetry = useCallback(async (
    batch: Omit<Atividade, 'id' | 'created_at'>[],
    batchNum: number,
    totalBatches: number
  ): Promise<boolean> => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error: insertError } = await externalSupabase
        .from('atividades')
        .insert(batch);

      if (!insertError) {
        return true;
      }

      if (insertError.message.includes('timeout') || insertError.message.includes('Timeout')) {
        console.warn(`Lote ${batchNum}/${totalBatches} INSERT timeout (tentativa ${attempt}/3)`);
        await new Promise(r => setTimeout(r, attempt * 1500));
      } else if (insertError.message.includes('duplicate') || insertError.message.includes('unique') || insertError.message.includes('violates')) {
        // Algum dado não foi deletado — fallback para upsert nesse lote
        console.warn(`Lote ${batchNum}/${totalBatches} duplicata, usando upsert...`);
        const { error: upsertError } = await externalSupabase
          .from('atividades')
          .upsert(batch, {
            onConflict: 'numero_os1,numero_os,contrato,data_atividade',
            ignoreDuplicates: true
          });
        return !upsertError;
      } else {
        console.warn(`Erro INSERT lote ${batchNum}/${totalBatches}:`, insertError.message);
        return false;
      }
    }
    return false;
  }, []);

  // Envia um lote UPSERT (com conflito) com retry — fallback lento
  const sendUpsertWithRetry = useCallback(async (
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
        console.warn(`Lote ${batchNum}/${totalBatches} UPSERT timeout (tentativa ${attempt}/3)`);
        await new Promise(r => setTimeout(r, attempt * 2000));
      } else {
        console.warn(`Erro UPSERT lote ${batchNum}/${totalBatches}:`, insertError.message);
        return false;
      }
    }
    return false;
  }, []);

  // Deletar dados existentes na faixa de datas (com batched fallback)
  const deleteExistingData = useCallback(async (minDate: string, maxDate: string): Promise<boolean> => {
    console.log(`Removendo dados de ${minDate} a ${maxDate}...`);

    // Tenta deletar tudo de uma vez
    const { error: deleteError } = await externalSupabase
      .from('atividades')
      .delete()
      .gte('data_atividade', minDate)
      .lte('data_atividade', maxDate);

    if (!deleteError) {
      console.log("Dados removidos com sucesso.");
      return true;
    }

    // Se timeout, deleta em lotes por ID
    if (deleteError.message.includes('timeout') || deleteError.message.includes('Timeout')) {
      console.warn("DELETE timeout, deletando em lotes...");

      let totalDeleted = 0;
      while (true) {
        // Busca IDs para deletar
        const { data: rows, error: selectErr } = await externalSupabase
          .from('atividades')
          .select('id')
          .gte('data_atividade', minDate)
          .lte('data_atividade', maxDate)
          .limit(2000);

        if (selectErr || !rows || rows.length === 0) break;

        const ids = rows.map((r: { id: number }) => r.id);
        const { error: batchDelErr } = await externalSupabase
          .from('atividades')
          .delete()
          .in('id', ids);

        if (batchDelErr) {
          console.warn("Erro ao deletar lote:", batchDelErr.message);
          return false;
        }

        totalDeleted += ids.length;
        console.log(`Deletados: ${totalDeleted} registros...`);
      }

      console.log(`Total deletado em lotes: ${totalDeleted}`);
      return true;
    }

    console.warn("Erro ao deletar:", deleteError.message);
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
      const atividadesRaw = rows.map(activityDataToAtividade);
      const atividades = deduplicateByCompositeKey(atividadesRaw);
      console.log(`Após deduplicação: ${atividades.length} registros únicos (${atividadesRaw.length - atividades.length} duplicatas removidas)`);

      // === ESTRATÉGIA: DELETE + INSERT (5-10x mais rápido que UPSERT) ===
      // UPSERT verifica conflitos em cada linha contra o índice de 4 colunas → timeout em tabelas grandes.
      // DELETE na faixa de datas + INSERT puro pula essa verificação → MUITO mais rápido.

      // Identifica a faixa de datas no arquivo
      const dates = atividades
        .map(a => a.data_atividade)
        .filter(Boolean)
        .sort() as string[];

      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      let useInsertStrategy = false;

      if (minDate && maxDate) {
        console.log(`📋 Estratégia rápida: DELETE (${minDate} → ${maxDate}) + INSERT`);
        useInsertStrategy = await deleteExistingData(minDate, maxDate);

        if (!useInsertStrategy) {
          console.warn("⚠️ DELETE falhou. Usando fallback: UPSERT sequencial (mais lento).");
        }
      } else {
        console.warn("⚠️ Sem datas válidas. Usando fallback: UPSERT sequencial.");
      }

      // Configuração baseada na estratégia
      const batchSize = useInsertStrategy ? 200 : 20;  // INSERT = rápido, UPSERT = precisa ser pequeno
      const concurrency = useInsertStrategy ? 3 : 1;   // Paralelo só para INSERT (sem lock contention)
      const totalBatches = Math.ceil(atividades.length / batchSize);
      let successCount = 0;
      let failCount = 0;
      let completedCount = 0;

      console.log(`🚀 ${useInsertStrategy ? 'INSERT' : 'UPSERT'}: ${atividades.length} registros em ${totalBatches} lotes (${batchSize}/lote, concorrência ${concurrency})`);

      // Divide em lotes
      const batches: Omit<Atividade, 'id' | 'created_at'>[][] = [];
      for (let i = 0; i < atividades.length; i += batchSize) {
        batches.push(atividades.slice(i, i + batchSize));
      }

      // Envia lotes com concorrência controlada
      for (let i = 0; i < batches.length; i += concurrency) {
        const chunk = batches.slice(i, i + concurrency);
        const promises = chunk.map((batch, idx) => {
          const batchNum = i + idx + 1;
          return useInsertStrategy
            ? sendInsertWithRetry(batch, batchNum, totalBatches)
            : sendUpsertWithRetry(batch, batchNum, totalBatches);
        });

        const results = await Promise.all(promises);

        for (const ok of results) {
          completedCount++;
          if (ok) successCount++;
          else failCount++;
        }

        // Log de progresso a cada 5% ou a cada grupo no fallback
        const pct = Math.round((completedCount / totalBatches) * 100);
        const logInterval = useInsertStrategy ? Math.max(1, Math.floor(totalBatches / 20)) : 1;
        if (completedCount % logInterval === 0 || completedCount === totalBatches) {
          console.log(`Progresso: ${pct}% (${completedCount}/${totalBatches} lotes) | ${successCount} OK, ${failCount} falhas`);
        }
      }

      lastSyncedDataRef.current = currentRef;
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Sincronização completa em ${elapsed}s! ${successCount}/${totalBatches} lotes OK.`);
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
    }
  }, [deduplicateByCompositeKey, sendInsertWithRetry, sendUpsertWithRetry, deleteExistingData]);

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
