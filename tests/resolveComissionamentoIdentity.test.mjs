import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveComissionamentoIdentity } from '../src/utils/resolveComissionamentoIdentity.ts';

const roster = [
  { nome: 'DANIEL HENRIQUE RODRIGUES DA SILVA', frente: 'ADESÃO/SERVIÇOS', cidade: 'RECIFE' },
  { nome: 'JEFFERSON ANTONIO PEREIRA FERNANDES PIMENTEL', frente: 'ADESÃO/SERVIÇOS', cidade: 'NATAL/PARNAMIRIM' },
  { nome: 'JOAO BATISTA NASCIMENTO DA COSTA', frente: 'ADESÃO/SERVIÇOS', cidade: 'FORTALEZA' },
  { nome: 'JOAO BATISTA CUNHA MORAES', frente: 'ADESÃO/SERVIÇOS', cidade: 'FORTALEZA' },
  { nome: 'DANIEL GOIS', frente: 'VISITA TÉCNICA', cidade: 'RECIFE' },
  { nome: 'DANIEL ANDRE GOIS E SILVA', frente: 'VISITA TÉCNICA', cidade: 'RECIFE' },
];

test('resolves a unique abbreviated name in the same city and front', () => {
  assert.deepEqual(resolveComissionamentoIdentity({ nome: 'DANIEL HENRIQUE', frente: 'ADESÃO/SERVIÇOS', alocacao: 'RECIFE' }, roster), {
    nome: 'DANIEL HENRIQUE RODRIGUES DA SILVA', frente: 'ADESÃO/SERVIÇOS',
  });
});

test('resolves a uniquely truncated last word', () => {
  assert.equal(resolveComissionamentoIdentity({ nome: 'JEFFERSON ANTONIO PEREIRA FERNANDES PIME', frente: 'ADESÃO/SERVIÇOS', alocacao: 'NATAL/PARNAMIRIM' }, roster).nome,
    'JEFFERSON ANTONIO PEREIRA FERNANDES PIMENTEL');
});

test('does not guess when a short name matches two technicians', () => {
  assert.equal(resolveComissionamentoIdentity({ nome: 'JOAO BATISTA', frente: 'ADESÃO/SERVIÇOS', alocacao: 'FORTALEZA' }, roster).nome,
    'JOAO BATISTA');
});

test('does not cross cities or fronts', () => {
  assert.equal(resolveComissionamentoIdentity({ nome: 'DANIEL HENRIQUE', frente: 'ADESÃO/SERVIÇOS', alocacao: 'FORTALEZA' }, roster).nome,
    'DANIEL HENRIQUE');
  assert.equal(resolveComissionamentoIdentity({ nome: 'DANIEL HENRIQUE', frente: 'CONTROLE', alocacao: 'RECIFE' }, roster).nome,
    'DANIEL HENRIQUE');
});

test('does not override a roster name even if a longer match exists', () => {
  assert.equal(resolveComissionamentoIdentity({ nome: 'DANIEL GOIS', frente: 'VISITA TÉCNICA', alocacao: 'RECIFE' }, roster).nome,
    'DANIEL GOIS');
});

test('infers a front for a unique full name without a city, but does not expand an alias', () => {
  assert.equal(resolveComissionamentoIdentity({ nome: 'DANIEL HENRIQUE RODRIGUES DA SILVA', frente: null, alocacao: null }, roster).frente,
    'ADESÃO/SERVIÇOS');
  assert.equal(resolveComissionamentoIdentity({ nome: 'DANIEL HENRIQUE', frente: null, alocacao: null }, roster).nome,
    'DANIEL HENRIQUE');
});
