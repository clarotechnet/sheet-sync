import React, { useState, useMemo } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { getActivityStatus } from '@/utils/activityHelpers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ITEMS_PER_PAGE = 50;

interface TecnicoRevisita {
  tecnico: string;
  quantidadeOS: number;
  revisitas: number;
  porcentagem: number;
}

type SummaryCol = 'tecnico' | 'quantidadeOS' | 'revisitas' | 'porcentagem';
type DetailCol = 'contrato' | 'data' | 'tipo' | 'codBaixa' | 'status' | 'revisita';
type SortDir = 'asc' | 'desc';

const SortIcon: React.FC<{ active: boolean; dir: SortDir }> = ({ active, dir }) => {
  if (!active) return <ArrowUpDown className="inline w-3.5 h-3.5 ml-1 opacity-40" />;
  return dir === 'asc'
    ? <ArrowUp className="inline w-3.5 h-3.5 ml-1 text-primary" />
    : <ArrowDown className="inline w-3.5 h-3.5 ml-1 text-primary" />;
};

export const RevisitasTable: React.FC = () => {
  const { filteredData } = useDashboard();
  const [selectedTecnico, setSelectedTecnico] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [summarySort, setSummarySort] = useState<{ col: SummaryCol; dir: SortDir }>({ col: 'revisitas', dir: 'desc' });
  const [detailSort, setDetailSort] = useState<{ col: DetailCol; dir: SortDir }>({ col: 'data', dir: 'desc' });

  const toggleSummarySort = (col: SummaryCol) => {
    setSummarySort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  };

  const toggleDetailSort = (col: DetailCol) => {
    setDetailSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
    setDetailPage(1);
  };

  const tecnicosSummary = useMemo(() => {
    const revisitasMap = new Map<string, number>();
    for (const item of filteredData) {
      if (item['is_revisita'] === 'true') {
        const ofensor = (item['ofensor_revisita'] || '').trim();
        if (ofensor) revisitasMap.set(ofensor, (revisitasMap.get(ofensor) || 0) + 1);
      }
    }

    const osMap = new Map<string, number>();
    for (const item of filteredData) {
      const recurso = (item['Recurso'] || item['recurso'] || '').trim();
      if (!recurso || !revisitasMap.has(recurso)) continue;
      const s = (item['Status da Atividade'] || '').trim().toLowerCase();
      if (s === 'concluído' || s === 'concluido' || s === 'não concluído' || s === 'nao concluido' || s === 'não concluido' || s === 'nao concluído') {
        osMap.set(recurso, (osMap.get(recurso) || 0) + 1);
      }
    }

    const result: TecnicoRevisita[] = [];
    revisitasMap.forEach((revisitas, tecnico) => {
      const os = osMap.get(tecnico) || 0;
      result.push({ tecnico, quantidadeOS: os, revisitas, porcentagem: os > 0 ? (revisitas / os) * 100 : 0 });
    });
    return result;
  }, [filteredData]);

  const sortedSummary = useMemo(() => {
    const sorted = [...tecnicosSummary];
    const { col, dir } = summarySort;
    sorted.sort((a, b) => {
      if (col === 'tecnico') {
        const cmp = a.tecnico.localeCompare(b.tecnico, 'pt-BR');
        return dir === 'asc' ? cmp : -cmp;
      }
      const diff = a[col] - b[col];
      return dir === 'asc' ? diff : -diff;
    });
    return sorted;
  }, [tecnicosSummary, summarySort]);

  const detailData = useMemo(() => {
    if (!selectedTecnico) return [];
    return filteredData.filter(item => (item['ofensor_revisita'] || '').trim() === selectedTecnico);
  }, [filteredData, selectedTecnico]);

  const sortedDetail = useMemo(() => {
    const sorted = [...detailData];
    const { col, dir } = detailSort;
    sorted.sort((a, b) => {
      let va = '', vb = '';
      switch (col) {
        case 'contrato': va = a.Contrato || a.contrato || ''; vb = b.Contrato || b.contrato || ''; break;
        case 'data': va = a.Data || ''; vb = b.Data || ''; break;
        case 'tipo': va = a['Tipo de Atividade'] || ''; vb = b['Tipo de Atividade'] || ''; break;
        case 'codBaixa': va = a['Cód de Baixa 1'] || ''; vb = b['Cód de Baixa 1'] || ''; break;
        case 'status': va = getActivityStatus(a); vb = getActivityStatus(b); break;
        case 'revisita': va = a['is_revisita'] === 'true' ? '1' : '0'; vb = b['is_revisita'] === 'true' ? '1' : '0'; break;
      }
      const cmp = va.localeCompare(vb, 'pt-BR');
      return dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [detailData, detailSort]);

  const detailTotalPages = Math.ceil(sortedDetail.length / ITEMS_PER_PAGE);
  const paginatedDetail = useMemo(() => {
    const start = (detailPage - 1) * ITEMS_PER_PAGE;
    return sortedDetail.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedDetail, detailPage]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Produtiva': return '#228B22';
      case 'Improdutiva': return '#FF0000';
      case 'Cancelado': return '#8B4513';
      default: return '#f5a623';
    }
  };

  const thStyle = "cursor-pointer select-none hover:text-primary transition-colors";

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">
          <RefreshCw className="w-5 h-5" />
          Revisitas
        </h3>
        <span className="record-count">
          {tecnicosSummary.length} técnico{tecnicosSummary.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th className={thStyle} onClick={() => toggleSummarySort('tecnico')}>
                Técnico Ofensor <SortIcon active={summarySort.col === 'tecnico'} dir={summarySort.dir} />
              </th>
              <th className={thStyle} onClick={() => toggleSummarySort('quantidadeOS')}>
                Quantidade de OS <SortIcon active={summarySort.col === 'quantidadeOS'} dir={summarySort.dir} />
              </th>
              <th className={thStyle} onClick={() => toggleSummarySort('revisitas')}>
                Revisitas <SortIcon active={summarySort.col === 'revisitas'} dir={summarySort.dir} />
              </th>
              <th className={thStyle} onClick={() => toggleSummarySort('porcentagem')}>
                Porcentagem <SortIcon active={summarySort.col === 'porcentagem'} dir={summarySort.dir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedSummary.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-muted-foreground">
                  Nenhum registro de revisita encontrado
                </td>
              </tr>
            ) : (
              sortedSummary.map((t) => (
                <tr
                  key={t.tecnico}
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => { setSelectedTecnico(t.tecnico); setDetailPage(1); setDetailSort({ col: 'data', dir: 'desc' }); }}
                >
                  <td className="font-medium">{t.tecnico}</td>
                  <td>{t.quantidadeOS}</td>
                  <td>{t.revisitas}</td>
                  <td>
                    <span className="font-semibold" style={{ color: t.porcentagem > 10 ? '#FF0000' : t.porcentagem > 5 ? '#f5a623' : '#228B22' }}>
                      {t.porcentagem.toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedTecnico} onOpenChange={(open) => { if (!open) setSelectedTecnico(null); }}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Detalhes — {selectedTecnico}</DialogTitle>
          </DialogHeader>

          <div className="text-sm text-muted-foreground mb-2">
            {detailData.length} registro{detailData.length !== 1 ? 's' : ''}
          </div>

          <div className="overflow-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th className={thStyle} onClick={() => toggleDetailSort('contrato')}>
                    Contrato <SortIcon active={detailSort.col === 'contrato'} dir={detailSort.dir} />
                  </th>
                  <th className={thStyle} onClick={() => toggleDetailSort('data')}>
                    Data <SortIcon active={detailSort.col === 'data'} dir={detailSort.dir} />
                  </th>
                  <th className={thStyle} onClick={() => toggleDetailSort('tipo')}>
                    Tipo de Atividade <SortIcon active={detailSort.col === 'tipo'} dir={detailSort.dir} />
                  </th>
                  <th className={thStyle} onClick={() => toggleDetailSort('codBaixa')}>
                    Cód de Baixa 1 <SortIcon active={detailSort.col === 'codBaixa'} dir={detailSort.dir} />
                  </th>
                  <th className={thStyle} onClick={() => toggleDetailSort('status')}>
                    Status <SortIcon active={detailSort.col === 'status'} dir={detailSort.dir} />
                  </th>
                  <th className={thStyle} onClick={() => toggleDetailSort('revisita')}>
                    Revisita <SortIcon active={detailSort.col === 'revisita'} dir={detailSort.dir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedDetail.map((item, idx) => {
                  const status = getActivityStatus(item);
                  const isRevisita = item['is_revisita'] === 'true';
                  return (
                    <tr key={idx}>
                      <td>{item.Contrato || item.contrato || 'N/A'}</td>
                      <td>{item.Data || 'N/A'}</td>
                      <td>{item['Tipo de Atividade'] || 'N/A'}</td>
                      <td>{item['Cód de Baixa 1'] || 'N/A'}</td>
                      <td>
                        <span style={{ color: getStatusColor(status), fontWeight: 600 }}>{status}</span>
                      </td>
                      <td>
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                          style={{
                            backgroundColor: isRevisita ? 'rgba(255,0,0,0.1)' : 'rgba(34,139,34,0.1)',
                            color: isRevisita ? '#FF0000' : '#228B22',
                          }}
                        >
                          {isRevisita ? 'Sim' : 'Não'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {detailTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">Página {detailPage} de {detailTotalPages}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setDetailPage(p => Math.max(1, p - 1))} disabled={detailPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                  onClick={() => setDetailPage(p => Math.min(detailTotalPages, p + 1))} disabled={detailPage === detailTotalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};