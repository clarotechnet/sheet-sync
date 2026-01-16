import { useState, useCallback, useRef } from 'react';
import { ActivityData } from '@/types/activity';
import { SHEETS_WEBAPP_URL, SHEET_TIPO } from '@/config/constants';

interface UseGoogleSheetsReturn {
  data: ActivityData[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  fetchData: () => Promise<void>;
  syncData: (rows: ActivityData[]) => Promise<void>;
  setData: (data: ActivityData[]) => void;
  mergeNewData: (newData: ActivityData[]) => void;
}

export const useGoogleSheets = (): UseGoogleSheetsReturn => {
  const [data, setDataState] = useState<ActivityData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Flag para evitar sincronização durante carregamento inicial
  const isInitialLoadRef = useRef(true);
  const lastSyncedDataRef = useRef<string>('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    isInitialLoadRef.current = true;
    
    try {
      console.log("Buscando dados do Google Sheets...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); 
      
      const res = await fetch(SHEETS_WEBAPP_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();

      if (json.status === "ok" && json.data && json.data.length > 0) {
        console.log(`Dados recebidos: ${json.data.length} linhas.`);
        setDataState(json.data);
        // Armazena hash dos dados para comparação
        lastSyncedDataRef.current = JSON.stringify(json.data);
      } else {
        console.log("Nenhum dado encontrado no Google Sheets ou resposta vazia.");
        setDataState([]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error("Timeout ao buscar dados do Google Sheets");
        setError('Tempo limite excedido ao conectar com Google Sheets');
      } else {
        console.error("Erro ao buscar dados:", err);
        setError(err instanceof Error ? err.message : 'Erro ao buscar dados');
      }
    } finally {
      setIsLoading(false);
      // Aguarda antes de liberar sincronização
      setTimeout(() => {
        isInitialLoadRef.current = false;
        console.log("Sistema pronto para sincronização.");
      }, 2000);
    }
  }, []);

  const syncData = useCallback(async (rows: ActivityData[]) => {
    // Evita sincronização durante carregamento inicial
    if (isInitialLoadRef.current) {
      console.log("Sincronização bloqueada - carregamento inicial em andamento.");
      return;
    }

    // Evita sincronização de dados idênticos
    const currentDataHash = JSON.stringify(rows);
    if (currentDataHash === lastSyncedDataRef.current) {
      console.log("Dados idênticos aos já sincronizados - pulando envio.");
      return;
    }

    if (!rows || rows.length === 0) {
      console.log("Nenhum dado para sincronizar.");
      return;
    }

    setIsSyncing(true);
    console.log(`Sincronizando ${rows.length} registros com Google Sheets...`);

    try {
      const batchSize = 200;
      const batches: ActivityData[][] = [];
      
      for (let i = 0; i < rows.length; i += batchSize) {
        batches.push(rows.slice(i, i + batchSize));
      }

      for (let i = 0; i < batches.length; i++) {
        const payload = { rows: batches[i], tipo: SHEET_TIPO };
        
        const res = await fetch(SHEETS_WEBAPP_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        });
        
        const responseText = await res.text();
        if (responseText.trim().toUpperCase() === "OK") {
          console.log(`Lote ${i + 1}/${batches.length} enviado com sucesso.`);
        } else {
          console.warn(`Resposta inesperada no lote ${i + 1}:`, responseText);
        }
      }
      
      lastSyncedDataRef.current = currentDataHash;
      console.log("Sincronização completa!");
    } catch (err) {
      console.error("Erro na sincronização:", err);
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const setData = useCallback((newData: ActivityData[]) => {
    setDataState(newData);
  }, []);

  // Função para SUBSTITUIR os dados (upload de arquivo = substituição completa)
  const mergeNewData = useCallback((newData: ActivityData[]) => {
    // Upload de arquivo SUBSTITUI os dados existentes (não faz merge)
    console.log(`Substituindo dados: ${newData.length} registros do arquivo.`);
    
    // Atualiza o estado local
    setDataState(newData);
    
    // Sincroniza com o Sheets ANTES de atualizar o hash
    // (para que syncData não ache que os dados são idênticos)
    if (!isInitialLoadRef.current) {
      // Força a sincronização limpando o hash antes
      lastSyncedDataRef.current = '';
      syncData(newData);
    } else {
      // Se ainda em carregamento inicial, agenda a sincronização
      console.log("Upload durante carregamento - sincronização será feita após carregar.");
      setTimeout(() => {
        lastSyncedDataRef.current = '';
        syncData(newData);
      }, 2500);
    }
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
