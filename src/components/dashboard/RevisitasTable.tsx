import React, { useState, useMemo } from 'react';
import { RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDashboard } from '@/contexts/DashboardContext';
import { getActivityStatus } from '@/utils/activityHelpers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TecnicoRevisita {
  nome: string;
  quantidadeOS: number;
  revisitas: number;
  porcentagem: number;
}

const ITEMS_PER_PAGE = 50;

export const RevisitasTable: React.FC = () => {
  const { filteredData } = useDashboard();
  const [selectedTecnico, setSelectedTecnico] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);

  // Aggregate data by ofensor_revisita technician
  const revisitasData = useMemo(() => {
    // 1. Collect unique technician names that appear as ofensor_revisita
    const ofensorNames = new Set<string>();
    filteredData.forEach(item => {
      const ofensor = (item['Ofensor Revisita'] || '').trim();
      if (ofensor) ofensorNames.add(ofensor);
    });

    // 2. For each ofensor, count ALL their OS (by Recurso) with valid status
    const osCountMap = new Map<string, number>();
    const revisitaCountMap = new Map<string, number>();

    ofensorNames.forEach(name => {
      osCountMap.set(name, 0);
      revisitaCountMap.set(name, 0);
    });

    filteredData.forEach(item => {
      const recurso = (item.Recurso || '').trim();
      const status = (item['Status da Atividade'] || '').toLowerCase();
      const isValidContract = status === 'concluído' || status === 'concluido' || status === 'não concluído' || status === 'nao concluido' || status === 'não concluido';

      // Count OS for this technician if they are an ofensor
      if (recurso && ofensorNames.has(recurso) && isValidContract) {
        osCountMap.set(recurso, (osCountMap.get(recurso) || 0) + 1);
      }

      // Count revisitas where this technician is the ofensor
      const ofensor = (item['Ofensor Revisita'] || '').trim();
      const isRevisita = item['Is Revisita'] === 'true';
      if (ofensor && isRevisita) {
        revisitaCountMap.set(ofensor, (revisitaCountMap.get(ofensor) || 0) + 1);
      }
    });

    const result: TecnicoRevisita[] = [];
    ofensorNames.forEach(nome => {
      const totalOS = osCountMap.get(nome) || 0;
      const totalRevisitas = revisitaCountMap.get(nome) || 0;
      result.push({
        nome,
        quantidadeOS: totalOS,
        revisitas: totalRevisitas,
        porcentagem: totalOS > 0 ? (totalRevisitas / totalOS) * 100 : 0,
      });
    });

    return result.sort((a, b) => b.porcentagem - a.porcentagem);
  }, [filteredData]);

  // Detail data for selected technician
  const detailData = useMemo(() => {
    if (!selectedTecnico) return [];
    return filteredData.filter(item => {
      const ofensor = (item['Ofensor Revisita'] || '').trim();
      return ofensor === selectedTecnico;
    });
  }, [filteredData, selectedTecnico]);

  const detailTotalPages = Math.ceil(detailData.length / ITEMS_PER_PAGE);
  const paginatedDetail = useMemo(() => {
    const start = (detailPage - 1) * ITEMS_PER_PAGE;
    return detailData.slice(start, start + ITEMS_PER_PAGE);
  }, [detailData, detailPage]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Produtiva': return '#43e97b';
      case 'Improdutiva': return '#f5576c';
      case 'Cancelado': return '#8B4513';
      default: return '#f5a623';
    }
  };

  const getPorcentagemColor = (pct: number) => {
    if (pct >= 10) return '#f5576c';
    if (pct >= 5) return '#f5a623';
    return '#43e97b';
  };

  return (
    <div className="table-container">
      <div className="table-header">
        <h3 className="table-title">
          <RefreshCw className="w-5 h-5" />
          Revisitas
        </h3>
        <span className="record-count">
          {revisitasData.length} técnico{revisitasData.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Técnico Ofensor</th>
              <th>Quantidade de OS</th>
              <th>Revisitas</th>
              <th>Porcentagem</th>
            </tr>
          </thead>
          <tbody>
            {revisitasData.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-12 text-muted-foreground">
                  Nenhum dado de revisita encontrado
                </td>
              </tr>
            ) : (
              revisitasData.map((tecnico, index) => (
                <tr
                  key={index}
                  className="cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => {
                    setSelectedTecnico(tecnico.nome);
                    setDetailPage(1);
                  }}
                >
                  <td className="font-medium">{tecnico.nome}</td>
                  <td>{tecnico.quantidadeOS}</td>
                  <td>{tecnico.revisitas}</td>
                  <td>
                    <span
                      style={{ color: getPorcentagemColor(tecnico.porcentagem), fontWeight: 600 }}
                    >
                      {tecnico.porcentagem.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedTecnico} onOpenChange={(open) => !open && setSelectedTecnico(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Detalhes — {selectedTecnico}
            </DialogTitle>
          </DialogHeader>

          <div className="text-sm text-muted-foreground mb-2">
            {detailData.length} registro{detailData.length !== 1 ? 's' : ''}
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left font-medium text-muted-foreground">Contrato</th>
                  <th className="p-2 text-left font-medium text-muted-foreground">Data</th>
                  <th className="p-2 text-left font-medium text-muted-foreground">Tipo de Atividade</th>
                  <th className="p-2 text-left font-medium text-muted-foreground">Cód de Baixa</th>
                  <th className="p-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="p-2 text-left font-medium text-muted-foreground">Revisita</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDetail.map((item, idx) => {
                  const status = getActivityStatus(item);
                  const isRevisita = item['Is Revisita'] === 'true';
                  return (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="p-2">{item.Contrato || item.contrato || 'N/A'}</td>
                      <td className="p-2">{item.Data || 'N/A'}</td>
                      <td className="p-2">{item['Tipo de Atividade'] || 'N/A'}</td>
                      <td className="p-2">{item['Cód de Baixa 1'] || 'N/A'}</td>
                      <td className="p-2">
                        <span style={{ color: getStatusColor(status), fontWeight: 600 }}>
                          {status}
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            isRevisita
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}
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
              <div className="text-sm text-muted-foreground">
                Página {detailPage} de {detailTotalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailPage(p => Math.max(1, p - 1))}
                  disabled={detailPage === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailPage(p => Math.min(detailTotalPages, p + 1))}
                  disabled={detailPage === detailTotalPages}
                  className="h-8 w-8 p-0"
                >
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