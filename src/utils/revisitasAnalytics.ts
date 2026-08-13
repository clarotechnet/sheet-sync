import { ActivityData } from '@/types/activity';

export interface TecnicoRevisita {
  tecnico: string;
  quantidadeOS: number;
  revisitas: number;
  porcentagem: number;
}

export type FaixaRevisita = 'critico' | 'atencao' | 'controlado' | 'sem_base';

const STATUS_CONTABILIZADOS = new Set([
  'concluido',
  'nao concluido',
]);

const normalizeStatus = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const getFaixaRevisita = (tecnico: TecnicoRevisita): FaixaRevisita => {
  if (tecnico.quantidadeOS === 0) return 'sem_base';
  if (tecnico.porcentagem > 10) return 'critico';
  if (tecnico.porcentagem > 5) return 'atencao';
  return 'controlado';
};

export const countRevisitas = (data: ActivityData[]): number =>
  data.reduce(
    (total, item) => total + (item.is_revisita === 'true' ? 1 : 0),
    0
  );

export const calculateTecnicosRevisita = (data: ActivityData[]): TecnicoRevisita[] => {
  const revisitasMap = new Map<string, number>();

  for (const item of data) {
    if (item.is_revisita !== 'true') continue;

    const ofensor = (item.ofensor_revisita || '').trim();
    if (ofensor) {
      revisitasMap.set(ofensor, (revisitasMap.get(ofensor) || 0) + 1);
    }
  }

  const osMap = new Map<string, number>();

  for (const item of data) {
    const recurso = (item.Recurso || item.recurso || '').trim();
    if (!recurso || !revisitasMap.has(recurso)) continue;

    const status = normalizeStatus(item['Status da Atividade'] || '');
    if (STATUS_CONTABILIZADOS.has(status)) {
      osMap.set(recurso, (osMap.get(recurso) || 0) + 1);
    }
  }

  return Array.from(revisitasMap, ([tecnico, revisitas]) => {
    const quantidadeOS = osMap.get(tecnico) || 0;

    return {
      tecnico,
      quantidadeOS,
      revisitas,
      porcentagem: quantidadeOS > 0 ? (revisitas / quantidadeOS) * 100 : 0,
    };
  });
};
