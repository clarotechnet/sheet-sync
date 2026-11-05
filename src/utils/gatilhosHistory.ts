import type { GatilhoFechamento, GatilhoResultadoFechado, GatilhosDataState, GatilhoVinculo } from '@/types/gatilhos';
import { calcularGatilhoPontuacao } from './gatilhosPontuacao.ts';

export function buildLiveGatilhosRanking(state: GatilhosDataState, periodo: string | null) {
  const byId = new Map<string, GatilhoVinculo[]>();
  state.vinculos.forEach((vinculo) => {
    byId.set(vinculo.id_externo, [...(byId.get(vinculo.id_externo) || []), vinculo]);
  });
  return state.resultados.filter((row) => row.periodo_inicio === periodo).map((resultado) => {
    const vinculos = (byId.get(resultado.id_externo) || []).slice().sort((a, b) =>
      (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1) || a.id.localeCompare(b.id));
    const tipo = vinculos[0]?.tipo || null;
    const cidade = vinculos[0]?.cidade || null;
    const { pontuacao, faixaAtual, proximaFaixa, premio } = calcularGatilhoPontuacao(
      resultado, state.faixas.filter((faixa) => faixa.tipo === tipo),
    );
    const nomes = vinculos.map((vinculo) => vinculo.colaborador.nome);
    return {
      ...resultado,
      valor: Number(resultado.valor),
      valor_ajustado: resultado.valor_ajustado == null ? null : Number(resultado.valor_ajustado),
      pontuacao,
      valor_instalador: Number(resultado.valor_instalador),
      valor_auxiliar: Number(resultado.valor_auxiliar),
      valor_deslocamento: Number(resultado.valor_deslocamento),
      nomes, nome_exibicao: nomes.length ? nomes.join(' / ') : `ID ${resultado.id_externo} não vinculado`,
      cidade, tipo, vinculado: nomes.length > 0 && Boolean(tipo) && Boolean(cidade),
      faixa_atual: faixaAtual, proxima_faixa: proximaFaixa, premio,
    };
  }).sort((a, b) => b.pontuacao - a.pontuacao);
}

// A closed period never falls back to today's collaborators, links or award rules.
export function readClosedGatilhos(fechamento: GatilhoFechamento, rows: GatilhoResultadoFechado[]) {
  if (rows.length !== fechamento.total_ids || new Set(rows.map((row) => row.id_externo)).size !== rows.length
    || rows.some((row) => row.periodo_inicio !== fechamento.periodo_inicio
      || row.resultado?.periodo_inicio !== fechamento.periodo_inicio
      || row.resultado?.id_externo !== row.id_externo || !Array.isArray(row.vinculos)
      || !Array.isArray(row.resultado?.nomes) || !Number.isFinite(row.resultado?.pontuacao)
      || !Number.isFinite(row.resultado?.premio))) {
    throw new Error('O retrato do período fechado está incompleto. Atualize para tentar novamente.');
  }
  return {
    ranking: rows.map((row) => row.resultado).sort((a, b) => b.pontuacao - a.pontuacao),
    vinculos: rows.flatMap((row) => row.vinculos),
    faixas: fechamento.faixas,
  };
}
