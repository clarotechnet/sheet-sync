import React, { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { ComissionamentoFilters as FiltersType, ComissionamentoData } from '@/types/comissionamento';
import { Search, X, Upload, FileEdit, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComissionamentoFormDialog } from './ComissionamentoFormDialog';
import * as XLSX from 'xlsx';

interface Props {
  filters: FiltersType;
  setFilters: (f: Partial<FiltersType>) => void;
  clearFilters: () => void;
  uniqueCidades: string[];
  uniqueNomes: string[];
  uniqueFrente: string[];
  totalFiltered: number;
  onImport: (file: File) => Promise<number>;
  onManualSubmit: (data: Record<string, any>) => Promise<void>;
  isLoading: boolean;
  filteredData: ComissionamentoData[];
}

export const ComissionamentoFilters: React.FC<Props> = ({
  filters, setFilters, clearFilters, uniqueCidades, uniqueNomes, uniqueFrente, totalFiltered,
    onImport, onManualSubmit, isLoading, filteredData
}) => {
  const hasFilters = filters.cidade || filters.dataInicio || filters.dataFim || filters.status || filters.nome || filters.frente || filters.contrato || filters.dataExecInicio || filters.dataExecFim;
    const fileInputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try { await onImport(file); } catch {}
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

    const handleExportExcel = () => {
    const fmtDate = (val: string | null) => {
      if (!val) return '';
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[3]}/${match[2]}/${match[1]}`;
      return val;
    };
    const exportRows = filteredData.map(row => ({
      'Nome': row.nome || '',
      'Cidade/Alocação': row.alocacao || '',
      'Mês': row.data ? fmtDate(row.data) : '',
      'Status': row.status || '',
      'Contrato': row.contrato || '',
      'Data Exec.': fmtDate(row.data_exec),
      'Tipo Venda': row.tipo_venda || '',
      'Proposta': row.proposta || '',
      'Valores': row.valores ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comissionamento');
    XLSX.writeFile(wb, 'comissionamento.xlsx');
  };



  return (
    <div className="card">
      <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
        <h3 className="text-lg font-bold text-foreground">Filtros</h3>
          <div className="flex items-center gap-3 flex-wrap">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="gap-1">
            <Upload className="w-4 h-4" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)} className="gap-1">
            <FileEdit className="w-4 h-4" /> Preencher Formulário
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={filteredData.length === 0} className="gap-1">
            <Download className="w-4 h-4" /> Exportar Excel
          </Button>
          <span className="text-sm text-muted-foreground">
            Total: <strong className="text-foreground">{totalFiltered}</strong> registros
          </span>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1">
              <X className="w-3 h-3" /> Limpar
            </Button>
          )}
        </div>
      </div>

      <ComissionamentoFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={onManualSubmit}
        uniqueNomes={uniqueNomes}
        uniqueCidades={uniqueCidades}
      />


      <div className="filter-section">
        {/* Frente */}
        <div className="form-group">
          <Label className="form-label">Frente</Label>
          <select
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.frente}
            onChange={e => setFilters({ frente: e.target.value })}
          >
            <option value="">Todas</option>
            {uniqueFrente.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {/* Cidade */}
        <div className="form-group">
          <Label className="form-label">Cidade / Alocação</Label>
          <select
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.cidade}
            onChange={e => setFilters({ cidade: e.target.value })}
          >
            <option value="">Todas</option>
            {uniqueCidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

     {/* Data Inicial */}
        <div className="form-group">
          <Label className="form-label">Data Inicial Agendamento</Label>
          <input
            type="date"
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.dataInicio}
            onChange={e => setFilters({ dataInicio: e.target.value })}
          />
        </div>

        {/* Data Final */}
        <div className="form-group">
          <Label className="form-label">Data Final Agendamento</Label>
          <input
            type="date"
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.dataFim}
            onChange={e => setFilters({ dataFim: e.target.value })}
          />
        </div>

        {/* Status */}
        <div className="form-group">
          <Label className="form-label">Status</Label>
          <select
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.status}
            onChange={e => setFilters({ status: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>

        {/* Nome */}
        <div className="form-group">
          <Label className="form-label">Técnico</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              className="form-control bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-foreground w-full"
              placeholder="Buscar por nome..."
              value={filters.nome}
              onChange={e => setFilters({ nome: e.target.value })}
              list="nomes-list"
            />
            <datalist id="nomes-list">
              {uniqueNomes.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
        </div>
         {/* Contrato */}
        <div className="form-group">
          <Label className="form-label">Contrato</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              className="form-control bg-card border border-border rounded-lg pl-9 pr-3 py-2 text-foreground w-full"
              placeholder="Buscar por contrato..."
              value={filters.contrato}
              onChange={e => setFilters({ contrato: e.target.value })}
            />
          </div>
        </div>

        {/* Data Executada Inicial */}
        <div className="form-group">
          <Label className="form-label">Data Exec. Inicial</Label>
          <input
            type="date"
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.dataExecInicio}
            onChange={e => setFilters({ dataExecInicio: e.target.value })}
          />
        </div>

        {/* Data Executada Final */}
        <div className="form-group">
          <Label className="form-label">Data Exec. Final</Label>
          <input
            type="date"
            className="form-control bg-card border border-border rounded-lg px-3 py-2 text-foreground w-full"
            value={filters.dataExecFim}
            onChange={e => setFilters({ dataExecFim: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};