import type { GatilhoFaixa, GatilhoResultado } from '@/types/gatilhos';

export const calcularGatilhoPontuacao = (
  resultado: Pick<GatilhoResultado, 'valor' | 'valor_ajustado'>,
  faixas: GatilhoFaixa[],
) => {
  const pontuacao = Number(resultado.valor_ajustado ?? resultado.valor);
  const ordenadas = [...faixas].sort((a, b) => Number(a.pontos) - Number(b.pontos));
  const atingidas = ordenadas.filter((faixa) => pontuacao >= Number(faixa.pontos));
  const faixaAtual = atingidas[atingidas.length - 1] || null;
  const proximaFaixa = ordenadas.find((faixa) => pontuacao < Number(faixa.pontos)) || null;
  return {
    pontuacao,
    faixaAtual,
    proximaFaixa,
    premio: faixaAtual ? Number(faixaAtual.premio) : 0,
  };
};
