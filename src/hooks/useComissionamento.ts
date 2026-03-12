import { useState, useCallback, useMemo } from 'react';
import { externalSupabase } from '@/integrations/supabase/externalClient';
import { ComissionamentoData, ComissionamentoFilters, TecnicoFrente, FrenteKPIData } from '@/types/comissionamento';
import * as XLSX from 'xlsx';

// Generate a hash from row fields INCLUDING row index to keep "duplicate" rows
function generateRowHash(row: Partial<ComissionamentoData>, rowIndex: number): string {
  const key = `${rowIndex}-${row.nome || ''}-${row.contrato || ''}-${row.proposta || ''}-${row.data_exec || ''}-${row.data || ''}-${row.valores ?? ''}-${row.status || ''}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + '_' + rowIndex;
}

function normalizeStatus(val: string | undefined | null): 'PENDENTE' | 'CONFIRMADA' | 'CANCELADA' | null {
  if (!val) return null;
  const upper = val.toString().trim().toUpperCase();
  if (upper.includes('CONFIRM')) return 'CONFIRMADA';
  if (upper.includes('CANCEL')) return 'CANCELADA';
  if (upper.includes('PEND')) return 'PENDENTE';
  return 'PENDENTE';
}

function parseDate(val: string | undefined | null): string | null {
  if (!val) return null;
  const str = val.toString().trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brMatch) {
    let day = brMatch[1];
    let month = brMatch[2];
    let year = brMatch[3];
    if (parseInt(day) > 12) {
      day = day.padStart(2, '0');
      month = month.padStart(2, '0');
    } else if (parseInt(month) > 12) {
      const tmp = day;
      day = month.padStart(2, '0');
      month = tmp.padStart(2, '0');
    } else {
      const tmp = day;
      day = month.padStart(2, '0');
      month = tmp.padStart(2, '0');
    }
    if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year;
    return `${year}-${month}-${day}`;
  }
  const num = parseFloat(str);
  if (!isNaN(num) && num > 10000 && num < 100000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 86400000);
    return date.toISOString().substring(0, 10);
  }
  return null;
}

function parseValor(val: string | undefined | null): number | null {
  if (!val) return null;
  const str = val.toString().trim();
  if (str.toUpperCase() === 'N/I' || str === '-' || str === '') return null;
  const cleaned = str.replace(/[Rr]?\$?\s*/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export function useComissionamento() {
  const [data, setData] = useState<ComissionamentoData[]>([]);
  const [tecnicosFrente, setTecnicosFrente] = useState<TecnicoFrente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ComissionamentoFilters>({
    cidade: '',
    dataInicio: '',
    dataFim: '',
    status: '',
    nome: '',
    frente: '',
    contrato: ''
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch comissionamento data
      let allData: ComissionamentoData[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: rows, error: fetchError } = await externalSupabase
          .from('comissionamento')
          .select('*')
          .range(page * pageSize, (page + 1) * pageSize - 1)
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        if (rows && rows.length > 0) {
          allData = [...allData, ...rows as ComissionamentoData[]];
          if (rows.length < pageSize) hasMore = false;
          else page++;
        } else {
          hasMore = false;
        }
      }

      // Fetch tecnicos_frentes
      const { data: frentes, error: frentesError } = await externalSupabase
        .from('tecnicos_frentes')
        .select('*');

      if (!frentesError && frentes) {
        setTecnicosFrente(frentes as TecnicoFrente[]);
        
        // Map frente to comissionamento data by nome
        const frenteMap = new Map<string, string>();
        (frentes as TecnicoFrente[]).forEach(tf => {
          frenteMap.set(tf.nome.trim().toUpperCase(), tf.frente);
        });
        
        allData = allData.map(row => ({
          ...row,
          frente: frenteMap.get((row.nome || '').trim().toUpperCase()) || row.frente || null
        }));
      }

      setData(allData);
    } catch (err: any) {
      console.error('Erro ao buscar comissionamento:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const importExcel = useCallback(async (file: File): Promise<number> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

    if (jsonData.length < 2) throw new Error('Arquivo deve conter cabeçalho e dados.');

    const headers = (jsonData[0] as string[]).map(h => String(h || '').trim().toUpperCase());

    const colMap: Record<string, number> = {};
    const mappings: Record<string, string[]> = {
      nome: ['NOME'],
      login_criador: ['LOGIN CRIADOR', 'LOGIN_CRIADOR'],
      alocacao: ['ALOCAÇÃO', 'ALOCACAO'],
      data: ['DATA'],
      mes_instalado: ['MÊS INSTALADO', 'MES INSTALADO', 'MÊS INST.', 'MES INST.', 'MÊS INST'],
      tipo_venda: ['TIPO VENDA', 'TIPO_VENDA'],
      proposta: ['PROPOSTA'],
      data_envio_grupo: ['DATA ENVIO GRUPO', 'DATA_ENVIO_GRUPO', 'DATA EN.'],
      contrato: ['CONTRATO'],
      valores: ['VALORES', 'VALOR'],
      data_agen: ['DATA AGEN.', 'DATA AGEN', 'DATA_AGEN'],
      data_exec: ['DATA EXEC.', 'DATA EXEC', 'DATA_EXEC'],
      observacoes: ['OBSERVAÇÕES', 'OBSERVACOES', 'OBS'],
      janela: ['JANELA'],
      pagamento: ['PAGAMENTO'],
      mes_ano_proposta: ['MÊS/ANO PROPOSTA', 'MES/ANO PROPOSTA', 'MÊS/ANO PROPOSTA', 'MESANOPROPOSTA', 'MES ANO PROPOSTA'],
      status: ['STATUS', 'CONFIRMAÇÃO', 'CONFIRMACAO']
    };

    for (const [field, aliases] of Object.entries(mappings)) {
      const idx = headers.findIndex(h => aliases.some(a => h.includes(a)));
      if (idx >= 0) colMap[field] = idx;
    }

    if (colMap.nome === undefined) {
      throw new Error('Coluna NOME não encontrada no arquivo.');
    }

    const rows = jsonData.slice(1).filter(row =>
      (row as unknown[]).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')
    );

    const records: ComissionamentoData[] = rows.map((row, index) => {
      const r = row as unknown[];
      const get = (field: string) => colMap[field] !== undefined ? String(r[colMap[field]] || '').trim() : null;

      const record: ComissionamentoData = {
        nome: get('nome') || '',
        login_criador: get('login_criador'),
        alocacao: get('alocacao'),
        data: parseDate(get('data')),
        mes_instalado: get('mes_instalado'),
        tipo_venda: get('tipo_venda'),
        proposta: get('proposta'),
        data_envio_grupo: parseDate(get('data_envio_grupo')),
        contrato: get('contrato'),
        valores: parseValor(get('valores')),
        data_agen: parseDate(get('data_agen')),
        data_exec: parseDate(get('data_exec')),
        observacoes: get('observacoes'),
        janela: get('janela'),
        pagamento: get('pagamento'),
        mes_ano_proposta: get('mes_ano_proposta'),
        status: normalizeStatus(get('status'))
      };

      record.row_hash = generateRowHash(record, index);
      return record;
    }).filter(r => r.nome);

    const uniqueMap = new Map<string, ComissionamentoData>();
    for (const rec of records) {
      if (rec.row_hash) uniqueMap.set(rec.row_hash, rec);
    }
    let uniqueRecords = Array.from(uniqueMap.values());

    // Enrich with frente from tecnicos_frentes before saving
    const { data: frentes } = await externalSupabase
      .from('tecnicos_frentes')
      .select('nome, frente');

    if (frentes && frentes.length > 0) {
      const frenteMap = new Map<string, string>();
      frentes.forEach((tf: any) => {
        frenteMap.set((tf.nome || '').trim().toUpperCase(), tf.frente);
      });
      uniqueRecords = uniqueRecords.map(rec => ({
        ...rec,
        frente: frenteMap.get((rec.nome || '').trim().toUpperCase()) || null
      }));
    }

    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < uniqueRecords.length; i += batchSize) {
      const batch = uniqueRecords.slice(i, i + batchSize);
      const { error: upsertError } = await externalSupabase
        .from('comissionamento')
        .upsert(batch, { onConflict: 'row_hash', ignoreDuplicates: true });
      if (upsertError) {
        console.error('Upsert error:', upsertError);
        throw upsertError;
      }
      inserted += batch.length;
    }

    await fetchData();
    return inserted;
  }, [fetchData]);

  const filteredData = useMemo(() => {
    let result = [...data];

    if (filters.cidade) {
      result = result.filter(r => (r.alocacao || '').toLowerCase().includes(filters.cidade.toLowerCase()));
    }
    if (filters.dataInicio) {
      result = result.filter(r => {
        const d = r.data || r.data_exec;
        return d && d >= filters.dataInicio;
      });
    }
    if (filters.dataFim) {
      result = result.filter(r => {
        const d = r.data || r.data_exec;
        return d && d <= filters.dataFim;
      });
    }
    if (filters.status) {
      result = result.filter(r => r.status === filters.status);
    }
    if (filters.nome) {
      result = result.filter(r => (r.nome || '').toLowerCase().includes(filters.nome.toLowerCase()));
    }
    if (filters.frente) {
      result = result.filter(r => (r.frente || '') === filters.frente);
    }

    if (filters.contrato) {
      result = result.filter(r => (r.contrato || '').toLowerCase().includes(filters.contrato.toLowerCase()));
    }


    return result;
  }, [data, filters]);
  //ondepegar od dados
  const uniqueCidades = useMemo(() =>
    [...new Set(data.map(r => r.alocacao).filter(Boolean))].sort() as string[],
    [data]
  );

  const uniqueNomes = useMemo(() =>
    [...new Set(data.map(r => r.nome).filter(Boolean))].sort() as string[],
    [data]
  );

  const uniqueFrente = useMemo(() =>
    [...new Set(tecnicosFrente.map(t => t.frente).filter(Boolean))].sort() as string[],
    [tecnicosFrente]
  );

  // KPIs
  const kpis = useMemo(() => ({
    confirmadas: filteredData.filter(r => r.status === 'CONFIRMADA').length,
    pendentes: filteredData.filter(r => r.status === 'PENDENTE').length,
    canceladas: filteredData.filter(r => r.status === 'CANCELADA').length,
    total: filteredData.length,
    totalValor: filteredData.reduce((sum, r) => sum + (r.valores || 0), 0)
  }), [filteredData]);

  // Chart data: grouped by technician
  const chartData = useMemo(() => {
    const map: Record<string, { nome: string; cidade: string; pendente: number; confirmada: number; cancelada: number }> = {};
    filteredData.forEach(r => {
      const key = r.nome;
      if (!map[key]) {
        map[key] = { nome: r.nome, cidade: r.alocacao || '', pendente: 0, confirmada: 0, cancelada: 0 };
      }
      if (r.status === 'PENDENTE') map[key].pendente++;
      else if (r.status === 'CONFIRMADA') map[key].confirmada++;
      else if (r.status === 'CANCELADA') map[key].cancelada++;
    });
    return Object.values(map).sort((a, b) => (b.pendente + b.confirmada + b.cancelada) - (a.pendente + a.confirmada + a.cancelada));
  }, [filteredData]);

  
  // Ranking — conta contratos únicos por (contrato+data), mesmo contrato em dias diferentes conta separado
  const ranking = useMemo(() => {
   const map: Record<string, { nome: string; contratoKeys: Set<string>; totalValor: number }> = {};
    filteredData.forEach(r => {
      if (!map[r.nome]) map[r.nome] = { nome: r.nome, contratoKeys: new Set(), totalValor: 0 };
      const key = `${(r.contrato || '').trim().toUpperCase()}||${(r.data || '').trim()}`;
      map[r.nome].contratoKeys.add(key);
      map[r.nome].totalValor += r.valores || 0;
    });
       return Object.values(map)
      .map(m => ({ nome: m.nome, totalContratos: m.contratoKeys.size, totalValor: m.totalValor }))
      .sort((a, b) => b.totalContratos - a.totalContratos);
  }, [filteredData]);

  // Frentes KPI data
  const frentesData = useMemo((): FrenteKPIData[] => {
    const frenteGroups = new Map<string, { tecnicos: Set<string>; tecComVenda: Set<string>; qtdConfirmada: number; totalGeral: number }>();

       // Initialize frentes from tecnicos_frentes, filtering by city if selected
    const filteredTecnicos = filters.cidade
      ? tecnicosFrente.filter(tf => (tf.cidade || '').toLowerCase().includes(filters.cidade.toLowerCase()))
      : tecnicosFrente;

    filteredTecnicos.forEach(tf => {
      if (!frenteGroups.has(tf.frente)) {
        frenteGroups.set(tf.frente, { tecnicos: new Set(), tecComVenda: new Set(), qtdConfirmada: 0, totalGeral: 0 });
      }
      frenteGroups.get(tf.frente)!.tecnicos.add(tf.nome.trim().toUpperCase());
    });

    // Count contracts from filtered data
    filteredData.forEach(r => {
      const frente = r.frente;
      if (!frente) return;
      const group = frenteGroups.get(frente);
      if (!group) return;
      group.totalGeral++;

      if (r.status === 'CONFIRMADA') {
        group.qtdConfirmada++;
        group.tecComVenda.add((r.nome || '').trim().toUpperCase());
      }
    });

    return Array.from(frenteGroups.entries()).map(([frente, g]) => {
      const totalTec = g.tecnicos.size;
      const tecAdherente = g.tecComVenda.size;
      const tecNaoVenderam = [...g.tecnicos].filter(n => !g.tecComVenda.has(n));
      

      const nomeMap = new Map<string, string>();
      tecnicosFrente.forEach(tf => nomeMap.set(tf.nome.trim().toUpperCase(), tf.nome));

      return {
        frente,
        qtdConsultivo: g.qtdConfirmada,
        totalGeral: g.totalGeral,
        pctConfirmada: g.totalGeral > 0 ? (g.qtdConfirmada / g.totalGeral) * 100 : 0,
        totalTecnicos: totalTec,
        tecAdherente,
        pctTecAdherente: totalTec > 0 ? (tecAdherente / totalTec) * 100 : 0,
        tecNaoVenderam: tecNaoVenderam.map(n => nomeMap.get(n) || n)
      };
    }).sort((a, b) => b.qtdConsultivo - a.qtdConsultivo);
}, [filteredData, tecnicosFrente, filters.cidade]);

   const submitManualEntry = useCallback(async (formData: Record<string, any>) => {
    // Enrich with frente
    const { data: frentes } = await externalSupabase.from('tecnicos_frentes').select('nome, frente');
    let frente: string | null = null;
    if (frentes) {
      const match = frentes.find((tf: any) => (tf.nome || '').trim().toUpperCase() === (formData.nome || '').trim().toUpperCase());
      if (match) frente = match.frente;
    }

    const record: any = {
      nome: formData.nome,
      login_criador: formData.login_criador,
      alocacao: formData.alocacao,
      data: formData.data || null,
      mes_instalado: formData.mes_instalado || null,
      tipo_venda: formData.tipo_venda,
      proposta: formData.proposta,
      data_envio_grupo: formData.data_envio_grupo || null,
      contrato: formData.contrato,
      valores: formData.valores,
      data_agen: formData.data_agen || null,
      data_exec: formData.data_exec || null,
      observacoes: formData.observacoes,
      janela: formData.janela || null,
      pagamento: formData.pagamento || null,
      mes_ano_proposta: formData.mes_ano_proposta || null,
      status: formData.status || 'PENDENTE',
      frente,
      row_hash: `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`
    };

    const { error: insertError } = await externalSupabase.from('comissionamento').insert([record]);
    if (insertError) throw insertError;

    await fetchData();
  }, [fetchData]);
const updateRecord = useCallback(async (id: string, updates: Partial<ComissionamentoData>) => {
    const { error: updateError } = await externalSupabase
      .from('comissionamento')
      .update(updates)
      .eq('id', id);
    if (updateError) throw updateError;
    await fetchData();
  }, [fetchData]);
   const deleteRecord = useCallback(async (id: string) => {
    const { error: deleteError } = await externalSupabase
      .from('comissionamento')
      .delete()
      .eq('id', id);
    if (deleteError) throw deleteError;
    await fetchData();
  }, [fetchData]);


  return {
    data: filteredData,
    allData: data,
    isLoading,
    error,
    filters,
    setFilters: (f: Partial<ComissionamentoFilters>) => setFilters(prev => ({ ...prev, ...f })),
    clearFilters: () => setFilters({ cidade: '', dataInicio: '', dataFim: '', status: '', nome: '', frente: '', contrato: '' }),
    fetchData,
    importExcel,
    submitManualEntry,
    updateRecord,
    deleteRecord,
    uniqueCidades,
    uniqueNomes,
    uniqueFrente,
    kpis,
    chartData,
    ranking,
    frentesData,
    tecnicosFrente
  };
}