import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularGatilhoPontuacao } from '../src/utils/gatilhosPontuacao.ts';

const faixas = [
  { pontos: 9000, premio: 600, nivel: 3 },
  { pontos: 7000, premio: 300, nivel: 1 },
  { pontos: 8000, premio: 400, nivel: 2 },
];

test('ajuste de pontos muda faixa e premiação sem alterar o valor importado', () => {
  const resultado = { valor: 8543.19, valor_ajustado: 9000 };
  const calculado = calcularGatilhoPontuacao(resultado, faixas);
  assert.equal(calculado.pontuacao, 9000);
  assert.equal(calculado.faixaAtual?.nivel, 3);
  assert.equal(calculado.premio, 600);
  assert.equal(resultado.valor, 8543.19);
});

test('sem ajuste usa o valor importado e a faixa original', () => {
  const calculado = calcularGatilhoPontuacao({ valor: 8543.19, valor_ajustado: null }, faixas);
  assert.equal(calculado.pontuacao, 8543.19);
  assert.equal(calculado.faixaAtual?.nivel, 2);
  assert.equal(calculado.proximaFaixa?.nivel, 3);
  assert.equal(calculado.premio, 400);
});

test('ajuste para zero é válido e não recebe prêmio', () => {
  const calculado = calcularGatilhoPontuacao({ valor: 8543.19, valor_ajustado: 0 }, faixas);
  assert.equal(calculado.pontuacao, 0);
  assert.equal(calculado.faixaAtual, null);
  assert.equal(calculado.premio, 0);
});
