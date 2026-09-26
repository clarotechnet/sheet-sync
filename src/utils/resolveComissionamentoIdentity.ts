import type { ComissionamentoData, TecnicoFrente } from '@/types/comissionamento';
import { normalizePersonName } from './normalizeName.ts';

type IdentityFields = Pick<ComissionamentoData, 'nome' | 'alocacao' | 'frente'>;

export function resolveComissionamentoIdentity(
  record: IdentityFields,
  tecnicos: TecnicoFrente[],
): Pick<IdentityFields, 'nome' | 'frente'> {
  const name = normalizePersonName(record.nome);
  const city = normalizePersonName(record.alocacao);
  if (!name) return { nome: record.nome, frente: record.frente };

  const roster = tecnicos.filter(tecnico =>
    (!city || normalizePersonName(tecnico.cidade) === city)
    && (!record.frente || tecnico.frente === record.frente)
  );
  const exact = roster.filter(tecnico => normalizePersonName(tecnico.nome) === name);
  if (exact.length === 1) {
    return { nome: exact[0].nome.trim(), frente: record.frente || exact[0].frente };
  }
  if (!city || exact.length > 1 || name.split(' ').length < 2) {
    return { nome: record.nome, frente: record.frente };
  }

  // Only complete an abbreviated name when one technician matches in this city/front.
  const matches = roster.filter(tecnico => {
    const fullName = normalizePersonName(tecnico.nome);
    return fullName.startsWith(`${name} `)
      || (name.length >= 20 && fullName.startsWith(name));
  });
  if (matches.length !== 1) return { nome: record.nome, frente: record.frente };

  return { nome: matches[0].nome.trim(), frente: record.frente || matches[0].frente };
}
