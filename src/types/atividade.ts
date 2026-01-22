export interface Atividade {
  id?: number;
  numero_os?: string;
  contrato?: string;
  data_atividade?: string;
  recurso?: string;
  status_atividade?: string;
  tipo_atividade?: string;
  cod_baixa_1?: string;
  intervalo_tempo?: string;
  duracao_minutos?: number;
  latitude?: number;
  longitude?: number;
  cidade?: string;
  bairro?: string;
  tempo_de_deslocamento?: number;
  created_at?: string;
}

// Função para converter Atividade do Supabase para ActivityData (formato legado)
export function atividadeToActivityData(atividade: Atividade): Record<string, string | undefined> {
  return {
    Recurso: atividade.recurso || '',
    'Número da WO': atividade.numero_os || '',
    Contrato: atividade.contrato || '',
    Data: atividade.data_atividade || '',
    'Status da Atividade': atividade.status_atividade || '',
    'Tipo de Atividade': atividade.tipo_atividade || '',
    'Cód de Baixa 1': atividade.cod_baixa_1 || '',
    'Intervalo de Tempo': atividade.intervalo_tempo || '',
    Duração: atividade.duracao_minutos?.toString() || '',
    Latitude: atividade.latitude?.toString() || '',
    Longitude: atividade.longitude?.toString() || '',
    Cidade: atividade.cidade || '',
    cidade: atividade.cidade || '',
    Bairro: atividade.bairro || '',
    'Tempo de Deslocamento': atividade.tempo_de_deslocamento?.toString() || '',
  };
}

// Função para converter ActivityData para Atividade (para inserção)
// Nota: "Coordenada Y" = Latitude, "Coordenada X" = Longitudes
export function activityDataToAtividade(data: Record<string, string | undefined>): Omit<Atividade, 'id' | 'created_at'> {
  // Suporte para ambos os nomes de coluna: Latitude/Longitude e Coordenada Y/Coordenada X
  const latValue = data.Latitude || data['Coordenada Y'];
  const lngValue = data.Longitude || data['Coordenada X'];  
  return {
    numero_os: data['Número da WO'] || undefined,
    contrato: data.Contrato || undefined,
    data_atividade: data.Data || undefined,
    recurso: data.Recurso || undefined,
    status_atividade: data['Status da Atividade'] || undefined,
    tipo_atividade: data['Tipo de Atividade'] || undefined,
    cod_baixa_1: data['Cód de Baixa 1'] || undefined,
    intervalo_tempo: data['Intervalo de Tempo'] || undefined,
    duracao_minutos: data.Duração ? parseInt(data.Duração, 10) || undefined : undefined,
    latitude: latValue ? parseFloat(latValue) || undefined : undefined,
    longitude: lngValue ? parseFloat(lngValue) || undefined : undefined,
    cidade: data.Cidade || data.cidade || undefined,
    bairro: data.Bairro || undefined,
    tempo_de_deslocamento: data['Tempo de Deslocamento'] ? parseInt(data['Tempo de Deslocamento'], 10) || undefined : undefined,
  };
}