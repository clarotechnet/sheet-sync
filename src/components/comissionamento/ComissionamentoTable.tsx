import React, { useState, useMemo } from 'react';
import { ComissionamentoData } from '@/types/comissionamento';
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComissionamentoEditDialog } from './ComissionamentoEditDialog';

interface Props {
  data: ComissionamentoData[];
  onUpdate: (id: string, updates: Partial<ComissionamentoData>) => Promise<void>;
  uniqueNomes: string[];
  uniqueCidades: string[];
}

const PAGE_SIZE = 50;

const formatDate = (val: string | null) => {
  if (!val) return '-';
  // ISO to BR
  const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return val;
};

const statusColor = (s: string | null) => {
  switch (s) {
    case 'CONFIRMADA': return '#22c55e';
    case 'PENDENTE': return '#f59e0b';
    case 'CANCELADA': return '#3b82f6';
    default: return 'hsl(223 16% 70%)';
  }
};

export const ComissionamentoTable: React.FC<Props> = ({ data, onUpdate, uniqueNomes, uniqueCidades }) => {
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<string>('nome');
  const [sortAsc, setSortAsc] = useState(true);
  const [editRecord, setEditRecord] = useState<ComissionamentoData | null>(null);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const va = (a as any)[sortField] || '';
      const vb = (b as any)[sortField] || '';
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [data, sortField, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };


  const columns = [
    { key: 'actions', label: '' },
    { key: 'nome', label: 'Nome' },
    { key: 'alocacao', label: 'Cidade/Alocação' },
    { key: 'data', label: 'Mês' },
    { key: 'status', label: 'Status' },
    { key: 'contrato', label: 'Contrato' },
    { key: 'data_exec', label: 'Data Exec.' },
    { key: 'tipo_venda', label: 'Tipo Venda' },
    { key: 'proposta', label: 'Proposta' },
    { key: 'valores', label: 'Valores' },
  ];

  return (
        <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onClick={col.key !== 'actions' ? () => handleSort(col.key) : undefined}
                    className={`whitespace-nowrap ${col.key !== 'actions' ? 'cursor-pointer hover:text-primary transition-colors' : 'w-10'}`}
                  >
                            {col.label} {sortField === col.key ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                ))}
              </tr>

                   </thead>
            <tbody>
              {pageData.map((row, i) => (
                <tr key={row.id || i}>
                  <td className="w-10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditRecord(row)}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                  </td>
                  <td className="font-medium">{row.nome}</td>
                  <td>{row.alocacao || '-'}</td>
                  <td>
                {row.data
                    ? new Date(row.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                    : '-'}
                </td>
                  <td>
                    <span
                      className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: `${statusColor(row.status)}20`,
                        color: statusColor(row.status)
                      }}
                    >
                      {row.status || '-'}
                    </span>
                  </td>
                  <td>{row.contrato || '-'}</td>
                  <td>{formatDate(row.data_exec)}</td>
                  <td>{row.tipo_venda || '-'}</td>
                  <td>{row.proposta || '-'}</td>
                  <td>
                    {row.valores != null
                      ? `R$ ${row.valores.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
           
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages} ({sorted.length} registros)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
         )}
      </div>

      <ComissionamentoEditDialog
        open={!!editRecord}
        onClose={() => setEditRecord(null)}
        onSave={onUpdate}
        record={editRecord}
        uniqueNomes={uniqueNomes}
        uniqueCidades={uniqueCidades}
      />
    </>
  );
};