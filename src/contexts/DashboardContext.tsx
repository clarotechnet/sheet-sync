import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ActivityData, FilterState } from '@/types/activity';
import { useGoogleSheets } from '@/hooks/useGoogleSheets';
import { filterExcludedServiceTypes, parseBRDate, extractDateFromInterval, getActivityStatus } from '@/utils/activityHelpers';
import { useAtividades } from '@/hooks/useAtividades';

interface DashboardContextType {
  allData: ActivityData[];
  filteredData: ActivityData[];
  filters: FilterState;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  setFilters: (filters: Partial<FilterState>) => void;
  clearFilters: () => void;
  clearData: () => void;
  addNewData: (data: ActivityData[]) => void;
  refreshData: () => Promise<void>;
}

const initialFilters: FilterState = {
  technicians: [],
  activityTypes: [],
  searchText: '',
  startDate: '',
  endDate: '',
  cities: [],
  productivityFilter: 'all'
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // const { data, isLoading, isSyncing, error, fetchData, syncData, setData, mergeNewData } = useGoogleSheets();
  const { data, isLoading, isSyncing, error, fetchData, syncData, setData, mergeNewData } = useAtividades();
  const [filters, setFiltersState] = useState<FilterState>(initialFilters);
  const [filteredData, setFilteredData] = useState<ActivityData[]>([]);

  // Fetch inicial
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aplica filtros quando dados ou filtros mudam
  useEffect(() => {
    const applyFilters = () => {
      let result = filterExcludedServiceTypes(data);

      // Filtro por técnico
      if (filters.technicians.length > 0) {
        result = result.filter(item => filters.technicians.includes(item.Recurso || ''));
      }

      // Filtro por tipo de atividade
      if (filters.activityTypes.length > 0) {
        result = result.filter(item => filters.activityTypes.includes(item['Tipo de Atividade'] || ''));
      }

       // Filtro por cidade
      if (filters.cities.length > 0) {
        result = result.filter(item => {
          const cidade = item.Cidade || item.cidade || '';
          return filters.cities.includes(cidade);
        });
      }

      // Filtro por produtividade
      if (filters.productivityFilter !== 'all') {
        result = result.filter(item => {
          const status = getActivityStatus(item);
          if (filters.productivityFilter === 'productive') {
            return status === 'Produtiva';
          } else if (filters.productivityFilter === 'unproductive') {
            return status === 'Improdutiva';
          }
          return true;
        });
      }


      // Filtro por texto
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        result = result.filter(item => 
          Object.values(item).some(val => 
            String(val || '').toLowerCase().includes(searchLower)
          )
        );
      }

      // Filtro por data - tenta múltiplas colunas incluindo "Intervalo de Tempo"
      if (filters.startDate || filters.endDate) {
        const startDate = filters.startDate ? new Date(filters.startDate + 'T00:00:00') : null;
        const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59') : null;

        result = result.filter(item => {
          // Tenta pegar data de várias colunas possíveis
          let itemDate: Date | null = null;
          
          // Primeiro tenta "Intervalo de Tempo" que é comum neste sistema
          if (item['Intervalo de Tempo']) {
            itemDate = extractDateFromInterval(item['Intervalo de Tempo']);
          }
          
          // Se não encontrou, tenta outras colunas
          if (!itemDate) {
            const dateValue = item.Data || item['Data Abertura'] || item['Criado em'];
            itemDate = parseBRDate(dateValue);
          }
          
          // Se ainda não encontrou data, inclui o item (não filtra)
          if (!itemDate) return true;
          
          if (startDate && itemDate < startDate) return false;
          if (endDate && itemDate > endDate) return false;
          
          return true;
        });
      }

      setFilteredData(result);
    };

    applyFilters();
  }, [data, filters]);

  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(initialFilters);
  }, []);

  const clearData = useCallback(() => {
    setData([]);
    setFiltersState(initialFilters);
  }, [setData]);

  const addNewData = useCallback((newData: ActivityData[]) => {
    mergeNewData(newData);
  }, [mergeNewData]);

  const refreshData = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return (
    <DashboardContext.Provider
      value={{
        allData: data,
        filteredData,
        filters,
        isLoading,
        isSyncing,
        error,
        setFilters,
        clearFilters,
        clearData,
        addNewData,
        refreshData
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within DashboardProvider');
  }
  return context;
};
