export interface ComissionamentoData {
  id?: string;
  nome: string;
  login_criador: string | null;
  alocacao: string | null;
  data: string | null;
  mes_instalado: string | null;
  tipo_venda: string | null;
  proposta: string | null;
  data_envio_grupo: string | null;
  contrato: string | null;
  valores: number | null;
  data_agen: string | null;
  data_exec: string | null;
  observacoes: string | null;
  janela: string | null;
  pagamento: string | null;
  mes_ano_proposta: string | null;
  status: 'PENDENTE' | 'CONFIRMADA' | 'CANCELADA' | null;
  frente?: string | null;
  row_hash?: string;
  created_at?: string;
}

export interface ComissionamentoFilters {
  cidade: string;
  dataInicio: string;
  dataFim: string;
  status: string;
  nome: string;
  frente: string;
  contrato: string;
  dataExecInicio: string;
  dataExecFim: string;
}

export interface ComissionamentoKPIData {
  confirmadas: number;
  pendentes: number;
  canceladas: number;
  total: number;
  totalValor: number;
}

export interface TechnicianChartData {
  nome: string;
  cidade: string;
  pendente: number;
  confirmada: number;
  cancelada: number;
}

export interface RankingData {
  nome: string;
  totalContratos: number;
  totalValor: number;
}

export interface TecnicoFrente {
  id?: string;
  nome: string;
  frente: string;
  cidade: string | null;
}

export interface FrenteKPIData {
  frente: string;
  qtdConsultivo: number; 
  totalGeral: number;          // total contracts (all statuses)
  pctConfirmada: number;       // % confirmed over total      // confirmed contracts count
  totalTecnicos: number;       // total technicians in frente
  tecAdherente: number;        // technicians with at least 1 confirmed sale
  pctTecAdherente: number;     // % tec aderente
  tecNaoVenderam: string[];    // technicians who didn't sell
}