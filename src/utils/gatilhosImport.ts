import * as XLSX from 'xlsx';
import type { GatilhoImportRow, GatilhoVinculo } from '@/types/gatilhos';

type ImportFile = Pick<File, 'name' | 'arrayBuffer'>;
// Keep the batch within the existing substituir_gatilhos_resultados RPC limit.
const MAX_IMPORT_ROWS = 5000;

export interface GatilhosImportBatch {
  rows: GatilhoImportRow[];
  arquivoNome: string;
  totalArquivosAceitos: number;
  conflitos: Array<{ idExterno: string; nomes: string[]; arquivos: string[]; ocorrencias: number }>;
  falhas: Array<{ arquivo: string; motivo: string }>;
}

const normalizeLabel = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLocaleLowerCase('pt-BR');

const parseDecimal = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '')
    .replace(/R\$/gi, '').replace(/\s/g, '').replace(/\.(?=.*[,])/g, '')
    .replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseExternalId = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? String(Math.trunc(value)) : String(value ?? '').trim().replace(/\.0+$/, '');

export async function parseGatilhosWorkbook(file: ImportFile): Promise<GatilhoImportRow[]> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Selecione um arquivo Excel no formato .xlsx ou .xls.');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheetName = workbook.SheetNames.find((name) => normalizeLabel(name) === 'comiss sintetico');
  if (!sheetName) throw new Error('A aba "Comiss.Sintético" não foi encontrada no arquivo.');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
  const headers = rows[0] || [];
  const findHeader = (expected: string) => headers.findIndex((header) => normalizeLabel(header) === normalizeLabel(expected));
  const indexes = {
    id: findHeader('Id'), valor: findHeader('Valor'), instalador: findHeader('Valor Instalador'),
    auxiliar: findHeader('Valor Auxiliar'), deslocamento: findHeader('Valor Deslocamento'),
  };
  if (Object.values(indexes).some((index) => index < 0)) throw new Error('A aba Comiss.Sintético não possui todas as colunas esperadas.');

  const parsed = rows.slice(1).flatMap((row) => {
    const id = parseExternalId(row[indexes.id]);
    return id ? [{ id_externo: id, valor: parseDecimal(row[indexes.valor]),
      valor_instalador: parseDecimal(row[indexes.instalador]), valor_auxiliar: parseDecimal(row[indexes.auxiliar]),
      valor_deslocamento: parseDecimal(row[indexes.deslocamento]) }] : [];
  });
  if (!parsed.length) throw new Error('Nenhum resultado válido foi encontrado na planilha.');
  return parsed;
}

export async function prepareGatilhosImport(files: readonly ImportFile[], vinculos: readonly GatilhoVinculo[] = []): Promise<GatilhosImportBatch> {
  if (!files.length) throw new Error('Selecione pelo menos um arquivo Excel.');
  const selectedFiles = [...files];
  const occurrences = new Map<string, Array<{ row: GatilhoImportRow; fileIndex: number }>>();
  const falhas: GatilhosImportBatch['falhas'] = [];
  for (const [fileIndex, file] of selectedFiles.entries()) {
    let parsed: GatilhoImportRow[];
    try { parsed = await parseGatilhosWorkbook(file); }
    catch (caught) {
      falhas.push({ arquivo: file.name, motivo: caught instanceof Error ? caught.message : 'Não foi possível ler a planilha.' });
      continue;
    }
    for (const row of parsed) {
      const current = occurrences.get(row.id_externo) || [];
      current.push({ row, fileIndex });
      occurrences.set(row.id_externo, current);
    }
  }

  const rows: GatilhoImportRow[] = [];
  const acceptedFiles = new Set<number>();
  const conflitos: GatilhosImportBatch['conflitos'] = [];
  for (const [idExterno, entries] of occurrences) {
    if (entries.length === 1) {
      rows.push(entries[0].row);
      acceptedFiles.add(entries[0].fileIndex);
      continue;
    }
    const people = new Map<string, string>();
    [...vinculos].filter((vinculo) => vinculo.id_externo === idExterno)
      .sort((a, b) => (a.papel === 'INSTALADOR' ? 0 : 1) - (b.papel === 'INSTALADOR' ? 0 : 1))
      .forEach((vinculo) => {
        if (vinculo.colaborador?.id === vinculo.colaborador_id && vinculo.colaborador.nome?.trim()) {
          people.set(vinculo.colaborador_id, vinculo.colaborador.nome.trim());
        }
      });
    conflitos.push({ idExterno, nomes: [...people.values()], ocorrencias: entries.length,
      arquivos: [...new Set(entries.map((entry) => selectedFiles[entry.fileIndex].name))] });
  }
  if (rows.length > MAX_IMPORT_ROWS) throw new Error('Os arquivos selecionados excedem o limite de 5000 IDs sem conflito por atualização.');
  return { rows, conflitos, falhas, totalArquivosAceitos: acceptedFiles.size,
    arquivoNome: selectedFiles.filter((_, index) => acceptedFiles.has(index)).map((file) => file.name).join(' | ') };
}

export function validateGatilhosImportBatch(batch: GatilhosImportBatch, confirmPartial: boolean) {
  if ((batch.conflitos.length || batch.falhas.length) && !confirmPartial) throw new Error('Confirme o envio somente dos registros válidos.');
  if (!batch.rows.length) throw new Error('Nenhum ID sem conflito está disponível para envio.');
  if (batch.rows.length > MAX_IMPORT_ROWS) throw new Error('A carga excede o limite de 5000 IDs.');
  const conflicts = new Set(batch.conflitos.map((conflict) => conflict.idExterno));
  if (new Set(batch.rows.map((row) => row.id_externo)).size !== batch.rows.length
    || batch.rows.some((row) => !row.id_externo.trim() || conflicts.has(row.id_externo))) {
    throw new Error('A carga ainda contém IDs vazios ou repetidos. Revise os arquivos.');
  }
}
