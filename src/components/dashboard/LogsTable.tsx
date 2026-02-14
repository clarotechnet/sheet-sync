import React, { useState, useMemo, useEffect } from 'react';
import { FileText, ArrowUpAZ, ArrowDownAZ, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { getActivityStatus } from '@/utils/activityHelpers';
import { Button } from '@/components/ui/button';

type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE = 100;

export const LogsTable: React.FC = () => {
  const { filteredData } = useDashboard();
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter only items that have a value in "Contador Log"
  const logsData = useMemo(() => {
    return filteredData.filter(item => {
      const contadorLog = String(item['Contador Log'] ?? '').trim();
      return contadorLog !== '';
    });
  }, [filteredData]);

  const sortedData = useMemo(() => {

    return [...logsData].sort((a, b) => {
      const logA = String(a['Contador Log'] ?? '').toLowerCase();
      const logB = String(b['Contador Log'] ?? '').toLowerCase();

      if (sortOrder === 'asc') {
        return logA.localeCompare(logB, 'pt-BR');
      } else {
        return logB.localeCompare(logA, 'pt-BR');
      }
    });
  }, [logsData, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [logsData]);

  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedData.slice(startIndex, endIndex);
  }, [sortedData, currentPage]);

  const toggleSort = () => {
    setSortOrder(current => current === 'asc' ? 'desc' : 'asc');
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (currentPage < totalPages - 2) pages.push('...');
      if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    return pages;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Produtiva':
        return '#228B22';
      case 'Improdutiva':
        return '#FF0000';
      case 'Cancelado':
        return '#8B4513';
      default:
        return '#f5a623';
    }
  };

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">
          <FileText className="w-5 h-5" />
          Logs
        </h3>
        <div className="flex items-center gap-4">
          <span className="record-count">
            {logsData.length} registro{logsData.length !== 1 ? 's' : ''} com log
          </span>
          {totalPages > 1 && (
            <span className="text-xs text-muted-foreground">
              Página {currentPage} de {totalPages}
            </span>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Técnico Ofensor</th>
              <th 
                onClick={toggleSort}
                className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                title={sortOrder === 'asc' ? 'Ordenar Z-A' : 'Ordenar A-Z'}
              >
                <div className="flex items-center gap-2">
                  Contador de Log
                  {sortOrder === 'asc' && <ArrowUpAZ className="w-4 h-4 text-primary" />}
                  {sortOrder === 'desc' && <ArrowDownAZ className="w-4 h-4 text-primary" />}
                </div>
              </th>
 
              <th>Tipo de Atividade</th>
              <th>Contrato</th>
              <th>Cód de Baixa 1</th>
              <th>Status</th>
              <th>Data</th>
              <th>Intervalo de Tempo</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  Nenhum registro com log encontrado
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const status = getActivityStatus(item);
                return (
                  <tr key={`${currentPage}-${index}`}>
                    <td>{item['Técnico Referência'] || 'N/A'}</td>
                    <td>{item['Contador Log'] || 'N/A'}</td>
                    <td>{item['Tipo de Atividade'] || 'N/A'}</td>
                    <td>{item.Contrato || item.contrato || 'N/A'}</td>
                    <td>{item['Cód de Baixa 1'] || 'N/A'}</td>
                    <td>
                      <span style={{ color: getStatusColor(status), fontWeight: 600 }}>
                        {status}
                      </span>
                    </td>
                    <td>{item.Data || 'N/A'}</td>
                    <td>{item['Intervalo de Tempo'] || 'N/A'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} de {sortedData.length}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {getPageNumbers().map((page, idx) => (
              typeof page === 'number' ? (
                <Button
                  key={idx}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => goToPage(page)}
                  className="h-8 w-8 p-0"
                >
                  {page}
                </Button>
              ) : (
                <span key={idx} className="px-2 text-muted-foreground">...</span>
              )
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};