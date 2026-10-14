export interface RankingTechnicianInput {
  login: string;
  nome: string;
  cidade: string;
  supervisor: string;
}

export interface RankingTechnician extends RankingTechnicianInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface RankingActivity {
  id_atividade: string;
  data_atividade: string;
  login_tecnico: string | null;
  concluiu_atividade: string | null;
  recurso: string;
  contrato: string | null;
  numero_wo: string | null;
  cidade: string | null;
  status_atividade: string;
  tipo_atividade: string;
  codigos_baixa: string[];
  credenciada_anterior: string | null;
  arquivo_nome?: string | null;
  importado_em?: string;
}

export interface RankedContract {
  contrato: string;
  data: string;
  codigo409: boolean;
  retornoCredenciada: boolean;
  codigos: string[];
  statuses: string[];
}

export interface DatabaseReturnRecord {
  id: string;
  contrato: string;
  data_atividade: string;
  numero_os: string | null;
  cidade: string | null;
  tipo_atividade: string;
  is_revisita: boolean;
  ofensor_revisita: string | null;
}

export interface RankedReturn {
  contrato: string;
  data: string;
  cidade: string;
  ofensor: string | null;
  atendentes: string[];
  statuses: string[];
  pendencia: string | null;
}

export interface TechnicianRankingRow {
  key: string;
  login: string;
  nome: string;
  cidade: string;
  supervisor: string;
  cadastrado: boolean;
  atividades: number;
  contratos: number;
  contratos409: number;
  porcentagem: number | null;
  retornosCredenciados: number;
  detalhes: RankedContract[];
  retornosDetalhes: RankedReturn[];
}
