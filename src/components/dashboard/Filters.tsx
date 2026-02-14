import React, { useMemo } from 'react';
import { Eraser, Trash2, FileDown, FileSpreadsheet } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { filterExcludedServiceTypes } from '@/utils/activityHelpers';
import * as XLSX from 'xlsx';
import { Item } from '@radix-ui/react-accordion';

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, selected, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

  return (
    <div className="form-group" ref={ref}>
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
            {options.map(option => (
              <div
                key={option}
                className="multi-select-option"
                onClick={() => toggleOption(option)}
              >
                <div className={`multi-select-checkbox ${selected.includes(option) ? 'checked' : ''}`} />
                <span>{option}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const Filters: React.FC = () => {
  const { allData, filteredData, filters, setFilters, clearFilters, clearData } = useDashboard();

  const baseData = useMemo(() => filterExcludedServiceTypes(allData), [allData]);

  const technicians = useMemo(() => {
    return [...new Set(baseData.map(item => item.Recurso || '').filter(Boolean))].sort();
  }, [baseData]);

  const activityTypes = useMemo(() => {
    return [...new Set(baseData.map(item => item['Tipo de Atividade'] || '').filter(Boolean))].sort();
  }, [baseData]);

  const cities = useMemo(() => {
    return [...new Set(baseData.map(item => (item.Cidade || item.cidade || '')).filter(Boolean))].sort();
  }, [baseData]);

  const productivityOptions = [
    { value: 'all', label: 'Todas' },
    { value: 'productive', label: 'Produtivas' },
    { value: 'unproductive', label: 'Improdutivas' },
    { value: 'pending', label: 'Pendentes' },
    { value: 'cancelled', label: 'Cancelados' }
  ];

  const exportCSV = () => {
    if (filteredData.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }
    
    const headers = Object.keys(filteredData[0]);
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row =>
        headers.map(header => {
          const value = String(row[header] || '');
          return value.includes(',') || value.includes('\n') || value.includes('"')
            ? `"${value.replace(/"/g, '""')}"`
            : value;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'atividades_filtradas.csv';
    link.click();
  };

  const exportExcel = () => {
    if (filteredData.length === 0) {
      alert('Nenhum dado para exportar');
      return;
    }
    
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Atividades');
    XLSX.writeFile(wb, 'atividades_filtradas.xlsx');
  };

  const handleClearData = () => {
    if (confirm('Tem certeza que deseja limpar todos os dados?')) {
      clearData();
    }
  };

  if (allData.length === 0) return null;

  return (
    <div className="card">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span className="text-accent">🔍</span>
        Filtros Avançados
      </h3>
      
      <div className="filter-section">
        <MultiSelect
          label="Técnicos"
          options={technicians}
          selected={filters.technicians}
          onChange={(selected) => setFilters({ technicians: selected })}
        />
        
        <MultiSelect
          label="Tipo de Atividade"
          options={activityTypes}
          selected={filters.activityTypes}
          onChange={(selected) => setFilters({ activityTypes: selected })}
        />
        
        <MultiSelect
          label="Cidade"
          options={cities}
          selected={filters.cities}
          onChange={(selected) => setFilters({ cities: selected })}
        />

        <div className="form-group">
          <Label className="form-label">Produtividade</Label>

          <div className="select-wrap">
            <select
              className="select-like-multiselect w-full"
              value={filters.productivityFilter}
              onChange={(e) =>
                setFilters({
                  productivityFilter: e.target.value as 'all' | 'productive' | 'unproductive'| 'pending' | 'cancelled'
                })
              }
            >
              {productivityOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>


        <div className="form-group">
          <Label className="form-label">Data Inicial</Label>
          <Input
            type="date"
            className="form-control"
            value={filters.startDate}
            onChange={(e) => setFilters({ startDate: e.target.value })}
          />
        </div>
        
        <div className="form-group">
          <Label className="form-label">Data Final</Label>
          <Input
            type="date"
            className="form-control"
            value={filters.endDate}
            onChange={(e) => setFilters({ endDate: e.target.value })}
          />
        </div>
        
        <div className="form-group">
          <Label className="form-label">Busca Geral</Label>
          <Input
            type="text"
            className="form-control"
            placeholder="Digite para filtrar..."
            value={filters.searchText}
            onChange={(e) => setFilters({ searchText: e.target.value })}
          />
        </div>
      </div>
      
      <div className="flex gap-3 mt-6 flex-wrap">
        <Button variant="secondary" onClick={clearFilters} className="gap-2">
          <Eraser className="w-4 h-4" />
          Limpar Filtros
        </Button>
      
        <Button variant="success" onClick={exportCSV} className="gap-2">
          <FileDown className="w-4 h-4" />
          Exportar CSV
        </Button>
        <Button variant="warning" onClick={exportExcel} className="gap-2">
          <FileSpreadsheet className="w-4 h-4" />
          Exportar Excel
        </Button>
      </div>
    </div>
  );
};
