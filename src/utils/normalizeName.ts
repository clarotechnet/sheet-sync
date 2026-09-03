export const normalizePersonName = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLocaleUpperCase('pt-BR');
