import type { GatilhoRankingItem, GatilhoTipo, GatilhoVinculo } from '../types/gatilhos';
import { getGatilhoTipoLabel } from '../types/gatilhos.ts';

export interface GatilhosReportContext {
  periodo: { inicio: string; fim: string };
  tipo: 'TODOS' | GatilhoTipo;
  cidade: string;
  busca: string;
}

export interface GatilhosReportMember {
  id: string;
  nome: string;
  cpf: string;
  setor: string;
  papel: string;
}

export interface GatilhosReportRow {
  posicao: number;
  id: string;
  tipo: string;
  cidade: string;
  equipe: boolean;
  membros: GatilhosReportMember[];
  valorImportado: number;
  pontuacao: number;
  ajustado: boolean;
  motivoAjuste: string;
  nivel: number | null;
  premio: number;
  instalador: number;
  auxiliar: number;
  deslocamento: number;
  inicio: string;
  fim: string;
}

export interface GatilhosReport {
  geradoEm: string;
  contexto: GatilhosReportContext;
  linhas: GatilhosReportRow[];
  totais: { ids: number; equipes: number; colaboradores: number; pontos: number; valorImportado: number; premio: number; instalador: number; auxiliar: number; deslocamento: number };
}

export const formatReportCpf = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Não informado';
  const digits = raw.replace(/[.\-\s]/g, '');
  return /^\d{11}$/.test(digits) ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : raw;
};

export function buildGatilhosReport(
  ranking: GatilhoRankingItem[], vinculos: GatilhoVinculo[], contexto: GatilhosReportContext, now = new Date(),
): GatilhosReport {
  const seen = new Set<string>();
  const linhas: GatilhosReportRow[] = [];
  ranking.forEach((item) => {
    const key = `${item.periodo_inicio}|${item.id_externo}`;
    if (item.periodo_inicio !== contexto.periodo.inicio || seen.has(key)) return;
    seen.add(key);
    const people = new Set<string>();
    const membros = vinculos.filter((link) => link.id_externo === item.id_externo)
      .sort((a, b) => (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1))
      .flatMap((link) => {
        if (people.has(link.colaborador_id)) return [];
        people.add(link.colaborador_id);
        // Personal data is joined only by the registered collaborator ID, never by a name guess.
        const pessoa = link.colaborador?.id === link.colaborador_id ? link.colaborador : null;
        return [{
          id: link.colaborador_id, nome: pessoa?.nome?.trim() || 'Cadastro não disponível',
          cpf: formatReportCpf(pessoa?.cpf), setor: pessoa?.setor?.trim() || 'Não informado',
          papel: link.papel === 'AUXILIAR' ? 'Auxiliar' : 'Instalador',
        }];
      });
    linhas.push({
      posicao: linhas.length + 1, id: item.id_externo, tipo: getGatilhoTipoLabel(item.tipo),
      cidade: item.cidade || 'Não informada', equipe: item.tipo === 'DUPLA' || membros.length > 1, membros,
      valorImportado: Number(item.valor), pontuacao: Number(item.pontuacao), ajustado: item.valor_ajustado != null,
      motivoAjuste: item.ajuste_motivo || '', nivel: item.faixa_atual?.nivel ?? null, premio: Number(item.premio),
      instalador: Number(item.valor_instalador), auxiliar: Number(item.valor_auxiliar), deslocamento: Number(item.valor_deslocamento),
      inicio: item.periodo_inicio, fim: item.periodo_fim,
    });
  });
  const colaboradores = new Set(linhas.flatMap((row) => row.membros.map((member) => member.id)));
  return {
    geradoEm: now.toISOString(), contexto: { ...contexto, periodo: { ...contexto.periodo } }, linhas,
    totais: {
      ids: linhas.length, equipes: linhas.filter((row) => row.equipe).length, colaboradores: colaboradores.size,
      pontos: linhas.reduce((sum, row) => sum + row.pontuacao, 0), valorImportado: linhas.reduce((sum, row) => sum + row.valorImportado, 0),
      premio: linhas.reduce((sum, row) => sum + row.premio, 0), instalador: linhas.reduce((sum, row) => sum + row.instalador, 0),
      auxiliar: linhas.reduce((sum, row) => sum + row.auxiliar, 0), deslocamento: linhas.reduce((sum, row) => sum + row.deslocamento, 0),
    },
  };
}
