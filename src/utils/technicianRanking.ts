import type { RankingActivity, RankingTechnicianInput, TechnicianRankingRow, RankedContract, RankedReturn, DatabaseReturnRecord } from '@/types/technicianRanking';
import { normalizePersonName } from './normalizeName.ts';

const text = (value: unknown) => String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const headerKey = (value: unknown) => normalizePersonName(text(value)).replace(/[^A-Z0-9]/g, '');
export const normalizeTechnicianLogin = (value: unknown) => text(value).toUpperCase();
export const normalizeRankingCity = (value: unknown) => text(value)
  .replace(/\s*[/-]\s*(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/i, '')
  .trim().toLocaleUpperCase('pt-BR');

function isoDate(value: unknown): string | null {
  let year: number, month: number, day: number;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.getUTCFullYear() >= 1900 ? date.toISOString().slice(0, 10) : null;
  }
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) [year, month, day] = [Number(br[3]) + (br[3].length === 2 ? 2000 : 0), Number(br[2]), Number(br[1])];
  else return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const workbookRows = (rows: unknown[][]) => {
  const headerIndex = rows.findIndex((row) => row.some((cell) => ['LOGIN', 'LOGINDOTECNICO'].includes(headerKey(cell))));
  if (headerIndex < 0) throw new Error('Cabeçalho com a coluna de login não encontrado.');
  return { headers: rows[headerIndex].map(headerKey), data: rows.slice(headerIndex + 1), headerIndex };
};

export function parseRankingTechnicians(rows: unknown[][]): RankingTechnicianInput[] {
  const { headers, data, headerIndex } = workbookRows(rows);
  const fields = ['LOGIN', 'NOME', 'CIDADE', 'SUPERVISOR'];
  const indexes = fields.map((key) => headers.indexOf(key));
  if (indexes.some((index) => index < 0)) throw new Error('O cadastro precisa das colunas Login, Nome, Cidade e Supervisor.');
  const seen = new Set<string>();
  const result = data.flatMap((row, index) => {
    if (row.every((cell) => !text(cell))) return [];
    const [login, nome, cidade, supervisor] = indexes.map((column) => text(row[column]));
    const normalizedLogin = normalizeTechnicianLogin(login);
    if (![normalizedLogin, nome, cidade, supervisor].every(Boolean)) throw new Error(`Linha ${headerIndex + index + 2}: preencha Login, Nome, Cidade e Supervisor.`);
    if (/\s/.test(normalizedLogin)) throw new Error(`Linha ${headerIndex + index + 2}: o login não pode conter espaços.`);
    if (seen.has(normalizedLogin)) throw new Error(`O login ${normalizedLogin} aparece mais de uma vez no cadastro.`);
    seen.add(normalizedLogin);
    return [{ login: normalizedLogin, nome, cidade: normalizeRankingCity(cidade), supervisor: supervisor.toLocaleUpperCase('pt-BR') }];
  });
  if (!result.length) throw new Error('Nenhum cadastro encontrado na planilha.');
  return result;
}

export function parseRankingActivities(rows: unknown[][]): RankingActivity[] {
  const { headers, data, headerIndex } = workbookRows(rows);
  const required = ['RECURSO', 'LOGINDOTECNICO', 'DATA', 'CONTRATO', 'STATUSDAATIVIDADE', 'IDDAATIVIDADE', 'TIPODEATIVIDADE', 'CODDEBAIXA1'];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`O arquivo não possui todas as colunas do ranking: ${missing.join(', ')}.`);
  const get = (row: unknown[], key: string) => text(row[headers.indexOf(key)]);
  const typeColumns = headers.flatMap((key, index) => key === 'TIPODEATIVIDADE' ? [index] : []);
  const typeColumn = [...typeColumns].sort((a, b) => {
    const score = (column: number) => new Set(data.map((row) => headerKey(row[column])).filter((value) => value && value !== 'NORMAL')).size;
    return score(b) - score(a);
  })[0];
  const codeColumns = headers.flatMap((key, index) => /^CODDEBAIXA\d+$/.test(key) ? [index] : []);
  const seen = new Set<string>();
  const result = data.flatMap((row, index) => {
    if (row.every((cell) => !text(cell))) return [];
    const id = get(row, 'IDDAATIVIDADE');
    const date = isoDate(row[headers.indexOf('DATA')]);
    if (!id || !date) throw new Error(`Linha ${headerIndex + index + 2}: ID da Atividade ou Data inválidos.`);
    if (seen.has(id)) throw new Error(`O ID da Atividade ${id} aparece mais de uma vez no arquivo.`);
    seen.add(id);
    return [{
      id_atividade: id, data_atividade: date,
      login_tecnico: normalizeTechnicianLogin(get(row, 'LOGINDOTECNICO')) || null,
      concluiu_atividade: normalizeTechnicianLogin(get(row, 'CONCLUIUATIVIDADE')) || null,
      recurso: get(row, 'RECURSO'), contrato: get(row, 'CONTRATO') || null,
      numero_wo: get(row, 'NUMERODAWO') || null, cidade: normalizeRankingCity(get(row, 'CIDADE')) || null,
      status_atividade: get(row, 'STATUSDAATIVIDADE'), tipo_atividade: text(row[typeColumn]),
      codigos_baixa: [...new Set(codeColumns.map((column) => text(row[column])).filter(Boolean))],
      credenciada_anterior: get(row, 'CREDENCIADAPARCEIRAANTERIOR') || null,
    }];
  });
  if (!result.length) throw new Error('Nenhuma atividade encontrada na planilha.');
  return result;
}

export const hasCode409 = (codes: string[]) => codes.some((code) => /^0*409(?:\D|$)/.test(code.trim()));
export const isAccreditedReturn = (type: string) => /^RETORNO (?:A )?CREDENCIAD[AO]S?$/.test(normalizePersonName(type));

export function resolveRankingReturns(activities: RankingActivity[], records: DatabaseReturnRecord[]): RankedReturn[] {
  const byContractDate = new Map<string, DatabaseReturnRecord[]>();
  records.filter((row) => isAccreditedReturn(row.tipo_atividade)).forEach((row) => {
    const key = `${row.data_atividade}|${row.contrato.trim()}`;
    byContractDate.set(key, [...(byContractDate.get(key) || []), row]);
  });
  const groups = new Map<string, RankingActivity[]>();
  activities.filter((row) => row.contrato?.trim() && isAccreditedReturn(row.tipo_atividade)).forEach((row) => {
    const key = `${row.data_atividade}|${row.contrato!.trim()}|${normalizeRankingCity(row.cidade)}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  return [...groups.values()].map((rows) => {
    const first = rows[0];
    const offenders = new Map<string, string>();
    let pendencia: string | null = null;
    rows.forEach((activity) => {
      const city = normalizeRankingCity(activity.cidade);
      const matches = (byContractDate.get(`${activity.data_atividade}|${activity.contrato!.trim()}`) || [])
        .filter((row) => (!city || !row.cidade || normalizeRankingCity(row.cidade) === city)
          && (!activity.numero_wo || row.numero_os?.trim() === activity.numero_wo.trim()));
      if (!matches.length) pendencia = 'Retorno ainda não localizado no Sistema de Gestão.';
      else {
        const names = new Map(matches.filter((row) => row.is_revisita && row.ofensor_revisita?.trim())
          .map((row) => [normalizePersonName(row.ofensor_revisita!), row.ofensor_revisita!.trim()]));
        if (names.size !== 1) pendencia = names.size ? 'Atribuição divergente no histórico.' : 'O trigger ainda não informou o ofensor.';
        names.forEach((name, key) => offenders.set(key, name));
      }
    });
    if (offenders.size > 1) pendencia = 'Atribuição divergente no histórico.';
    return {
      contrato: first.contrato!.trim(), data: first.data_atividade, cidade: normalizeRankingCity(first.cidade),
      ofensor: !pendencia && offenders.size === 1 ? [...offenders.values()][0] : null,
      atendentes: [...new Set(rows.map((row) => row.recurso || row.login_tecnico || 'Não informado'))],
      statuses: [...new Set(rows.map((row) => row.status_atividade))], pendencia,
    };
  }).sort((a, b) => b.data.localeCompare(a.data) || a.contrato.localeCompare(b.contrato));
}

export function calculateTechnicianRanking(activities: RankingActivity[], technicians: RankingTechnicianInput[], returns: RankedReturn[] = []): TechnicianRankingRow[] {
  const byLogin = new Map(technicians.map((row) => [normalizeTechnicianLogin(row.login), row]));
  const byName = new Map<string, RankingTechnicianInput[]>();
  technicians.forEach((row) => { const key = normalizePersonName(row.nome); byName.set(key, [...(byName.get(key) || []), row]); });
  const sourceNames = new Map<string, Map<string, { login: string; cidade: string }>>();
  activities.forEach((row) => {
    const login = normalizeTechnicianLogin(row.login_tecnico || row.concluiu_atividade);
    const name = normalizePersonName(row.recurso), cidade = normalizeRankingCity(row.cidade);
    if (!login || !name) return;
    const matches = sourceNames.get(name) || new Map();
    matches.set(`${login}|${cidade}`, { login, cidade }); sourceNames.set(name, matches);
  });
  const groups = new Map<string, { row: TechnicianRankingRow; contracts: Map<string, RankedContract>; cities: Set<string> }>();
  const ensure = (key: string, login: string, name: string, city: string, registry?: RankingTechnicianInput) => {
    if (!groups.has(key)) groups.set(key, {
      row: { key, login: login || 'Não informado', nome: registry?.nome || name || 'Não informado', cidade: registry?.cidade || city || 'Não informada', supervisor: registry?.supervisor || 'Não cadastrado', cadastrado: Boolean(registry), atividades: 0, contratos: 0, contratos409: 0, porcentagem: null, retornosCredenciados: 0, detalhes: [], retornosDetalhes: [] },
      contracts: new Map(), cities: new Set(),
    });
    return groups.get(key)!;
  };
  activities.forEach((activity) => {
    if (!activity.contrato?.trim()) return;
    let login = normalizeTechnicianLogin(activity.login_tecnico || activity.concluiu_atividade);
    if (!login) {
      const matches = byName.get(normalizePersonName(activity.recurso)) || [];
      if (matches.length === 1) login = normalizeTechnicianLogin(matches[0].login);
    }
    const registry = byLogin.get(login);
    if (registry?.ativo === false) return;
    const key = login || `nome:${normalizePersonName(activity.recurso)}|${normalizeRankingCity(activity.cidade)}`;
    const group = ensure(key, login, activity.recurso, normalizeRankingCity(activity.cidade), registry);
    group.row.atividades += 1;
    if (activity.cidade) group.cities.add(normalizeRankingCity(activity.cidade));
    // A contract is counted once per technician/day, even with multiple tasks or WOs.
    const contractKey = `${activity.data_atividade}|${activity.contrato.trim()}`;
    const contract = group.contracts.get(contractKey) || { contrato: activity.contrato.trim(), data: activity.data_atividade, codigo409: false, retornoCredenciada: false, codigos: [], statuses: [] };
    contract.codigo409 ||= hasCode409(activity.codigos_baixa);
    contract.retornoCredenciada ||= isAccreditedReturn(activity.tipo_atividade);
    contract.codigos = [...new Set([...contract.codigos, ...activity.codigos_baixa])];
    contract.statuses = [...new Set([...contract.statuses, activity.status_atividade])];
    group.contracts.set(contractKey, contract);
  });
  // The existing installation trigger supplies the offender, never the return's executor.
  returns.forEach((item) => {
    if (!item.ofensor) return;
    const name = normalizePersonName(item.ofensor);
    const matches = (byName.get(name) || [])
      .filter((row) => !item.cidade || normalizeRankingCity(row.cidade) === item.cidade);
    // Exact source name/login snapshots preserve identity when a display name is edited.
    const logins = new Set(matches.map((row) => normalizeTechnicianLogin(row.login)));
    (sourceNames.get(name) || new Map()).forEach((row: { login: string; cidade: string }) => {
      if (!item.cidade || !row.cidade || row.cidade === item.cidade) logins.add(row.login);
    });
    const login = logins.size === 1 ? [...logins][0] : '';
    const registry = byLogin.get(login);
    if (registry?.ativo === false) return;
    const key = login || `nome:${normalizePersonName(item.ofensor)}|${item.cidade}`;
    const group = ensure(key, login, item.ofensor, item.cidade, registry);
    if (!group.row.retornosDetalhes.some((row) => row.data === item.data && row.contrato === item.contrato)) group.row.retornosDetalhes.push(item);
    if (item.cidade) group.cities.add(item.cidade);
  });
  return [...groups.values()].map(({ row, contracts, cities }) => {
    const detalhes = [...contracts.values()].sort((a, b) => b.data.localeCompare(a.data) || a.contrato.localeCompare(b.contrato));
    const contratos409 = detalhes.filter((contract) => contract.codigo409).length;
    return { ...row, cidade: row.cadastrado ? normalizeRankingCity(row.cidade) : [...cities].join(' / ') || row.cidade, contratos: detalhes.length, contratos409, porcentagem: detalhes.length ? contratos409 / detalhes.length * 100 : null, retornosCredenciados: row.retornosDetalhes.length, detalhes };
  }).sort((a, b) => (b.porcentagem ?? -1) - (a.porcentagem ?? -1) || b.contratos409 - a.contratos409 || b.contratos - a.contratos || a.nome.localeCompare(b.nome, 'pt-BR'));
}
