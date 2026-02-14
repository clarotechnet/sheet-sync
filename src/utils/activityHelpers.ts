import { ActivityData, ActivityStatus, TechnicianProductivity, ActivityCount } from '@/types/activity';
import { EXCLUDED_SERVICE_TYPES } from '@/config/constants';

export const getActivityStatus = (item: ActivityData): ActivityStatus => {
   // Verifica se o status da atividade é "Cancelado"
  const statusAtividade = (item['Status da Atividade'] || '').trim().toLowerCase();
  if (statusAtividade === 'cancelado' || statusAtividade === 'cancelada') {
    return 'Cancelado';
  }

  const baixa = item['Cód de Baixa 1'] || '';
  const match = baixa.match(/^(\d+)/);
  
  if (match) {
    const code = parseInt(match[1], 10);
    if (code >= 409) {
      return 'Produtiva';
    } else {
      return 'Improdutiva';
    }
  }
  return 'Pendente';
};

export const getTechnicianDisplayName = (fullName: string | undefined): string => {
  if (!fullName) return 'Não Informado';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`.trim();
};

export const parseDurationToMinutes = (durationStr: string | undefined): number => {
  if (!durationStr) return 0;
  const str = String(durationStr).trim();
  if (!str || str === '0' || str === '00:00' || str === '00:00:00') return 0;
  
  // Formato Excel/Sheets: data ISO como "1899-12-30T05:01:28.000Z"
  // O Excel armazena tempo como fração de dia a partir de 1899-12-30
  if (str.includes('1899-12-30') || str.includes('1899-12-31') || str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)) {
    try {
      const date = new Date(str);
      if (!isNaN(date.getTime())) {
        const hours = date.getUTCHours();
        const minutes = date.getUTCMinutes();
        const seconds = date.getUTCSeconds();
        const totalMinutes = hours * 60 + minutes + seconds / 60;
        if (totalMinutes > 0) {
          return totalMinutes;
        }
      }
    } catch (e) {
      // Continua para outros parsers
    }
  }
  
  // Tenta formato HH:MM:SS (horas:minutos:segundos)
  const hmsMatch = str.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hmsMatch) {
    const hours = parseInt(hmsMatch[1], 10) || 0;
    const minutes = parseInt(hmsMatch[2], 10) || 0;
    return hours * 60 + minutes;
  }
  
  // Tenta formato HH:MM (horas:minutos)
  const hmMatch = str.match(/^(\d+):(\d{2})$/);
  if (hmMatch) {
    const hours = parseInt(hmMatch[1], 10) || 0;
    const minutes = parseInt(hmMatch[2], 10) || 0;
    return hours * 60 + minutes;
  }
  
  // Tenta formato "Xh Ym" ou "X horas Y minutos"
  const textMatch = str.match(/(\d+)\s*h(?:oras?)?\s*(?:(\d+)\s*m(?:in(?:utos?)?)?)?/i);
  if (textMatch) {
    const hours = parseInt(textMatch[1], 10) || 0;
    const minutes = parseInt(textMatch[2], 10) || 0;
    return hours * 60 + minutes;
  }
  
  // Tenta apenas minutos
  const minMatch = str.match(/^(\d+)\s*m(?:in(?:utos?)?)?$/i);
  if (minMatch) {
    return parseInt(minMatch[1], 10) || 0;
  }
  
  // Tenta número puro (assume minutos)
  const numMatch = str.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    return Math.round(parseFloat(numMatch[1]));
  }
  
  return 0;
};

export const formatMinutesToTime = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  const pad = (num: number) => num < 10 ? '0' + num : num;
  return `${pad(hours)}:${pad(minutes)}`;
};

export const parseBRDate = (dateStr: string | Date | undefined): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) return dateStr;
  if (typeof dateStr === 'string') {
    const str = dateStr.trim();
    
    // Format: dd/mm/yyyy or dd/mm/yy
    const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (brMatch) {
      const day = parseInt(brMatch[1], 10);
      const month = parseInt(brMatch[2], 10) - 1;
      let year = parseInt(brMatch[3], 10);
      if (year < 100) year += 2000;
      const dateObj = new Date(year, month, day);
      return isNaN(dateObj.getTime()) ? null : dateObj;
    }
    
    // Format: yyyy-mm-dd (ISO)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const dateObj = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      return isNaN(dateObj.getTime()) ? null : dateObj;
    }
  }
  return null;
};

export const extractDateFromInterval = (interval: string | undefined): Date | null => {
  if (!interval) return null;
  // "Intervalo de Tempo" format: "08/01/2025 07:30 - 08/01/2025 08:30"
  const match = interval.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    const dateObj = new Date(year, month, day);
    return isNaN(dateObj.getTime()) ? null : dateObj;
  }
  return null;
};

export const filterExcludedServiceTypes = (data: ActivityData[]): ActivityData[] => {
  return data.filter(item => {
    const type = (item['Tipo de Atividade'] || '').toLowerCase();
    return !EXCLUDED_SERVICE_TYPES.includes(type);
  });
};

// Função auxiliar para encontrar valor de duração em diferentes colunas
const findDurationValue = (item: ActivityData): string | undefined => {
  // Lista de possíveis nomes de coluna para duração (case-insensitive)
  const durationKeys = [
    'Duração', 'duração', 'DURAÇÃO',
    'Tempo', 'tempo', 'TEMPO',
    'Tempo de Atendimento', 'tempo de atendimento',
    'Duration', 'duration', 'DURATION',
    'Duracao', 'duracao', 'DURACAO',
    'Tempo Atendimento', 'tempo atendimento'
  ];
  
  // Procura diretamente
  for (const key of durationKeys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') {
      return String(item[key]);
    }
  }
  
  // Procura por chave que contenha "dura" ou "tempo" (case-insensitive)
  const itemKeys = Object.keys(item);
  for (const key of itemKeys) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('dura') || lowerKey.includes('tempo') || lowerKey.includes('duration')) {
      const value = item[key];
      if (value !== undefined && value !== null && value !== '') {
        return String(value);
      }
    }
  }
  
  return undefined;
};

export const calculateKPIs = (data: ActivityData[]) => {
  const filteredData = filterExcludedServiceTypes(data);
  
  const total = filteredData.length;
  const productive = filteredData.filter(item => getActivityStatus(item) === 'Produtiva').length;
  const unproductive = filteredData.filter(item => getActivityStatus(item) === 'Improdutiva').length;
  const technicians = new Set(filteredData.map(item => item.Recurso).filter(Boolean)).size;
  
  // Calcula tempo médio considerando múltiplas colunas possíveis para duração
  let totalMinutes = 0;
  let itemsWithDuration = 0;
  
  // Debug: log das colunas do primeiro item para verificar nome correto
  if (filteredData.length > 0) {
    const firstItem = filteredData[0];
    const keys = Object.keys(firstItem);
    console.log('Colunas disponíveis nos dados:', keys);
    const durationVal = findDurationValue(firstItem);
    console.log('Valor de duração encontrado no primeiro item:', durationVal);
  }
  
  filteredData.forEach(item => {
    const durationValue = findDurationValue(item);
    const minutes = parseDurationToMinutes(durationValue);
    
    if (minutes > 0) {
      totalMinutes += minutes;
      itemsWithDuration++;
    }
  });
  
  console.log(`KPI Duração: ${itemsWithDuration} itens com duração, total ${totalMinutes} minutos`);
  
  // Usa itemsWithDuration para média mais precisa (ignora itens sem duração)
  const avgDuration = itemsWithDuration > 0 ? formatMinutesToTime(totalMinutes / itemsWithDuration) : '00:00';
  
  return {
    total,
    productive,
    unproductive,
    technicians,
    avgDuration,
    totalMinutes,
    itemsWithDuration
  };
};

export const calculateTechnicianProductivity = (data: ActivityData[]): TechnicianProductivity[] => {
  const techData: Record<string, { total: number; productive: number }> = {};
  
  data.forEach(item => {
    const tech = getTechnicianDisplayName(item.Recurso);
    const isProductive = getActivityStatus(item) === 'Produtiva';
    
    if (!techData[tech]) {
      techData[tech] = { total: 0, productive: 0 };
    }
    techData[tech].total++;
    if (isProductive) {
      techData[tech].productive++;
    }
  });
  
  return Object.entries(techData)
    .map(([name, stats]) => ({
      name,
      productivity: stats.total > 0 ? (stats.productive / stats.total) * 100 : 0,
      count: stats.total,
      productiveCount: stats.productive
    }))
    .filter(t => t.name !== 'Não Informado' && t.count > 0)
    .sort((a, b) => b.productivity - a.productivity);
};

export const calculateActivityCounts = (data: ActivityData[]): Record<string, ActivityCount> => {
  const counts: Record<string, ActivityCount> = {};
  
  data.forEach(item => {
    const type = item['Tipo de Atividade'] || 'Não Informado';
    const isProductive = getActivityStatus(item) === 'Produtiva';
    
    if (!counts[type]) {
      counts[type] = { total: 0, productive: 0 };
    }
    counts[type].total++;
    if (isProductive) {
      counts[type].productive++;
    }
  });
  
  return counts;
};
