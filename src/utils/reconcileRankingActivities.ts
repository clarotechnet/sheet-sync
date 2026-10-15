import type { DatabaseRankingActivity, RankingActivity, RankingTechnicianInput } from '@/types/technicianRanking';
import { normalizePersonName } from './normalizeName.ts';
import { normalizeRankingCity, normalizeTechnicianLogin } from './technicianRanking.ts';

const text = (value: string | null | undefined) => (value || '').trim();
const openStatuses = new Set(['PENDENTE', 'INICIADO', 'INICIADA', 'EM ANDAMENTO', 'EM EXECUCAO', 'DESLOCAMENTO']);

export function reconcileRankingActivities(
  activities: RankingActivity[],
  records: DatabaseRankingActivity[],
  technicians: RankingTechnicianInput[],
): RankingActivity[] {
  const byContractDate = new Map<string, DatabaseRankingActivity[]>();
  records.forEach((row) => {
    const key = `${row.data_atividade}|${text(row.contrato)}`;
    byContractDate.set(key, [...(byContractDate.get(key) || []), row]);
  });
  const byLogin = new Map(technicians.map((row) => [normalizeTechnicianLogin(row.login), row]));
  const identities = [
    ...technicians.map((row) => ({ login: normalizeTechnicianLogin(row.login), name: normalizePersonName(row.nome), city: normalizeRankingCity(row.cidade) })),
    ...activities.map((row) => ({ login: normalizeTechnicianLogin(row.login_tecnico || row.concluiu_atividade), name: normalizePersonName(row.recurso), city: normalizeRankingCity(row.cidade) })),
  ].filter((row) => row.login && row.name);
  const knownLogins = new Set(identities.map((row) => row.login));
  const uniqueLogin = (matches: typeof identities) => {
    const logins = new Set(matches.map((row) => row.login));
    return logins.size === 1 ? [...logins][0] : null;
  };
  const resolveLogin = (resource: string | null, city: string) => {
    const explicitLogin = normalizeTechnicianLogin(resource);
    if (knownLogins.has(explicitLogin)) return explicitLogin;
    const name = normalizePersonName(resource);
    if (!name) return null;
    const roster = identities.filter((row) => !city || !row.city || row.city === city);
    const exact = roster.filter((row) => row.name === name);
    if (exact.length) return uniqueLogin(exact);
    if (!city || name.split(' ').length < 2) return null;
    // Use the existing city-scoped, unique-prefix rule for abbreviated resource names.
    return uniqueLogin(roster.filter((row) => row.city === city && (row.name.startsWith(`${name} `)
      || (name.length >= 20 && row.name.startsWith(name)))));
  };
  const recordLogins = new Map(records.map((row) => [row.id, resolveLogin(row.recurso, normalizeRankingCity(row.cidade))]));
  const consumed = new Set<string>();

  const reconciled = activities.map((activity) => {
    if (!text(activity.contrato)) return activity;
    const login = normalizeTechnicianLogin(activity.login_tecnico || activity.concluiu_atividade)
      || resolveLogin(activity.recurso, normalizeRankingCity(activity.cidade)) || '';
    const names = new Set([activity.recurso, byLogin.get(login)?.nome, login].map(normalizePersonName).filter(Boolean));
    const city = normalizeRankingCity(activity.cidade);
    const wo = text(activity.numero_wo);
    const candidates = (byContractDate.get(`${activity.data_atividade}|${text(activity.contrato)}`) || []).filter((row) => {
      const recordCity = normalizeRankingCity(row.cidade);
      const recordLogin = recordLogins.get(row.id);
      const sameTechnician = login && recordLogin ? login === recordLogin : names.has(normalizePersonName(row.recurso));
      return sameTechnician
        && (!city || !recordCity || city === recordCity)
        && (!wo || !text(row.numero_os) || wo === text(row.numero_os));
    });
    // Prefer the task ID. A WO fallback also needs the same city, type and technician.
    const exact = candidates.filter((row) => text(row.numero_os1) === text(activity.id_atividade));
    const matches = exact.length ? exact : candidates.filter((row) => wo && wo === text(row.numero_os)
      && city && city === normalizeRankingCity(row.cidade)
      && normalizePersonName(activity.tipo_atividade) === normalizePersonName(row.tipo_atividade));
    if (!matches.length) return activity;
    matches.forEach((row) => consumed.add(row.id));
    const outcomes = new Set(matches.map((row) => JSON.stringify([
      normalizePersonName(row.status_atividade), normalizePersonName(row.cod_baixa_1),
    ])));
    if (outcomes.size !== 1) return activity;

    const current = matches[0];
    const status = text(current.status_atividade);
    const sourceStatus = normalizePersonName(activity.status_atividade);
    const currentStatus = normalizePersonName(status);
    // An older open snapshot must not undo an already closed ranking activity.
    const keepClosedStatus = sourceStatus && !openStatuses.has(sourceStatus) && openStatuses.has(currentStatus);
    const code = text(current.cod_baixa_1);
    return {
      ...activity,
      login_tecnico: activity.login_tecnico || activity.concluiu_atividade || login || null,
      status_atividade: status && !keepClosedStatus ? status : activity.status_atividade,
      // The management table has only code 1; preserve the ranking's secondary task codes.
      codigos_baixa: code ? [...new Set([...activity.codigos_baixa, code])] : activity.codigos_baixa,
    };
  });

  records.forEach((row) => {
    if (consumed.has(row.id) || !text(row.contrato) || !text(row.recurso)) return;
    consumed.add(row.id);
    reconciled.push({
      id_atividade: `gestao:${row.id}`, data_atividade: row.data_atividade,
      login_tecnico: recordLogins.get(row.id) || null, concluiu_atividade: null,
      recurso: text(row.recurso), contrato: text(row.contrato), numero_wo: text(row.numero_os) || null,
      cidade: normalizeRankingCity(row.cidade) || null, status_atividade: text(row.status_atividade),
      tipo_atividade: text(row.tipo_atividade), codigos_baixa: text(row.cod_baixa_1) ? [text(row.cod_baixa_1)] : [],
      credenciada_anterior: null,
    });
  });
  return reconciled;
}
