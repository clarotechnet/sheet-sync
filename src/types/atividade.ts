export interface Atividade {
  id?: number;
  numero_os?: string;
  contrato?: string;
  data_atividade?: string;
  recurso?: string;
  status_atividade?: string;
  tipo_atividade?: string;
  tipo_os1?: string;
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
  is_revisita?: boolean;
  ofensor_revisita?: string;
  status_execucao?: string;
  habilidade_trabalho?: string;
  tecnologia?: string;
}


const normalizeTextField = (value: string | undefined): string | undefined => {
  const text = String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || undefined;
};

// Converte datas aceitas para ISO date puro (yyyy-mm-dd).
export function brToIsoDate(br: string | undefined): string | undefined {
  if (!br) return undefined;

  const value = String(br).trim();
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const brMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!brMatch) return undefined;

  const day = Number(brMatch[1]);
  const month = Number(brMatch[2]);
  let year = Number(brMatch[3]);

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return undefined;
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;

  if (year < 100) year += 2000;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
    'Tipo O.S 1': atividade.tipo_os1 || '',
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
    'is_revisita': atividade.is_revisita ? 'true' : 'false',
    'ofensor_revisita': atividade.ofensor_revisita || '',
    'Motivo de Fechamento Externo': atividade.status_execucao || '',
    'Habilidade de Trabalho': atividade.habilidade_trabalho || '',
    Tecnologia: atividade.tecnologia || '',
  };
}

// Função para converter ActivityData para Atividade (para inserção)
// Nota: "Coordenada Y" = Latitude, "Coordenada X" = Longitudes
export function activityDataToAtividade(data: Record<string, string | undefined>): Omit<Atividade, 'id' | 'created_at'> {
  // Suporte para ambos os nomes de coluna: Latitude/Longitude e Coordenada Y/Coordenada X
  const latValue = data.Latitude || data['Coordenada Y'];
  const lngValue = data.Longitude || data['Coordenada X'];
  const habilidadeTrabalho = data['Habilidade de Trabalho']?.trim() || undefined;
  const tipoAtividade = data['Tipo de Atividade']?.trim() || undefined;
  const normalizeClassificationText = (value: string | undefined) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('pt-BR');
  const tiposSemTecnologia = new Set([
    'retirada equipamento',
    'desconexao opcao',
    'desconexao inad',
    'retirar ponto',
  ]);
  const tipoAtividadeNormalizado = normalizeClassificationText(tipoAtividade);
  const habilidadeNormalizada = normalizeClassificationText(habilidadeTrabalho);
  const tecnologia: 'GPON' | 'HFC' | undefined = !habilidadeTrabalho || tiposSemTecnologia.has(tipoAtividadeNormalizado)
    ? undefined
    : /\bpon\b/i.test(habilidadeNormalizada) || habilidadeNormalizada.includes('sinergia mdu')
      ? 'GPON'
      : 'HFC';
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
    numero_os: normalizeTextField(data['Número da WO']),
    numero_os1: normalizeTextField(data['Número da O.S 1']),
    contrato: normalizeTextField(data.Contrato),
    data_atividade: brToIsoDate(data.Data),
    recurso: normalizeTextField(data.Recurso),
    status_atividade: normalizeTextField(data['Status da Atividade']),
    tipo_atividade: tipoAtividade,
    tipo_os1: normalizeTextField(data['Tipo O.S 1']),
    cod_baixa_1: normalizeTextField(data['Cód de Baixa 1']),
    intervalo_tempo: normalizeTextField(data['Intervalo de Tempo']),
    duracao_minutos: duracaoMinutos,
    latitude: latValue ? parseFloat(latValue) || undefined : undefined,
    longitude: lngValue ? parseFloat(lngValue) || undefined : undefined,
    cidade: normalizeTextField(data.Cidade || data.cidade),
    bairro: normalizeTextField(data.Bairro),
    tempo_de_deslocamento: minutesToTimeFormat(data['Tempo de Deslocamento']),
    tecnico_referencia: normalizeTextField(data['Técnico Referência']),
    is_revisita: data['is_revisita'] === 'true',
    ofensor_revisita: normalizeTextField(data['ofensor_revisita']),
    status_execucao: normalizeTextField(data['Motivo de Fechamento Externo']) || null,
    habilidade_trabalho: habilidadeTrabalho,
    tecnologia: tecnologia,
  };
}
