import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Map, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useDashboard } from '@/contexts/DashboardContext';
import { getActivityStatus } from '@/utils/activityHelpers';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/config/constants';

// Fix for default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Cache de geocodificação no localStorage
const GEOCODE_CACHE_KEY = 'geocodeCache';

const getGeocodeCache = (): Record<string, [number, number]> => {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveGeocodeCache = (cache: Record<string, [number, number]>) => {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Silently fail
  }
};

// Geocodificação via Nominatim API (OpenStreetMap)
const geocodeBairro = async (bairro: string, cidade?: string): Promise<[number, number] | null> => {
  const cache = getGeocodeCache();
  const contexts = ['Natal, RN, Brasil', 'Parnamirim, RN, Brasil', 'Fortaleza, CE, Brasil', 'Mossoró, RN, Brasil'];

  if (cidade) {
    contexts.unshift(cidade);
  }

  for (const context of contexts) {
    const cacheKey = `${bairro} | ${context}`.toLowerCase();

    if (cache[cacheKey]) {
      return cache[cacheKey];
    }

    const query = `${bairro}, ${context}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=pt-BR&q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) continue;

      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const coords: [number, number] = [lat, lon];

        cache[cacheKey] = coords;
        saveGeocodeCache(cache);

        return coords;
      }
    } catch (err) {
      console.warn(`Geocoding failed for ${query}:`, err);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  return null;
};

// Ícone individual de atividade
const createActivityIcon = (status: string): L.DivIcon => {
  const color = getStatusColor(status);

  return L.divIcon({
    html: `<div style="
      background-color: ${color};
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    className: 'custom-activity-icon',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

// Determina o status da atividade para colorir o pin
const getStatusColor = (status: string): string => {
  if (status === 'Produtiva') return '#22c55e';
  if (status === 'Improdutiva') return '#ef4444';
  if (status === 'Pendente') return '#f59e0b';
  if (status === 'Cancelado') return '#6b7280';
  return '#6366f1';
};

// Adiciona pequena variação aleatória para não empilhar pinos no exato mesmo ponto
const jitterCoord = (coord: number, index: number): number => {
  const offset = ((index % 100) - 50) * 0.00008;
  return coord + offset;
};

interface MarkerData {
  lat: number;
  lng: number;
  item: any;
  bairro: string;
}

export const MapSection: React.FC = () => {
  const { filteredData } = useDashboard();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeProgress, setGeocodeProgress] = useState('');
  const [markerDataList, setMarkerDataList] = useState<MarkerData[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Toggle tela cheia usando Fullscreen API nativa do navegador
  const toggleFullscreen = () => {
    if (!sectionRef.current) return;
    if (!document.fullscreenElement) {
      sectionRef.current.requestFullscreen().catch(() => {
        console.warn('Fullscreen API não suportada');
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Escuta o evento nativo de fullscreen para atualizar o estado e recalcular o mapa
  useEffect(() => {
    const handleChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      // Recalcula o tamanho do mapa após transição
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
      setTimeout(() => mapRef.current?.invalidateSize(), 400);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // Agrupa dados por bairro para geocodificação
  const bairroGroups = useMemo(() => {
    const groups: Record<string, { items: any[]; cidade?: string }> = {};

    filteredData.forEach(item => {
      let bairro = String(item.Bairro || item.bairro || '').trim();
      if (!bairro) return;

      bairro = bairro.toUpperCase();
      if (bairro === 'NV PARNAMIRIM') bairro = 'NOVA PARNAMIRIM';

      if (!groups[bairro]) {
        groups[bairro] = {
          items: [],
          cidade: String(item.Cidade || item['Municipio/UF'] || item.Municipio || '').trim()
        };
      }
      groups[bairro].items.push(item);
    });

    return groups;
  }, [filteredData]);

  // Inicializa mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      scrollWheelZoom: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(mapRef.current);

    // Força resize após inicialização
    setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 100);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Geocodifica bairros e cria lista de marcadores individuais
  useEffect(() => {
    const geocodeAll = async () => {
      const results: MarkerData[] = [];
      const bairros = Object.entries(bairroGroups);

      if (bairros.length === 0) {
        setMarkerDataList([]);
        return;
      }

      setIsGeocoding(true);

      for (let i = 0; i < bairros.length; i++) {
        const [name, { items, cidade }] = bairros[i];
        setGeocodeProgress(`Carregando mapa: ${Math.round(((i + 1) / bairros.length) * 100)}%`);

        // Tenta pegar coords de um item com lat/lon
        let baseCoords: [number, number] | null = null;

        const itemWithCoords = items.find(item => {
          const lat = parseFloat(item.Latitude || item.Lat || '');
          const lon = parseFloat(item.Longitude || item.Lon || item.Long || '');
          return !isNaN(lat) && !isNaN(lon);
        });

        if (itemWithCoords) {
          const lat = parseFloat(itemWithCoords.Latitude || itemWithCoords.Lat);
          const lon = parseFloat(itemWithCoords.Longitude || itemWithCoords.Lon || itemWithCoords.Long);
          baseCoords = [lat, lon];
        } else {
          baseCoords = await geocodeBairro(name, cidade);
        }

        if (baseCoords) {
          items.forEach((item, idx) => {
            // Usa coordenadas individuais se disponíveis, senão usa do bairro com jitter
            const itemLat = parseFloat(item.Latitude || item.Lat || '');
            const itemLon = parseFloat(item.Longitude || item.Lon || item.Long || '');

            const lat = !isNaN(itemLat) ? itemLat : jitterCoord(baseCoords![0], idx);
            const lng = !isNaN(itemLon) ? itemLon : jitterCoord(baseCoords![1], idx);

            results.push({ lat, lng, item, bairro: name });
          });
        }
      }

      setMarkerDataList(results);
      setIsGeocoding(false);
      setGeocodeProgress('');
    };

    geocodeAll();
  }, [bairroGroups]);

  // Cria/atualiza cluster group com marcadores individuais
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove cluster anterior
    if (clusterGroupRef.current) {
      mapRef.current.removeLayer(clusterGroupRef.current);
      clusterGroupRef.current = null;
    }

    if (markerDataList.length === 0) return;

    // Cria novo MarkerClusterGroup com opções customizadas
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.5,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 10,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        // Tamanho e cor baseados na quantidade
        let size: number, color: string, fontSize: string;

        if (count > 200) {
          size = 60; color = '#dc2626'; fontSize = '15px'; // vermelho grande
        } else if (count > 100) {
          size = 52; color = '#f5576c'; fontSize = '14px'; // rosa
        } else if (count > 50) {
          size = 46; color = '#f97316'; fontSize = '13px'; // laranja
        } else if (count > 20) {
          size = 40; color = '#fbbf24'; fontSize = '13px'; // amarelo
        } else if (count > 10) {
          size = 34; color = '#6366f1'; fontSize = '12px'; // indigo
        } else {
          size = 30; color = '#22c55e'; fontSize = '11px'; // verde
        }

        return L.divIcon({
          html: `<div style="
            background: radial-gradient(circle, ${color} 0%, ${color}dd 60%, ${color}88 100%);
            color: white;
            border-radius: 50%;
            width: ${size}px;
            height: ${size}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: ${fontSize};
            box-shadow: 0 3px 14px ${color}66, 0 1px 4px rgba(0,0,0,0.2);
            border: 3px solid rgba(255,255,255,0.9);
            transition: transform 0.2s;
          ">${count}</div>`,
          className: 'custom-cluster-icon',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });
      },
    });

    // Adiciona marcadores individuais ao cluster
    const markers: L.Marker[] = [];

    markerDataList.forEach(({ lat, lng, item, bairro }) => {
      const status = getActivityStatus(item);
      const marker = L.marker([lat, lng], {
        icon: createActivityIcon(status),
      });

      const popupContent = `
        <div style="padding: 6px; font-size: 13px; min-width: 200px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #1e293b;">
            ${bairro}
          </div>
          <div style="display: grid; gap: 3px;">
            <div><strong>Técnico:</strong> ${item.Recurso || 'N/A'}</div>
            <div><strong>Tipo:</strong> ${item['Tipo de Atividade'] || 'N/A'}</div>
            <div><strong>Baixa:</strong> ${item['Cód de Baixa 1'] || 'N/A'}</div>
            <div><strong>Status:</strong> <span style="color: ${status === 'Produtiva' ? '#16a34a' :
          status === 'Improdutiva' ? '#dc2626' :
            status === 'Pendente' ? '#d97706' : '#6b7280'
        }; font-weight: 600;">${status}</span></div>
            <div><strong>Data:</strong> ${item.Data || 'N/A'}</div>
            ${item.Contrato ? `<div><strong>Contrato:</strong> ${item.Contrato}</div>` : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 280 });
      markers.push(marker);
    });

    clusterGroup.addLayers(markers);
    mapRef.current.addLayer(clusterGroup);
    clusterGroupRef.current = clusterGroup;

    // Ajusta bounds para mostrar todos os marcadores
    const bounds = clusterGroup.getBounds();
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [markerDataList]);

  // Estatísticas
  const totalOnMap = markerDataList.length;
  const totalBairros = new Set(markerDataList.map(m => m.bairro)).size;

  return (
    <div ref={sectionRef} className="card" style={isFullscreen ? { padding: '16px', backgroundColor: 'var(--background)' } : undefined}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Map className="w-5 h-5 text-accent" />
          Mapa - Volume de Atividades por Região
        </h3>
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          title={isFullscreen ? 'Sair da tela cheia (ESC)' : 'Tela cheia'}
        >
          {isFullscreen ? (
            <><Minimize2 className="w-4 h-4" /> Sair da tela cheia</>
          ) : (
            <><Maximize2 className="w-4 h-4" /> Tela cheia</>
          )}
        </button>
      </div>

      {isGeocoding && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{geocodeProgress}</span>
        </div>
      )}

      {/* Legenda */}
      {totalOnMap > 0 && !isGeocoding && (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span><strong>{totalOnMap}</strong> atividades em <strong>{totalBairros}</strong> bairros</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }}></span>
              Produtiva
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }}></span>
              Improdutiva
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }}></span>
              Pendente
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#6b7280', display: 'inline-block' }}></span>
              Cancelado
            </span>
          </div>
          <span className="text-muted-foreground/60 italic">Clique nos clusters para dar zoom · Aproxime para ver atividades individuais</span>
        </div>
      )}

      <div
        ref={mapContainerRef}
        className="rounded-xl overflow-hidden border border-border"
        style={{ height: isFullscreen ? 'calc(100vh - 140px)' : '500px' }}
      />

      {markerDataList.length === 0 && !isGeocoding && (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum dado de bairro disponível para exibir no mapa
        </div>
      )}
    </div>
  );
};
