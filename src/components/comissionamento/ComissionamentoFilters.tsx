import React, { useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { ComissionamentoFilters as FiltersType, ComissionamentoData } from '@/types/comissionamento';
import { Search, X, Upload, FileEdit, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComissionamentoFormDialog } from './ComissionamentoFormDialog';
import * as XLSX from 'xlsx';

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(s => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  return (
   <div className="form-group" ref={ref} style={{ zIndex: isOpen ? 50 : 1, position: 'relative' }}>
      <Label className="form-label">{label}</Label>
      <div className="multi-select">
        <div
          className={`multi-select-button ${isOpen ? 'open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="multi-select-text">
            {selected.length === 0 ? 'Todos' : `${selected.length} selecionado(s)`}
          </span>
          {selected.length > 0 && (
            <span className="selected-count">{selected.length}</span>
          )}
          <span className={`multi-select-arrow ${isOpen ? 'rotate-180' : ''}`}>▼</span>
        </div>

        {isOpen && (
          <div className="multi-select-dropdown open">
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border-b border-border bg-background text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {filteredOptions.map(option => (
              <div
                key={option}
                className="multi-select-option"
                onClick={() => toggleOption(option)}
              >
                <div className={`multi-select-checkbox ${selected.includes(option) ? 'checked' : ''}`} />
                <span>{option}</span>
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum resultado</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


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
 const hasFilters = filters.cidade.length > 0 || filters.dataInicio || filters.dataFim || filters.status.length > 0 || filters.nome.length > 0 || filters.frente.length > 0 || filters.contrato.length > 0 || filters.dataExecInicio || filters.dataExecFim;
    const fileInputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);

  const uniqueContratos = React.useMemo(() => {
    return [...new Set(filteredData.map(r => r.contrato).filter(Boolean))].sort() as string[];
  }, [filteredData]);

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

const statusOptions = ['PENDENTE', 'CONFIRMADA', 'CANCELADA'];

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
       <MultiSelect
          label="Frente"
          options={uniqueFrente}
          selected={filters.frente}
          onChange={(val) => setFilters({ frente: val })}
        />

        <MultiSelect
          label="Cidade / Alocação"
          options={uniqueCidades}
          selected={filters.cidade}
          onChange={(val) => setFilters({ cidade: val })}
        />

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

     <MultiSelect
          label="Status"
          options={statusOptions}
          selected={filters.status}
          onChange={(val) => setFilters({ status: val })}
        />
<MultiSelect
          label="Técnico"
          options={uniqueNomes}
          selected={filters.nome}
          onChange={(val) => setFilters({ nome: val })}
        />

        <MultiSelect
          label="Contrato"
          options={uniqueContratos}
          selected={filters.contrato}
          onChange={(val) => setFilters({ contrato: val })}
        />

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