import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList, Cell } from 'recharts';
import { Users, TrendingUp, TrendingDown, Target, Award } from 'lucide-react';
import { FrenteKPIData } from '@/types/comissionamento';

interface Props {
  frentesData: FrenteKPIData[];
  selectedFrente: string;
}

function shortName(full: string): string {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length <= 2) return full;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export const ComissionamentoFrentes: React.FC<Props> = ({ frentesData, selectedFrente }) => {
  const displayData = selectedFrente
    ? frentesData.filter(f => f.frente === selectedFrente)
    : frentesData;

  // Aggregate all frentes for chart
  const chartData = displayData.map(f => ({
    frente: f.frente,
    qtdConsultivo: f.qtdConsultivo,
    totalTecnicos: f.totalTecnicos,
    tecAdherente: f.tecAdherente,
    pctTecAdherente: f.pctTecAdherente
  }));

  // Negative ranking: all technicians who didn't sell across displayed frentes
  const allNaoVenderam = displayData.flatMap(f =>
    f.tecNaoVenderam.map(nome => ({ nome, frente: f.frente }))
  );

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {displayData.map(f => (
          <div key={f.frente} className="card space-y-3">
            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              {f.frente}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-13">
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-2">Total Geral</div>
                <div className="text-2xl font-black text-foreground">{f.totalGeral}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">QTD Consultivo</div>
                  <div className="flex items-baseline justify-center gap-2">
                  <div className="text-2xl font-black text-accent">{f.qtdConsultivo}</div>
                </div>
              </div>
              <div className='=text-center'>
                <div className="text-xs text-muted-foreground mb-2">PCT Confirmada</div>
                <div className="flex items-baseline justify-center gap-2">
                <div className="text-xl font-semibold" style={{ color: f.pctConfirmada >= 50 ? '#22c55e' : '#f59e0b' }}>
                    {f.pctConfirmada.toFixed(1)}%
                </div>
                </div>
               </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">% Tec Aderente</div>
                <div className="text-2xl font-black" style={{ color: f.pctTecAdherente >= 50 ? '#22c55e' : '#f59e0b' }}>
                  {f.pctTecAdherente.toFixed(1)}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Tec na Frente</div>
                <div className="text-2xl font-black text-foreground">{f.totalTecnicos}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="w-3 h-3" />
              <span>Meta: mín. 1 contrato/técnico | {f.tecAdherente}/{f.totalTecnicos} atingiram</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bar Chart - QTD Consultivo by Frente */}
      {chartData.length > 1 && (
        <div className="card">
          <h4 className="mb-6 flex items-center gap-2 text-lg font-bold">
            <Award className="w-5 h-5 text-accent" />
            Ranking por Frente — QTD Consultivo
          </h4>
          <div style={{ height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.sort((a, b) => b.qtdConsultivo - a.qtdConsultivo)} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <XAxis dataKey="frente" tick={{ fill: 'hsl(223 16% 70%)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'hsl(223 16% 70%)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(231 45% 11%)',
                    border: '1px solid hsl(232 32% 22%)',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'qtdConsultivo') return [value, 'QTD Consultivo'];
                    if (name === 'pctTecAdherente') return [`${value.toFixed(1)}%`, '% Tec Aderente'];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ color: 'hsl(223 16% 70%)', fontSize: 12 }} />
                <Bar dataKey="qtdConsultivo" name="QTD Consultivo" fill="#22c55e" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="qtdConsultivo" position="top" fill="hsl(223 16% 70%)" fontSize={11} />
                </Bar>
                <Bar dataKey="pctTecAdherente" name="% Tec Aderente" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="pctTecAdherente" position="top" fill="hsl(223 16% 70%)" fontSize={11}
                    formatter={(v: number) => `${v.toFixed(0)}%`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Negative Ranking - Technicians who didn't sell */}
      <div className="card">
        <h4 className="mb-4 flex items-center gap-2 text-lg font-bold">
          <TrendingDown className="w-5 h-5 text-destructive" />
          Ranking Negativo — Técnicos sem Oferta confirmada no período
        </h4>
        {allNaoVenderam.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">#</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Técnico</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Frente</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {allNaoVenderam.map((t, i) => (
                  <tr key={`${t.frente}-${t.nome}`} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-3 text-foreground font-medium">{shortName(t.nome)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{t.frente}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold">
                        <TrendingDown className="w-3 h-3" /> Sem Oferta
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground flex items-center justify-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Todos os técnicos venderam no período! 🎉
          </div>
        )}
      </div>
    </div>
  );
};