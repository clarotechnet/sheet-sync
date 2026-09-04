import type { ColaboradorCadastrado, TecnicoFrente } from '@/types/comissionamento';

export type GatilhoTipo = 'DUPLA' | 'INDIVIDUAL_CARRO' | 'MOTO' | 'DESCONEXAO';

export interface GatilhoResultado {
  id_externo: string;
  valor: number;
  valor_instalador: number;
  valor_auxiliar: number;
  valor_deslocamento: number;
  periodo_inicio: string;
  periodo_fim: string;
  arquivo_nome: string | null;
  importado_em: string;
  importado_por: string | null;
}

export interface GatilhoVinculo {
  id: string;
  id_externo: string;
  colaborador_id: string;
  cidade: string | null;
  tipo: GatilhoTipo | null;
  papel: 'INSTALADOR' | 'AUXILIAR';
  colaborador: ColaboradorCadastrado;
}

export interface GatilhoFaixa {
  id: string;
  tipo: GatilhoTipo;
  nivel: number;
  pontos: number;
  premio: number;
}

export interface GatilhoRankingItem extends GatilhoResultado {
  nomes: string[];
  nome_exibicao: string;
  cidade: string | null;
  tipo: GatilhoTipo | null;
  vinculado: boolean;
  faixa_atual: GatilhoFaixa | null;
  proxima_faixa: GatilhoFaixa | null;
  premio: number;
}

export interface GatilhoImportRow {
  id_externo: string;
  valor: number;
  valor_instalador: number;
  valor_auxiliar: number;
  valor_deslocamento: number;
}

export interface GatilhosDataState {
  resultados: GatilhoResultado[];
  vinculos: GatilhoVinculo[];
  faixas: GatilhoFaixa[];
  colaboradores: ColaboradorCadastrado[];
  tecnicosFrente: TecnicoFrente[];
}

export const GATILHO_TIPOS: Array<{ value: GatilhoTipo; label: string; shortLabel: string }> = [
  { value: 'DUPLA', label: 'Dupla', shortLabel: 'Duplas' },
  { value: 'INDIVIDUAL_CARRO', label: 'Individual carro', shortLabel: 'Ind. carros' },
  { value: 'MOTO', label: 'Moto serviço', shortLabel: 'Motos serv.' },
  { value: 'DESCONEXAO', label: 'Desconexão', shortLabel: 'Desconexão' },
];

export const GATILHO_CIDADES = ['FORTALEZA', 'MOSSORÓ', 'NATAL/PARNAMIRIM', 'RECIFE'] as const;

export const getGatilhoTipoLabel = (tipo: GatilhoTipo | null | undefined) =>
  GATILHO_TIPOS.find((item) => item.value === tipo)?.label || 'Não classificado';

