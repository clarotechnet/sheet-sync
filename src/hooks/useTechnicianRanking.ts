import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import type { RankingActivity, RankingTechnician, RankingTechnicianInput, DatabaseReturnRecord } from '@/types/technicianRanking';
import { isAccreditedReturn, parseRankingActivities, parseRankingTechnicians } from '@/utils/technicianRanking';

const message = (error: unknown) => error instanceof Error ? error.message
  : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível concluir a operação.';

async function readWorkbook<T>(file: File, parser: (rows: unknown[][]) => T[]) {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  if (!workbook.SheetNames.length) throw new Error('O arquivo não contém planilhas.');
  return parser(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: null }));
}

export function useRankingTechnicians(refreshKey = 0) {
  const [rows, setRows] = useState<RankingTechnician[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const fetchData = useCallback(async () => {
    const token = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const result: RankingTechnician[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: queryError } = await externalSupabase.from('ranking_tecnicos')
          .select('id, login, nome, cidade, supervisor, ativo, created_at, updated_at')
          .order('nome').order('id').range(offset, offset + 999);
        if (queryError) throw queryError;
        result.push(...(data || []) as RankingTechnician[]);
        if (!data || data.length < 1000) break;
      }
      if (token === requestId.current) setRows(result);
    } catch (caught) { if (token === requestId.current) { setRows([]); setError(message(caught)); } }
    finally { if (token === requestId.current) setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); return () => { requestId.current += 1; }; }, [fetchData, refreshKey]);

  const importFile = useCallback(async (file: File) => {
    const payload = await readWorkbook(file, parseRankingTechnicians);
    const { data, error: importError } = await externalSupabase.rpc('importar_ranking_tecnicos', { p_dados: payload });
    if (importError) throw new Error(message(importError));
    await fetchData();
    return Number(data) || payload.length;
  }, [fetchData]);

  const save = useCallback(async (payload: RankingTechnicianInput, editing: RankingTechnician | null) => {
    const query = editing
      ? externalSupabase.from('ranking_tecnicos').update(payload).eq('id', editing.id).eq('updated_at', editing.updated_at)
      : externalSupabase.from('ranking_tecnicos').insert(payload);
    const { error: saveError } = await query.select('id').single();
    if (saveError) {
      if (saveError.code === '23505') throw new Error('Já existe um técnico com esse login.');
      if (saveError.code === 'PGRST116') throw new Error('O cadastro mudou. Atualize a lista e tente novamente.');
      throw new Error(message(saveError));
    }
    await fetchData();
  }, [fetchData]);
  return { rows, loading, error, fetchData, importFile, save };
}

export function useTechnicianRankingActivities(startDate: string, endDate: string, refreshKey = 0) {
  const [rows, setRows] = useState<RankingActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const fetchData = useCallback(async () => {
    const token = ++requestId.current;
    if (!startDate || !endDate || endDate < startDate) { setRows([]); setLoading(false); setError('Informe um período válido.'); return; }
    setLoading(true); setError(null);
    try {
      const result: RankingActivity[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: queryError } = await externalSupabase.from('ranking_tecnico_atividades')
          .select('id_atividade, data_atividade, login_tecnico, concluiu_atividade, recurso, contrato, numero_wo, cidade, status_atividade, tipo_atividade, codigos_baixa, credenciada_anterior, arquivo_nome, importado_em')
          .gte('data_atividade', startDate).lte('data_atividade', endDate)
          .order('data_atividade').order('id_atividade').range(offset, offset + 999);
        if (queryError) throw queryError;
        result.push(...(data || []) as RankingActivity[]);
        if (!data || data.length < 1000) break;
      }
      if (token === requestId.current) setRows(result);
    } catch (caught) { if (token === requestId.current) { setRows([]); setError(message(caught)); } }
    finally { if (token === requestId.current) setLoading(false); }
  }, [startDate, endDate]);

  useEffect(() => { void fetchData(); return () => { requestId.current += 1; }; }, [fetchData, refreshKey]);

  const importFile = useCallback(async (file: File) => {
    const payload = await readWorkbook(file, parseRankingActivities);
    const { data, error: importError } = await externalSupabase.rpc('importar_ranking_tecnico_atividades', { p_dados: payload, p_arquivo_nome: file.name });
    if (importError) throw new Error(message(importError));
    await fetchData();
    const dates = payload.map((row) => row.data_atividade).sort();
    return { count: Number(data) || payload.length, startDate: dates[0], endDate: dates[dates.length - 1] };
  }, [fetchData]);
  return { rows, loading, error, fetchData, importFile };
}

export function useRankingReturnAttributions(activities: RankingActivity[], startDate: string, endDate: string, refreshKey = 0) {
  const [rows, setRows] = useState<DatabaseReturnRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const contracts = useMemo(() => [...new Set(activities.filter((row) => row.contrato && isAccreditedReturn(row.tipo_atividade)).map((row) => row.contrato!))].sort(), [activities]);
  useEffect(() => {
    const token = ++requestId.current;
    setError(null);
    if (!contracts.length || !startDate || !endDate || startDate > endDate) { setRows([]); setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const result: DatabaseReturnRecord[] = [];
        for (let index = 0; index < contracts.length; index += 100) {
          for (let offset = 0; ; offset += 1000) {
            const { data, error: queryError } = await externalSupabase.from('atividades')
              .select('id, contrato, data_atividade, numero_os, cidade, tipo_atividade, is_revisita, ofensor_revisita')
              .in('contrato', contracts.slice(index, index + 100)).ilike('tipo_atividade', 'retorno credenciada')
              .gte('data_atividade', startDate).lte('data_atividade', endDate).order('id').range(offset, offset + 999);
            if (queryError) throw queryError;
            result.push(...(data || []) as DatabaseReturnRecord[]);
            if (!data || data.length < 1000) break;
          }
        }
        if (token === requestId.current) setRows(result);
      } catch (caught) { if (token === requestId.current) { setRows([]); setError(message(caught)); } }
      finally { if (token === requestId.current) setLoading(false); }
    })();
    return () => { requestId.current += 1; };
  }, [contracts, startDate, endDate, refreshKey]);
  return { rows, loading, error };
}
