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
  duracao_minutos?: number; // INT4
  latitude?: number;
  longitude?: number;
  cidade?: string;
  bairro?: string;
  tempo_de_deslocamento?: string; // Formato TIME (HH:MM:SS)
  numero_os1?: string;
  created_at?: string;
  contador_log?: string;
  tecnico_referencia?: string;
}


// Converte data BR (dd/mm/yy ou dd/mm/yyyy) para ISO (yyyy-mm-dd)
export function brToIsoDate(br: string | undefined): string | undefined {
  if (!br) return undefined;
  const parts = br.split("/");
  if (parts.length !== 3) return br; // Retorna original se não for formato BR
  const [dd, mm, yy] = parts;
  let year = yy;
  // Se vier com 2 dígitos, assume 2000+
  if (yy.length === 2) year = String(2000 + Number(yy));
  return `${year.padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

// Converte data ISO (yyyy-mm-dd) para BR (dd/mm/yyyy)
export function isoToBrDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  // Verifica se já está em formato BR
  if (iso.includes("/")) return iso;
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [year, mm, dd] = parts;
  return `${dd}/${mm}/${year}`;
}

// Converte minutos (número ou string) para formato TIME (HH:MM:SS)
export function minutesToTimeFormat(value: string | undefined): string | undefined {
  if (!value) return undefined;

  // Se já estiver em formato HH:MM ou HH:MM:SS, retorna como está
  if (value.includes(':')) {
    const parts = value.split(':');
    if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
    if (parts.length === 3) return value;
  }

  // Se for número (minutos), converte para HH:MM:SS
  const minutes = parseInt(value, 10);
  if (isNaN(minutes)) return undefined;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
}

// Converte formato TIME (HH:MM:SS) para string de exibição
export function timeFormatToDisplay(value: string | undefined): string {
  if (!value) return '';
  // Remove segundos se houver
  const parts = value.split(':');
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return value;
}


// Função para converter Atividade do Supabase para ActivityData (formato legado)
export function atividadeToActivityData(atividade: Atividade): Record<string, string | undefined> {
  return {
    Recurso: atividade.recurso || '',
    'Número da WO': atividade.numero_os || '',
    Contrato: atividade.contrato || '',
    Data: isoToBrDate(atividade.data_atividade) || '',
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
    'Número da O.S 1': atividade.numero_os1 || '',
    'Tempo de Deslocamento': timeFormatToDisplay(atividade.tempo_de_deslocamento),
    'Contador Log': atividade.contador_log || '',
    'Técnico Referência': atividade.tecnico_referencia || '',
  };
}

// Função para converter ActivityData para Atividade (para inserção)
// Nota: "Coordenada Y" = Latitude, "Coordenada X" = Longitudes
export function activityDataToAtividade(data: Record<string, string | undefined>): Omit<Atividade, 'id' | 'created_at'> {
  // Suporte para ambos os nomes de coluna: Latitude/Longitude e Coordenada Y/Coordenada X
  const latValue = data.Latitude || data['Coordenada Y'];
  const lngValue = data.Longitude || data['Coordenada X']; 
   // Parse duração: pode vir como "01:17" ou como número de minutos
  let duracaoMinutos: number | undefined = undefined;
  const duracaoStr = data.Duração || data['Duração'];
  if (duracaoStr) {
    if (duracaoStr.includes(':')) {
      // Formato HH:MM ou HH:MM:SS
      const parts = duracaoStr.split(':');
      const hours = parseInt(parts[0], 10) || 0;
      const mins = parseInt(parts[1], 10) || 0;
      duracaoMinutos = hours * 60 + mins;
    } else {
      duracaoMinutos = parseInt(duracaoStr, 10) || undefined;
    }
  }
  return {
    numero_os: data['Número da WO'] || undefined,
    numero_os1: data['Número da O.S 1'] || undefined,
    contrato: data.Contrato || undefined,
    data_atividade: brToIsoDate(data.Data),
    recurso: data.Recurso || undefined,
    status_atividade: data['Status da Atividade'] || undefined,
    tipo_atividade: data['Tipo de Atividade'] || undefined,
    cod_baixa_1: data['Cód de Baixa 1'] || undefined,
    intervalo_tempo: data['Intervalo de Tempo'] || undefined,
    duracao_minutos: duracaoMinutos,
    latitude: latValue ? parseFloat(latValue) || undefined : undefined,
    longitude: lngValue ? parseFloat(lngValue) || undefined : undefined,
    cidade: data.Cidade || data.cidade || undefined,
    bairro: data.Bairro || undefined,
    tempo_de_deslocamento: minutesToTimeFormat(data['Tempo de Deslocamento']),
    contador_log: data['Contador Log'] || undefined,
    tecnico_referencia: data['Técnico Referência'] || undefined,
  };
}