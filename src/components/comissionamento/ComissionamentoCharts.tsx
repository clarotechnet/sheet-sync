import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { BarChart3, Trophy } from 'lucide-react';
import { TechnicianChartData, RankingData } from '@/types/comissionamento';

interface Props {
  chartData: TechnicianChartData[];
  ranking: RankingData[];
}

// ... (Funções shortName, CustomXAxisTick e nameSlace permanecem iguais)
function shortName(full: string): string {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length === 0) return '';
  const firstName = parts[0];
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : '';
  const lastInitial = lastPart ? lastPart.slice(0, 1) + '.' : '';
  return `${firstName} ${lastInitial}`.trim();
}

const CustomXAxisTick = ({ x, y, payload }: any) => {
  const parts = (payload.value || '').split('||');
  const nome = parts[0] || '';
  const cidade = parts[1] || '';
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="hsl(223 16% 70%)" fontSize={9} fontWeight={600}>
        {nome}
      </text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill="hsl(223 16% 50%)" fontSize={8}>
        {cidade}
      </text>
    </g>
  );
};

function nameSlace(full: string): string {
  const name = (full || '').trim();
  if (name.length <= 9) return name;
  return name.slice(0, 10) + '...';
}

export const ComissionamentoCharts: React.FC<Props> = ({ chartData, ranking }) => {
  const barData = chartData.slice(0, 15).map(d => ({
    ...d,
    nameCity: `${shortName(d.nome)}||${nameSlace(d.cidade)}`
  }));

  // LÓGICA ATUALIZADA: Ordenamos pelo valor CONFIRMADO antes de pegar os top 5
  const sortedRanking = [...ranking].sort((a, b) => 
    (b.total_valor_confirmado || 0) - (a.total_valor_confirmado || 0)
  );
  
  const top5 = sortedRanking.slice(0, 5);
  const medalColors = ['#FFD700', '#a09494', '#CD7F32', 'hsl(14, 41%, 25%)', 'hsl(0, 50%, 47%)'];

  return (
    <div className="space-y-8">
      {/* Bar Chart - Status por Técnico */}
      <div className="card">
        <h4 className="mb-6 flex items-center gap-2 text-lg font-bold">
          <BarChart3 className="w-5 h-5 text-accent" />
          Status por Técnico
        </h4>
        {barData.length > 0 ? (
          <div style={{ height: Math.max(400, barData.length * 30 + 100) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <XAxis dataKey="nameCity" tick={<CustomXAxisTick />} interval={0} height={60} />
                <YAxis tick={{ fill: 'hsl(0, 57%, 6%)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(0, 35%, 50%)',
                    border: '1px solid hsl(0, 0%, 0%)',
                    borderRadius: '8px',
                    color: 'white'
                  }}
                  labelFormatter={(label: string) => {
                    const parts = label.split('||');
                    return `${parts[0]} — ${parts[1] || ''}`;
                  }}
                />
                <Legend wrapperStyle={{ color: 'hsl(223 16% 70%)', fontSize: 12 }} />
                <Bar dataKey="pendente" name="Pendente" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="pendente" position="top" fill="hsl(223 16% 70%)" fontSize={10} formatter={(v: number) => v > 0 ? v : ''} />
                </Bar>
                <Bar dataKey="confirmada" name="Confirmada" fill="#22c55e" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="confirmada" position="top" fill="hsl(223 16% 70%)" fontSize={10} formatter={(v: number) => v > 0 ? v : ''} />
                </Bar>
                <Bar dataKey="cancelada" name="Cancelada" fill="#ff0909" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="cancelada" position="top" fill="hsl(223 16% 70%)" fontSize={10} formatter={(v: number) => v > 0 ? v : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">Nenhum dado para exibir</p>
        )}
      </div>

      {/* Ranking / Podium */}
      <div className="card">
        <h4 className="mb-6 flex items-center gap-2 text-lg font-bold">
          <Trophy className="w-5 h-5 text-warning" />
          Ranking — Top 5 Técnicos (Confirmados)
        </h4>
        {top5.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {top5.map((t, i) => (
              <div
                key={t.nome}
                className="relative rounded-xl p-5 text-center border border-border transition-all hover:scale-105"
                style={{
                  background: i < 3
                    ? `linear-gradient(135deg, ${medalColors[i]}22, ${medalColors[i]}08)`
                    : 'hsl(0, 0%, 63%)', // Um fundo escuro suave para quem não é top 3
                  borderColor: i < 3 ? medalColors[i] : 'transparent'
                }}
              >
                <div className="text-3xl font-black mb-2" style={{ color: medalColors[i] }}>
                  {i + 1}º
                </div>
                <div className="text-sm font-bold text-foreground mb-1 truncate" title={t.nome}>
                  {t.nome}
                </div>
                <div className="text-xs text-muted-foreground mb-2">
                  <span className="text-xs font-black text-foreground">{t.total_contratos} contratos</span>
                </div>

                {/* TROCA AQUI: Agora usamos totalValorConfirmado */}
                {t.total_valor_confirmado > 0 ? (
                  <div className="text-xs font-bold">
                    <span className="block text-[9px] uppercase opacity-70 mb-1">Total Confirmado</span>
                    <span className="text-xs font-black text-foreground">
                      R$ {t.total_valor_confirmado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground italic">R$ 0,00 confirmado</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-8">Nenhum dado para ranking</p>
        )}
      </div>
    </div>
  );
};