export interface ActivityData {
  Recurso?: string;
  "Intervalo de Tempo"?: string;
  "Tipo de Atividade"?: string;
  "Cód de Baixa 1"?: string;
  Duração?: string;
  Bairro?: string;
  Latitude?: string;
  Longitude?: string;
  Data?: string;
  [key: string]: string | undefined;
}

export interface TechnicianProductivity {
  name: string;
  productivity: number;
  count: number;
  productiveCount: number;
}

export interface ActivityCount {
  total: number;
  productive: number;
}

export interface FilterState {
  technicians: string[];
  activityTypes: string[];
  searchText: string;
  startDate: string;
  endDate: string;
  cities: string[];
  productivityFilter: 'all' | 'productive' | 'unproductive' | 'pending' | 'cancelled';
}

export type ActivityStatus = 'Produtiva' | 'Improdutiva' | 'Pendente' | 'Cancelado';
