import React, { useState, useMemo, useEffect } from 'react';
import { Table, ArrowUpAZ, ArrowDownAZ, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { useAuth } from '@/contexts/AuthContext';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { brToIsoDate } from '@/types/atividade';
import { Button } from '@/components/ui/button';
import { getActivityStatus } from '@/utils/activityHelpers';

type SortOrder = 'none' | 'asc' | 'desc';

const ITEMS_PER_PAGE = 100;
const STATUS_OPTIONS = ['Produtiva', 'Pendente', 'Improdutiva'] as const;

export const DataTable: React.FC = () => {
  const { filteredData, refreshData } = useDashboard();
  const { isAdmin } = useAuth();

  const [sortOrder, setSortOrder] = useState<SortOrder>('none');
  const [currentPage, setCurrentPage] = useState(1);

  const [editRowKey, setEditRowKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ status: string; cod: string } | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // --- helpers para lidar com nomes de colunas (com/sem acento, com encoding diferente) ---
  const pick = (item: Record<string, string | undefined>, keys: string[]) => {
    for (const k of keys) {
      const v = item[k];
      if (v != null && String(v).trim() !== '') return v;
    }
    return undefined;
  };

  const getCodBaixa = (item: Record<string, string | undefined>) => {
    return (
      pick(item, ['Cód de Baixa 1', 'CÃ³d de Baixa 1', 'Cod de Baixa 1']) ||
      ''
    );
  };

  const getNumericCode = (cod: string) => {
    const m = (cod || '').match(/^(\d+)/);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  };

  // regra principal: se tem código numérico, ele manda (>=409 produtiva, <409 improdutiva)
  const computeStatus = (item: Record<string, string | undefined>, draft?: { status?: string; cod?: string }) => {
    const cod = (draft?.cod ?? getCodBaixa(item) ?? '').trim();
    const numeric = getNumericCode(cod);

    if (numeric != null) {
      return numeric >= 409 ? 'Produtiva' : 'Improdutiva';
    }

    // sem código: usa seu helper
    if (draft?.status) return draft.status;
    return getActivityStatus(item);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Produtiva':
        return '#228B22';
      case 'Improdutiva':
        return '#FF0000';
      default:
        return '#f5a623';
    }
  };

  // chave de linha (estável por página)
  const getRowKey = (item: Record<string, string | undefined>, globalIndex: number) => {
    const numeroWo = pick(item, ['Número da WO', 'NÃºmero da WO', 'Numero da WO']) || '';
    const numeroOs1 = pick(item, ['Número da O.S 1', 'NÃºmero da O.S 1', 'Numero da O.S 1']) || '';
    const contrato = pick(item, ['Contrato', 'contrato']) || '';
    const data = pick(item, ['Data']) || '';
    return `${numeroWo}|${numeroOs1}|${contrato}|${data}|${globalIndex}`;
  };

  const buildMatch = (item: Record<string, string | undefined>) => {
    const match: Record<string, string> = {};

    const numeroWo = pick(item, ['Número da WO', 'NÃºmero da WO', 'Numero da WO']);
    const numeroOs1 = pick(item, ['Número da O.S 1', 'NÃºmero da O.S 1', 'Numero da O.S 1']);
    const contrato = pick(item, ['Contrato', 'contrato']);
    const dataIso = brToIsoDate(pick(item, ['Data']));

    if (numeroWo) match.numero_os = numeroWo;
    if (numeroOs1) match.numero_os1 = numeroOs1;
    if (contrato) match.contrato = contrato;
    if (dataIso) match.data_atividade = dataIso;

    return match;
  };

  const startEdit = (item: Record<string, string | undefined>, key: string) => {
    const cod = getCodBaixa(item);
    const statusComputed = computeStatus(item);
    setEditRowKey(key);
    setEditDraft({
      status: statusComputed || 'Pendente',
      cod: cod || ''
    });
  };

  const cancelEdit = () => {
    setEditRowKey(null);
    setEditDraft(null);
  };

  const saveRow = async (item: Record<string, string | undefined>, key: string) => {
    if (!isAdmin || !editDraft) return;

    const match = buildMatch(item);
    if (Object.keys(match).length === 0) return;

    const cod = (editDraft.cod || '').trim();
    const statusToSave = computeStatus(item, { status: editDraft.status, cod }); // garante regra do 409

    setSavingKey(key);
    const { error } = await externalSupabase
      .from('atividades')
      .update({
        status_atividade: statusToSave,
        cod_baixa_1: cod || null
      })
      .match(match);
    setSavingKey(null);

    if (error) {
      console.error('Erro ao atualizar atividade:', error);
      return;
    }

    cancelEdit();
    refreshData?.();
  };

  // ordenação (igual ao original)
  const sortedData = useMemo(() => {
    if (sortOrder === 'none') return filteredData;

    return [...filteredData].sort((a, b) => {
      const recursoA = (a.Recurso || '').toString().toLowerCase();
      const recursoB = (b.Recurso || '').toString().toLowerCase();
      return sortOrder === 'asc'
        ? recursoA.localeCompare(recursoB, 'pt-BR')
        : recursoB.localeCompare(recursoA, 'pt-BR');
    });
  }, [filteredData, sortOrder]);

  // paginação
  useEffect(() => {
    setCurrentPage(1);
    cancelEdit();
  }, [filteredData]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / ITEMS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const paginatedData = useMemo(() => {
    const start = pageStartIndex;
    const end = start + ITEMS_PER_PAGE;
    return sortedData.slice(start, end);
  }, [sortedData, pageStartIndex]);

  const toggleSort = () => {
    setSortOrder(current => (current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none'));
    setCurrentPage(1);
    cancelEdit();
  };

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    cancelEdit();
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

      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push('...');

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">
          <Table className="w-5 h-5" />
          Análise Detalhada
        </h3>

        <div className="flex items-center gap-4">
          <span className="record-count">
            {filteredData.length} registro{filteredData.length !== 1 ? 's' : ''}
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
              <th
                onClick={toggleSort}
                className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                title={sortOrder === 'none' ? 'Ordenar A-Z' : sortOrder === 'asc' ? 'Ordenar Z-A' : 'Remover ordenação'}
              >
                <div className="flex items-center gap-2">
                  Recurso
                  {sortOrder === 'asc' && <ArrowUpAZ className="w-4 h-4 text-primary" />}
                  {sortOrder === 'desc' && <ArrowDownAZ className="w-4 h-4 text-primary" />}
                  {sortOrder === 'none' && <ArrowUpAZ className="w-4 h-4 opacity-30" />}
                </div>
              </th>
              <th>Tipo de Atividade</th>
              <th>Contrato</th>
              <th>Cód de Baixa 1</th>
              <th>Status</th>
              <th>Intervalo de Tempo</th>
            </tr>
          </thead>

          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhum dado para exibir
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => {
                const globalIndex = pageStartIndex + index;
                const rowKey = getRowKey(item, globalIndex);

                const isEditing = editRowKey === rowKey;
                const isSaving = savingKey === rowKey;

                const displayCod = (isEditing ? (editDraft?.cod ?? '') : getCodBaixa(item)) || 'N/A';
                const numeric = getNumericCode(isEditing ? (editDraft?.cod ?? '') : getCodBaixa(item));
                const displayStatus = isEditing
                  ? computeStatus(item, { status: editDraft?.status, cod: editDraft?.cod })
                  : computeStatus(item);

                return (
                  <tr key={rowKey}>
                    <td>{item.Recurso || 'N/A'}</td>
                    <td>{item['Tipo de Atividade'] || 'N/A'}</td>
                    <td>{item.Contrato || item.contrato || 'N/A'}</td>

                    <td>
                      {isAdmin && isEditing ? (
                        <input
                          value={editDraft?.cod ?? ''}
                          onChange={(e) => {
                            const nextCod = e.target.value;
                            setEditDraft(prev => ({
                              status: prev?.status || 'Pendente',
                              cod: nextCod
                            }));
                          }}
                          disabled={isSaving}
                          className="w-full bg-transparent border border-border rounded px-2 py-1 text-sm"
                        />
                      ) : (
                        displayCod
                      )}
                    </td>

                    <td>
                      {isAdmin && isEditing ? (
                        <div className="flex flex-col gap-2">
                          <select
                            value={displayStatus}
                            onChange={(e) => {
                              const nextStatus = e.target.value;
                              setEditDraft(prev => ({
                                status: nextStatus,
                                cod: prev?.cod || ''
                              }));
                            }}
                            disabled={isSaving || numeric != null} // se tem código numérico, status é automático
                            className="bg-transparent border border-border rounded px-2 py-1 text-sm"
                            title={numeric != null ? 'Status é automático pelo Cód de Baixa (>=409 Produtiva / <409 Improdutiva)' : ''}
                          >
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveRow(item, rowKey)}
                              disabled={isSaving}
                              className="text-xs text-primary"
                            >
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="text-xs text-muted-foreground"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span style={{ color: getStatusColor(displayStatus), fontWeight: 600 }}>
                            {displayStatus}
                          </span>

                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => startEdit(item, rowKey)}
                              className="edit-button"
                            >
                              Editar
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    <td>{item['Intervalo de Tempo'] || 'N/A'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <div className="text-sm text-muted-foreground">
            Mostrando {pageStartIndex + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} de {sortedData.length}
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

            {getPageNumbers().map((page, idx) =>
              typeof page === 'number' ? (
                <Button
                  key={idx}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => goToPage(page)}
                  className="h-8 w-8 p-0"
                >
                  {page}
                </Button>
              ) : (
                <span key={idx} className="px-2 text-muted-foreground">...</span>
              )
            )}

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
