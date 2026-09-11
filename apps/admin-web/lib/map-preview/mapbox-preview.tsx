'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { DEFAULT_MAP_THEME } from 'shared-types';
import type { MapPreviewProps } from './types';
import { MapPreviewSummary } from './map-preview-summary';
import { mapThemeToMapboxConfig } from 'map-theme-adapter';
import 'mapbox-gl/dist/mapbox-gl.css';

export function MapboxPreview({ style, theme, center, zoom, bounds, onCenterChange, onZoomChange }: MapPreviewProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapRuntimeKey = JSON.stringify({ token, style, theme, center, zoom, bounds });
  useEffect(() => {
    if (!token || !containerRef.current) return;
    mapboxgl.accessToken = token;
    const mapConfig = mapThemeToMapboxConfig(style, theme ?? DEFAULT_MAP_THEME);
    const map = new mapboxgl.Map({ container: containerRef.current, style: mapConfig.styleUrl, center: [center?.lng ?? 139.7671, center?.lat ?? 35.6812], zoom: zoom ?? 5, ...(bounds ? { maxBounds: [[bounds.west, bounds.south], [bounds.east, bounds.north]] } : {}) });
    mapRef.current = map;
    const handleMove = () => { const c = map.getCenter(); onCenterChange?.({ lat: c.lat, lng: c.lng }); };
    const handleZoom = () => onZoomChange?.(map.getZoom());
    map.on('moveend', handleMove); map.on('zoomend', handleZoom);
    map.on('load', () => {
      if (mapConfig.styleUrl === 'mapbox://styles/mapbox/standard') {
        for (const [key, value] of Object.entries(mapConfig.standardConfig)) {
          map.setConfigProperty('basemap', key, value);
        }
      }
      if (bounds) map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], { padding: 24, duration: 0 });
    });
    return () => { map.off('moveend', handleMove); map.off('zoomend', handleZoom); map.remove(); mapRef.current = null; };
  // The preview map is recreated only when its runtime identity changes.
  }, [mapRuntimeKey]);
  if (!token) return <MapPreviewSummary notice="Mapbox preview requires NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to be configured." />;
  return <div ref={containerRef} data-testid="mapbox-preview" style={{ height: 360, width: '100%' }} />;
}
