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

  //   const fetchData = useCallback(async () => {
  //     setIsLoading(true);
  //     setError(null);
  //     isInitialLoadRef.current = true;

  //     try {
  //       console.log("Buscando dados do Supabase...");

  //       // Busca todas as atividades - usando paginação para evitar limite de 1000
  //       let allData: Atividade[] = [];
  //       let page = 0;
  //       const pageSize = 1000;
  //       let hasMore = true;

  //       while (hasMore) {
  //         const { data: atividades, error: fetchError } = await externalSupabase
  //           .from('atividades')
  //           .select('*')
  //           .range(page * pageSize, (page + 1) * pageSize - 1)
  //           .order('data_atividade', { ascending: false });

  //         if (fetchError) {
  //           throw new Error(fetchError.message);
  //         }

  //         if (atividades && atividades.length > 0) {
  //           allData = [...allData, ...atividades];
  //           page++;
  //           hasMore = atividades.length === pageSize;
  //         } else {
  //           hasMore = false;
  //         }
  //       }

  //       if (allData.length > 0) {
  //         console.log(`Dados recebidos: ${allData.length} linhas.`);
  //         const convertedData = allData.map(atividadeToActivityData) as ActivityData[];
  //         setDataState(convertedData);
  //         lastSyncedDataRef.current = JSON.stringify(convertedData);
  //       } else {
  //         console.log("Nenhum dado encontrado no Supabase.");
  //         setDataState([]);
  //       }
  //     } catch (err) {
  //       console.error("Erro ao buscar dados:", err);
  //       setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
  //     } finally {
  //       setIsLoading(false);
  //       setTimeout(() => {
  //         isInitialLoadRef.current = false;
  //         console.log("Sistema pronto para sincronização.");
  //       }, 2000);
  //     }
  //   }, []);

  // // Observação importante: para o UPSERT funcionar, o índice/constraint no banco precisa ser
  //   // em cima das COLUNAS (numero_os1,numero_os,contrato,data_atividade) e essas colunas devem
  //   // ser NOT NULL (com defaults). Índice com COALESCE causa 409 mesmo com upsert.
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
        // ISO: 2026-01-26T00:00:00.000Z
        if (s.includes('T')) return s.split('T')[0];
        // "2026-01-26 00:00:00"
        if (s.includes(' ')) return s.split(' ')[0];
        return s;
        // return s; // já deve estar YYYY-MM-DD
      };

      const seen = new Map<string, Omit<Atividade, 'id' | 'created_at'>>();

      for (const item of atividades) {
        const numero_os1 = normalizeTextKey(item.numero_os1);
        const numero_os = normalizeTextKey(item.numero_os);
        const contrato = normalizeTextKey(item.contrato);
        const data_atividade = normalizeDateKey(item.data_atividade);

        const key = `${numero_os1}|${numero_os}|${contrato}|${data_atividade}`;

        // também normaliza o que vai ser enviado pro banco
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

  //  const syncData = useCallback(async (rows: ActivityData[]) => {
  //   if (isInitialLoadRef.current) {
  //     console.log("Sincronização bloqueada - carregamento inicial em andamento.");
  //     return;
  //   }
  const doSync = useCallback(async (rows: ActivityData[]) => {
    // Comparação leve: usa length + timestamp ao invés de JSON.stringify de todos os dados
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
    console.log(`Sincronizando ${rows.length} registros com Supabase...`);

    try {
      // Converte para formato do banco
      const atividadesRaw = rows.map(activityDataToAtividade);

      // Deduplica pelo conjunto de 4 campos antes de enviar (evita erro "cannot affect row a second time")
      const atividades = deduplicateByCompositeKey(atividadesRaw);
      console.log(`Após deduplicação: ${atividades.length} registros únicos (${atividadesRaw.length - atividades.length} duplicatas removidas)`);

      // Insere em lotes de 100
      const batchSize = 100;
      for (let i = 0; i < atividades.length; i += batchSize) {
        const batch = atividades.slice(i, i + batchSize);

        // Upsert com chave composta de 4 campos
        const { error: insertError } = await externalSupabase
          .from('atividades')
          .upsert(batch, {
            onConflict: 'numero_os1,numero_os,contrato,data_atividade',
            ignoreDuplicates: false
          });

        if (insertError) {
          console.warn(`Erro no lote ${Math.floor(i / batchSize) + 1}:`, insertError.message);
        } else {
          console.log(`Lote ${Math.floor(i / batchSize) + 1} enviado com sucesso.`);
        }
      }

      lastSyncedDataRef.current = currentRef;
      console.log("Sincronização completa!");
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
    }
  }, [deduplicateByCompositeKey]);

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
      const columns = 'numero_os,contrato,data_atividade,recurso,status_atividade,tipo_atividade,cod_baixa_1,intervalo_tempo,duracao_minutos,latitude,longitude,cidade,bairro,numero_os1,tempo_de_deslocamento,contador_log,tecnico_referencia,status_execucao';

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

    // if (!isInitialLoadRef.current) {
    //   lastSyncedDataRef.current = '';
    //   syncData(newData);
    // } else {
    //   console.log("Upload durante carregamento - sincronização será feita após carregar.");
    //   setTimeout(() => {
    //     lastSyncedDataRef.current = '';
    //     syncData(newData);
    //   }, 2500);
    // } lastSyncedDataRef.current = '';
    +    syncData(newData);
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