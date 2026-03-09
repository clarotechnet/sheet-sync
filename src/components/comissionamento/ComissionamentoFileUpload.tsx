import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onImport: (file: File) => Promise<number>;
  isLoading: boolean;
}

export const ComissionamentoFileUpload: React.FC<Props> = ({ onImport, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setResult({ ok: false, message: 'Formato inválido. Use XLSX, XLS ou CSV.' });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const count = await onImport(file);
      setResult({ ok: true, message: `${count} registros importados com sucesso!` });
    } catch (err: any) {
      setResult({ ok: false, message: err.message || 'Erro ao importar' });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="card">
      <div
        className={`upload-area ${isDragging ? 'dragover' : ''} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          disabled={uploading}
        />
        <div className="upload-icon">
          {uploading ? <Loader2 className="w-12 h-12 animate-spin" /> : <FileSpreadsheet className="w-12 h-12" />}
        </div>
        <h3 className="upload-title">
          {uploading ? 'Importando dados...' : 'Importar Planilha de Comissionamento'}
        </h3>
        <p className="upload-subtitle">
          Arraste ou clique para selecionar o arquivo
        </p>
        {!uploading && (
          <button className="btn btn-primary">
            <Upload className="w-4 h-4" /> Selecionar Arquivo
          </button>
        )}
      </div>

      {result && (
        <div className={`alert ${result.ok ? 'alert-success' : 'alert-error'} mt-4`}>
          {result.ok ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
};