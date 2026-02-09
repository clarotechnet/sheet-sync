import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X, Loader2 } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { ActivityData } from '@/types/activity';
import { REQUIRED_COLUMNS } from '@/config/constants';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface PendingFile {
  file: File;
  key: string;
}

interface UploadProgress {
  done: number;
  total: number;
  currentName: string;
  percent: number; // 0-100 do arquivo atual
}

export const FileUpload = React.forwardRef<HTMLDivElement>((_, ref) => {
  const { addNewData, allData, isSyncing } = useDashboard();

  const [isDragging, setIsDragging] = useState(false);

  const [pendingQueue, setPendingQueue] = useState<PendingFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    done: 0,
    total: 0,
    currentName: '',
    percent: 0,
  });

  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    message: string;
    missing?: string[];
  } | null>(null);

  const alertTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // auto-dismiss alert
  useEffect(() => {
    if (!validationResult) return;

    if (alertTimerRef.current) {
      window.clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }

    const timeoutMs = validationResult.isValid ? 3000 : 6000;

    alertTimerRef.current = window.setTimeout(() => {
      setValidationResult(null);
    }, timeoutMs);

    return () => {
      if (alertTimerRef.current) {
        window.clearTimeout(alertTimerRef.current);
        alertTimerRef.current = null;
      }
    };
  }, [validationResult]);

  const validateHeaders = (headers: string[]) => {
    const normalizedHeaders = headers.map(h => String(h || '').trim().toLowerCase());
    const missing = REQUIRED_COLUMNS.filter(col => !normalizedHeaders.includes(col.toLowerCase()));

    return {
      isValid: missing.length === 0,
      missing,
      found: REQUIRED_COLUMNS.filter(col => normalizedHeaders.includes(col.toLowerCase())),
    };
  };

  /**
   * Processa 1 arquivo com progresso por linhas
   * - Filtra Status da Atividade = "suspenso"
   * - Mantém SOMENTE a coluna correta (entre duplicadas) "Tipo de Atividade"
   *   usando a lógica de diversidade/Normal
   * - Permite cancelamento
   */
  const processFileWithProgress = useCallback(
    async (file: File, onPercent: (p: number) => void): Promise<ActivityData[]> => {
      onPercent(5);

      const arrayBuffer = await file.arrayBuffer();
      if (cancelledRef.current) return [];
      onPercent(12);

      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      if (cancelledRef.current) return [];
      onPercent(18);

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
      onPercent(22);

      if (jsonData.length < 2) {
        throw new Error('O arquivo deve conter pelo menos uma linha de cabeçalho e uma linha de dados.');
      }

      const rawHeaders = (jsonData[0] as string[]).map(h => String(h || '').trim());

      // ====== AQUI: SUA LÓGICA (exata) para escolher a coluna correta "Tipo de Atividade" ======
      // Detectar colunas duplicadas "Tipo de Atividade"
      const tipoAtividadeIndices: number[] = [];
      rawHeaders.forEach((header, index) => {
        if (String(header || '').trim().toLowerCase() === 'tipo de atividade') {
          tipoAtividadeIndices.push(index);
        }
      });

      // Se há mais de uma coluna "Tipo de Atividade", detecta qual tem conteúdo real
      // A coluna errada está toda preenchida com "Normal", a correta tem os serviços reais
      let tipoAtividadePreferredIndex = tipoAtividadeIndices[0];

      if (tipoAtividadeIndices.length > 1) {
        const dataRows = jsonData.slice(1);
        const sampleSize = Math.min(dataRows.length, 50);

        let bestIndex = tipoAtividadeIndices[0];
        let bestDiversity = 0;

        for (const colIndex of tipoAtividadeIndices) {
          const values = new Set<string>();
          let normalCount = 0;

          for (let r = 0; r < sampleSize; r++) {
            const val = String((dataRows[r] as unknown[])[colIndex] || '').trim().toLowerCase();
            if (val) {
              values.add(val);
              if (val === 'normal') normalCount++;
            }
          }

          // Calcula diversidade: mais valores únicos e menos "Normal" = melhor coluna
          const diversity = values.size - (normalCount / sampleSize) * 10;
          console.log(
            `Coluna "Tipo de Atividade" índice ${colIndex}: ${values.size} valores únicos, ${normalCount}/${sampleSize} são "Normal", score=${diversity.toFixed(
              1
            )}`
          );

          if (diversity > bestDiversity) {
            bestDiversity = diversity;
            bestIndex = colIndex;
          }
        }

        tipoAtividadePreferredIndex = bestIndex;
        console.log(`Coluna preferida para "Tipo de Atividade": índice ${tipoAtividadePreferredIndex}`);
      }

      // Criar headers únicos, marcando duplicatas para ignorar
      const headers = rawHeaders.map((header, index) => {
        const normalized = String(header || '').trim();
        if (normalized.toLowerCase() === 'tipo de atividade' && index !== tipoAtividadePreferredIndex) {
          return `__IGNORE_${index}__`;
        }
        return normalized;
      });

      // valida com base nos headers originais (sem __IGNORE_)
      const validation = validateHeaders(rawHeaders);
      if (!validation.isValid) {
        throw new Error(`Colunas ausentes: ${validation.missing.join(', ')}`);
      }
      // =======================================================================

      const dataRows = jsonData.slice(1);
      const total = dataRows.length;

      const statusHeader = rawHeaders.find(h => h.toLowerCase().trim() === 'status da atividade');

      const startPct = 22;
      const endPct = 95;

      const newData: ActivityData[] = [];
      const CHUNK_SIZE = 400;

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        if (cancelledRef.current) return [];

        const chunk = dataRows.slice(i, i + CHUNK_SIZE);

        for (const row of chunk) {
          const obj: ActivityData = {};

          headers.forEach((header, index) => {
            // ignora colunas marcadas como duplicatas
            if (String(header).startsWith('__IGNORE_')) return;

            obj[header] =
              (row as unknown[])[index] !== undefined ? String((row as unknown[])[index] || '') : '';
          });

          // remove linhas totalmente vazias
          const hasAnyValue = Object.values(obj).some(val => String(val).trim() !== '');
          if (!hasAnyValue) continue;

          // filtra "suspenso"
          if (statusHeader) {
            const status = String(obj[statusHeader] || '').toLowerCase().trim();
            if (status === 'suspenso') continue;
          }

          newData.push(obj);
        }

        const processed = Math.min(i + CHUNK_SIZE, total);
        const ratio = total === 0 ? 1 : processed / total;
        const pct = Math.round(startPct + ratio * (endPct - startPct));
        onPercent(pct);

        // deixa a UI respirar
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }

      if (newData.length === 0) {
        throw new Error('Nenhum dado válido encontrado no arquivo.');
      }

      onPercent(100);
      return newData;
    },
    []
  );

  // adicionar à fila
  const onFilesSelected = useCallback(
    (fileList: FileList | File[]) => {
      if (isUploading) return;

      const files = Array.from(fileList);

      setPendingQueue(prev => {
        const newQueue = [...prev];

        for (const file of files) {
          if (!file.name.match(/\.(csv|xlsx|xls)$/i)) continue;

          const key = `${file.name}-${file.size}-${file.lastModified}`;
          const exists = newQueue.some(x => x.key === key);
          if (!exists) newQueue.push({ file, key });
        }

        return newQueue;
      });

      setValidationResult(null);
    },
    [isUploading]
  );

  const removeFromQueue = useCallback(
    (key: string) => {
      if (isUploading) return;
      setPendingQueue(prev => prev.filter(x => x.key !== key));
    },
    [isUploading]
  );

  const cancelUploads = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  // enviar todos
  const sendAll = useCallback(
    async (concurrency = 2) => {
      if (isUploading || pendingQueue.length === 0) return;

      const sendingQueue = [...pendingQueue];
      setPendingQueue([]);
      cancelledRef.current = false;

      setIsUploading(true);
      setValidationResult(null);

      let allNewData: ActivityData[] = [];
      let done = 0;
      let index = 0;
      const errors: string[] = [];

      setUploadProgress({
        done: 0,
        total: sendingQueue.length,
        currentName: '',
        percent: 0,
      });

      const worker = async () => {
        while (true) {
          if (cancelledRef.current) return;

          const i = index++;
          if (i >= sendingQueue.length) return;

          const { file } = sendingQueue[i];

          setUploadProgress(prev => ({
            ...prev,
            currentName: file.name,
            percent: 0,
          }));

          try {
            const data = await processFileWithProgress(file, (p) => {
              setUploadProgress(prev => ({ ...prev, percent: p, currentName: file.name }));
            });

            if (data.length > 0) {
              allNewData = [...allNewData, ...data];
            }
          } catch (error) {
            errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
          }

          done++;
          setUploadProgress(prev => ({
            ...prev,
            done,
            currentName: '',
            percent: 0,
          }));
        }
      };

      try {
        const workers = Array.from({ length: Math.min(concurrency, sendingQueue.length) }, worker);
        await Promise.all(workers);

        if (cancelledRef.current) {
          setValidationResult({ isValid: false, message: 'Upload cancelado pelo usuário.' });
          return;
        }

        if (allNewData.length > 0) addNewData(allNewData);

        if (errors.length > 0) {
          setValidationResult({
            isValid: false,
            message: `${allNewData.length} registros processados. Erros: ${errors.join('; ')}`,
          });
        } else {
          setValidationResult({
            isValid: true,
            message: `${allNewData.length} registros de ${sendingQueue.length} arquivo(s) processados com sucesso!`,
          });
        }
      } catch (error) {
        setValidationResult({
          isValid: false,
          message: `Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        });
      } finally {
        setIsUploading(false);
        setUploadProgress({ done: 0, total: 0, currentName: '', percent: 0 });
      }
    },
    [isUploading, pendingQueue, addNewData, processFileWithProgress]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (isUploading) return;

      onFilesSelected(Array.from(e.dataTransfer.files));
    },
    [isUploading, onFilesSelected]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFilesSelected(files);
        e.target.value = '';
      }
    },
    [onFilesSelected]
  );

  const hasData = allData.length > 0;
  const hasPendingFiles = pendingQueue.length > 0;

  const renderPendingList = () => {
    if (!hasPendingFiles) return null;

    return (
      <div className="mt-3 space-y-2">
        <div className="text-xs text-muted-foreground font-medium">
          Arquivos na fila ({pendingQueue.length}):
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {pendingQueue.map(({ file, key }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/50 rounded text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileSpreadsheet className="w-3 h-3 text-primary shrink-0" />
                <span className="truncate">{file.name}</span>
                <span className="text-muted-foreground shrink-0">
                  ({Math.ceil(file.size / 1024)} KB)
                </span>
              </div>

              {!isUploading && (
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeFromQueue(key);
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProgress = () => {
    if (!isUploading) return null;

    const percent = uploadProgress.percent ?? 0;

    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {uploadProgress.currentName
              ? `Processando: ${uploadProgress.currentName}`
              : `Concluídos ${uploadProgress.done} de ${uploadProgress.total}`}
          </span>
          <span className="font-medium">{Math.round(percent)}%</span>
        </div>

        <Progress value={percent} className="h-2" />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={cancelUploads} className="w-full text-xs">
            Cancelar
          </Button>
        </div>
      </div>
    );
  };

  // compacta
  if (hasData && !hasPendingFiles && !isUploading) {
    return (
      <div ref={ref} className="opacity-50 hover:opacity-100 transition-opacity duration-300">
        <div
          className={`flex items-center justify-between gap-3 px-4 py-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 cursor-pointer transition-all ${
            isDragging ? 'border-primary bg-primary/5' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput')?.click()}
        >
          <input
            type="file"
            id="fileInput"
            accept=".csv,.xlsx,.xls"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />

          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{allData.length} registros</span>
          </div>

          <button className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
            <Upload className="w-3 h-3" />
            Adicionar
          </button>
        </div>

        {validationResult && (
          <div className={`alert ${validationResult.isValid ? 'alert-success' : 'alert-error'} mt-2 text-xs`}>
            {validationResult.isValid ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            <small>{validationResult.message}</small>
          </div>
        )}
      </div>
    );
  }

  const showSyncHint = !isUploading && isSyncing;

  return (
    <div ref={ref} className="card">
      <div
        className={`upload-area ${isDragging ? 'dragover' : ''} ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && document.getElementById('fileInput')?.click()}
      >
        <input
          type="file"
          id="fileInput"
          accept=".csv,.xlsx,.xls"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        <div className="upload-icon">
          {isUploading ? <Loader2 className="w-12 h-12 animate-spin" /> : <FileSpreadsheet className="w-12 h-12" />}
        </div>

        <h3 className="upload-title">
          {isUploading ? 'Enviando arquivos...' : hasPendingFiles ? `${pendingQueue.length} arquivo(s) na fila` : 'Arraste seus arquivos aqui'}
        </h3>

        <p className="upload-subtitle">
          {isUploading ? 'Aguarde o processamento...' : 'ou clique para selecionar (CSV, XLSX) - múltiplos arquivos'}
        </p>

        {!isUploading && !hasPendingFiles && (
          <button className="btn btn-primary">
            <Upload className="w-4 h-4" />
            Selecionar Arquivos
          </button>
        )}
      </div>

      {renderPendingList()}

      {hasPendingFiles && !isUploading && (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => sendAll(2)} className="flex-1">
            <Upload className="w-4 h-4 mr-2" />
            Enviar {pendingQueue.length} arquivo(s)
          </Button>
          <Button variant="outline" onClick={() => setPendingQueue([])}>
            Limpar
          </Button>
        </div>
      )}

      {renderProgress()}

      {showSyncHint && (
        <p className="mt-3 text-xs text-muted-foreground text-center">
          Sincronizando com Google Sheets...
        </p>
      )}

      {validationResult && !isUploading && (
        <div className={`alert ${validationResult.isValid ? 'alert-success' : 'alert-error'} mt-4`}>
          {validationResult.isValid ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <div>
            <strong>{validationResult.isValid ? 'Sucesso!' : 'Erro'}</strong>
            <br />
            <small>{validationResult.message}</small>
          </div>
        </div>
      )}
    </div>
  );
});

FileUpload.displayName = 'FileUpload';
