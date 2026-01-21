import React, { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { ActivityData } from '@/types/activity';
import { REQUIRED_COLUMNS } from '@/config/constants';
import * as XLSX from 'xlsx';

export const FileUpload: React.FC = () => {
  const { addNewData, allData } = useDashboard();
  const [isDragging, setIsDragging] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    message: string;
    missing?: string[];
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const validateHeaders = (headers: string[]) => {
    const normalizedHeaders = headers.map(h => String(h || '').trim().toLowerCase());
    const missing = REQUIRED_COLUMNS.filter(
      col => !normalizedHeaders.includes(col.toLowerCase())
    );
    return {
      isValid: missing.length === 0,
      missing,
      found: REQUIRED_COLUMNS.filter(col => 
        normalizedHeaders.includes(col.toLowerCase())
      )
    };
  };

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setValidationResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

      if (jsonData.length < 2) {
        setValidationResult({
          isValid: false,
          message: 'O arquivo deve conter pelo menos uma linha de cabeçalho e uma linha de dados.'
        });
        setIsProcessing(false);
        return;
      }

      const headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
      const validation = validateHeaders(headers);

      if (!validation.isValid) {
        setValidationResult({
          isValid: false,
          message: `Colunas ausentes: ${validation.missing.join(', ')}`,
          missing: validation.missing
        });
        setIsProcessing(false);
        return;
      }

      const dataRows = jsonData.slice(1);
      const newData: ActivityData[] = dataRows
        .map(row => {
          const obj: ActivityData = {};
          headers.forEach((header, index) => {
            obj[header] = (row as unknown[])[index] !== undefined 
              ? String((row as unknown[])[index] || '') 
              : '';
          });
          return obj;
        })
        .filter(row => Object.values(row).some(val => String(val).trim() !== ''));

      if (newData.length === 0) {
        setValidationResult({
          isValid: false,
          message: 'Nenhum dado válido encontrado no arquivo.'
        });
        setIsProcessing(false);
        return;
      }

      // Adiciona os novos dados (merge com existentes)
      addNewData(newData);

      setValidationResult({
        isValid: true,
        message: `${newData.length} registros processados com sucesso!`
      });
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      setValidationResult({
        isValid: false,
        message: `Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
      });
    } finally {
      setIsProcessing(false);
    }
  }, [addNewData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(f => 
      f.name.endsWith('.csv') || 
      f.name.endsWith('.xlsx') || 
      f.name.endsWith('.xls')
    );

    if (validFile) {
      processFile(validFile);
    }
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const hasData = allData.length > 0;

  // Versão compacta quando já tem dados
  if (hasData) {
    return (
      <div className="card p-4">
        <div
          className={`upload-area compact ${isDragging ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput')?.click()}
          style={{ padding: '1rem 1.5rem', minHeight: 'auto' }}
        >
          <input
            type="file"
            id="fileInput"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-3">
              {isProcessing ? (
                <div className="spinner w-5 h-5" />
              ) : (
                <FileSpreadsheet className="w-5 h-5 text-primary" />
              )}
              <div>
                <span className="text-sm font-medium text-foreground">
                  {isProcessing ? 'Processando...' : `${allData.length} registros carregados`}
                </span>
              </div>
            </div>

            <button className="btn btn-primary text-sm py-2 px-4" disabled={isProcessing}>
              <Upload className="w-4 h-4" />
              Adicionar mais
            </button>
          </div>
        </div>

        {validationResult && (
          <div className={`alert ${validationResult.isValid ? 'alert-success' : 'alert-error'} mt-3`}>
            {validationResult.isValid ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <div>
              <strong className="text-sm">{validationResult.isValid ? 'Sucesso!' : 'Erro'}</strong>
              <br />
              <small>{validationResult.message}</small>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Versão completa quando não tem dados
  return (
    <div className="card">
      <div
        className={`upload-area ${isDragging ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <input
          type="file"
          id="fileInput"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        <div className="upload-icon">
          {isProcessing ? (
            <div className="spinner" />
          ) : (
            <FileSpreadsheet className="w-12 h-12" />
          )}
        </div>
        
        <h3 className="upload-title">
          {isProcessing ? 'Processando...' : 'Arraste seus arquivos aqui'}
        </h3>
        <p className="upload-subtitle">
          ou clique para selecionar (CSV, XLSX)
        </p>
        
        <button className="btn btn-primary" disabled={isProcessing}>
          <Upload className="w-4 h-4" />
          Selecionar Arquivo
        </button>
      </div>

      {validationResult && (
        <div className={`alert ${validationResult.isValid ? 'alert-success' : 'alert-error'} mt-4`}>
          {validationResult.isValid ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <div>
            <strong>{validationResult.isValid ? 'Sucesso!' : 'Erro'}</strong>
            <br />
            <small>{validationResult.message}</small>
          </div>
        </div>
      )}
    </div>
  );
};
