import React, { useMemo, useCallback } from 'react';
import { ComissionamentoData } from '@/types/comissionamento';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ComissionamentoValoresProps {
  data: ComissionamentoData[];
}

export const ComissionamentoValores: React.FC<ComissionamentoValoresProps> = ({ data }) => {
  const valoresData = useMemo(() => {
    const map = new Map<string, { nome: string; cidade: string; contratos: number; total: number }>();

    data.forEach(row => {
      const nome = row.nome || 'Desconhecido';
      const cidade = row.alocacao || '-';
      const key = `${nome}__${cidade}`;

      if (!map.has(key)) {
        map.set(key, { nome, cidade, contratos: 0, total: 0 });
      }

      const entry = map.get(key)!;
      entry.contratos += 1;
      entry.total += row.valores || 0;
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const exportToExcel = useCallback(() => {
    if (valoresData.length === 0) return;

    const rows = valoresData.map(r => ({
      Nome: r.nome,
      Cidade: r.cidade,
      Contratos: r.contratos,
      'Total R$': r.total,
    }));

    // Add total row
    rows.push({
      Nome: 'TOTAL',
      Cidade: '',
      Contratos: valoresData.reduce((s, r) => s + r.contratos, 0),
      'Total R$': valoresData.reduce((s, r) => s + r.total, 0),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Valores');
    XLSX.writeFile(wb, 'comissionamento_valores.xlsx');
  }, [valoresData]);

   const exportToPDF = useCallback(() => {
    if (valoresData.length === 0) return;

    const totalContratos = valoresData.reduce((s, r) => s + r.contratos, 0);
    const totalValor = valoresData.reduce((s, r) => s + r.total, 0);
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = valoresData.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.nome}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.cidade}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600">${r.contratos}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#2563eb">${fmt(r.total)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Comissionamento - Valores</title>
      <style>
        body{font-family:Arial,sans-serif;margin:30px;color:#1f2937}
        h1{font-size:18px;margin-bottom:4px}
        p.date{font-size:12px;color:#6b7280;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{background:#1e3a5f;color:#fff;padding:10px 12px;text-align:left}
        th:nth-child(3){text-align:center}
        th:nth-child(4){text-align:right}
        tfoot td{background:#f3f4f6;font-weight:700;padding:10px 12px;border-top:2px solid #1e3a5f}
        @media print{body{margin:15px}@page{margin:15mm}}
      </style></head><body>
      <h1>Relatório de Valores - Comissionamento Técnico</h1>
      <p class="date">Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
      <table>
        <thead><tr><th>Nome</th><th>Cidade</th><th>Total OS.</th><th>Total R$</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot><tr>
          <td colspan="2">TOTAL</td>
          <td style="text-align:center">${totalContratos}</td>
          <td style="text-align:right;color:#2563eb">${fmt(totalValor)}</td>
        </tr></tfoot>
      </table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  }, [valoresData]);

  return (
    <div className="space-y-4">
       <div className="flex justify-end gap-2">
        <Button
          onClick={exportToPDF}
          disabled={valoresData.length === 0}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Exportar PDF
        </Button>
        <Button
          onClick={exportToExcel}
          disabled={valoresData.length === 0}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Exportar Excel
        </Button>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left p-3 font-semibold text-foreground">Nome</th>
                <th className="text-left p-3 font-semibold text-foreground">Cidade</th>
                <th className="text-center p-3 font-semibold text-foreground">Total OS.</th>
                <th className="text-right p-3 font-semibold text-foreground">Total R$</th>
              </tr>
            </thead>
            <tbody>
              {valoresData.map((row, idx) => (
                <tr key={idx} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-foreground font-medium">{row.nome}</td>
                  <td className="p-3 text-muted-foreground">{row.cidade}</td>
                  <td className="p-3 text-center font-bold text-foreground">{row.contratos}</td>
                  <td className="p-3 text-right font-bold text-primary">
                    {row.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              ))}
              {valoresData.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Nenhum dado encontrado.
                  </td>
                </tr>
              )}
            </tbody>
            {valoresData.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 border-t-2 border-border">
                  <td className="p-3 font-bold text-foreground" colSpan={2}>Total</td>
                  <td className="p-3 text-center font-bold text-foreground">
                    {valoresData.reduce((s, r) => s + r.contratos, 0)}
                  </td>
                  <td className="p-3 text-right font-bold text-primary">
                    {valoresData.reduce((s, r) => s + r.total, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};