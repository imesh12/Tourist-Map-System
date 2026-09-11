'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { CategoryIcon, MapAreaConfig, MapStyle, MapTheme, PublishedLiveCamera, PublishedPoi } from 'shared-types';
import { buildMarkerIcon, resolveMarkerVisualConfig } from '@/lib/public-map/marker-style-adapter';
import { categoryIconMeta } from '@/lib/public-map/category-icon-meta';
import { mapThemeToMapboxConfig } from 'map-theme-adapter';
import type { PhotoPinTemplate } from '@/lib/public-map/marker-style-adapter';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Props {
  readonly area: MapAreaConfig;
  readonly style: MapStyle;
  readonly theme: MapTheme;
  readonly pois: readonly PublishedPoi[];
  readonly categories: ReadonlyMap<string, { readonly icon: CategoryIcon }>;
  readonly cameras: readonly PublishedLiveCamera[];
  readonly selectedPoiId: string | null;
  readonly selectedCameraId: string | null;
  readonly onSelectPoi: (id: string) => void;
  readonly onSelectCamera: (id: string) => void;
  readonly photoImageByPoiId: ReadonlyMap<string, string>;
  readonly photoPinTemplate?: PhotoPinTemplate;
  readonly onReady: (map: mapboxgl.Map) => void;
}

export function MapboxMap({ area, style, theme, pois, categories, cameras, selectedPoiId, selectedCameraId, onSelectPoi, onSelectCamera, photoImageByPoiId, photoPinTemplate, onReady }: Props) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  // Keep one stable dependency slot for the runtime identity. This also
  // prevents Fast Refresh from comparing an older dependency-array shape
  // with the current provider runtime effect.
  const mapRuntimeKey = JSON.stringify({ token, area, style, theme });
  const mapMarkerSelectionKey = `${mapReady}:${selectedPoiId ?? ''}`;
  useEffect(() => {
    if (!token || !containerRef.current) return;
    setMapReady(false);
    mapboxgl.accessToken = token;
    const mapConfig = mapThemeToMapboxConfig(style, theme);
    const map = new mapboxgl.Map({ container: containerRef.current, style: mapConfig.styleUrl, center: [area.center?.lng ?? 139.7671, area.center?.lat ?? 35.6812], zoom: area.defaultZoom ?? 5, ...(area.type === 'BOUNDED' && area.bounds ? { maxBounds: [[area.bounds.west, area.bounds.south], [area.bounds.east, area.bounds.north]] } : {}) });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => {
      if (mapConfig.styleUrl === 'mapbox://styles/mapbox/standard') {
        for (const [key, value] of Object.entries(mapConfig.standardConfig)) {
          map.setConfigProperty('basemap', key, value);
        }
      }
      if (area.type === 'BOUNDED' && area.bounds) map.fitBounds([[area.bounds.west, area.bounds.south], [area.bounds.east, area.bounds.north]], { padding: 24, duration: 0 });
      setMapReady(true);
      onReady(map);
    });
    return () => { setMapReady(false); for (const marker of markersRef.current) marker.remove(); markersRef.current = []; map.remove(); mapRef.current = null; };
  // The map instance is intentionally recreated only when this runtime key
  // changes; content and selection use the separate marker effect below.
  }, [mapRuntimeKey]);
  useEffect(() => {
    const map = mapRef.current;
    const poi = pois.find((entry) => entry.poiId === selectedPoiId);
    const camera = cameras.find((entry) => entry.cameraId === selectedCameraId);
    const location = poi?.location ?? camera?.location;
    if (map && location) map.easeTo({ center: [location.longitude, location.latitude] });
  }, [selectedPoiId, selectedCameraId, pois, cameras]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];
    const visual = resolveMarkerVisualConfig(theme.markerStyle);
    for (const poi of pois) {
      const meta = categoryIconMeta(categories.get(poi.categoryId)?.icon ?? 'OTHER');
      const photo = poi.photo?.available ? photoImageByPoiId.get(poi.poiId) : undefined;
      const selected = poi.poiId === selectedPoiId;
      const spec = buildMarkerIcon({ pattern: photo ? 'photo-pin' : visual.pattern, pixelSize: selected ? Math.round(visual.pixelSize * 1.3) : visual.pixelSize, color: meta.color, glyph: meta.emoji, glyphPath: meta.markerGlyphPath, selected, imageUrl: photo, photoPinTemplate });
      // Mapbox owns the marker container CSS; use an explicit image child so
      // the shared SVG data URI is painted by the browser rather than relying
      // on background shorthand/native button appearance differences.
      const element = document.createElement('button');
      element.type = 'button';
      element.title = poi.name;
      element.setAttribute('aria-label', poi.name);
      element.style.width = `${spec.width}px`;
      element.style.height = `${spec.height}px`;
      element.style.padding = '0';
      element.style.border = '0';
      element.style.background = 'transparent';
      element.style.appearance = 'none';
      element.style.display = 'block';
      element.style.zIndex = selected ? '2' : '1';
      const image = document.createElement('img');
      image.src = spec.url;
      image.alt = '';
      image.draggable = false;
      image.width = spec.width;
      image.height = spec.height;
      image.style.display = 'block';
      image.style.width = '100%';
      image.style.height = '100%';
      image.style.pointerEvents = 'none';
      element.append(image);
      element.onclick = () => onSelectPoi(poi.poiId);
      markersRef.current.push(new mapboxgl.Marker({ element, anchor: 'bottom' }).setLngLat([poi.location.longitude, poi.location.latitude]).addTo(map));
    }
    for (const camera of cameras) {
      const element = document.createElement('button'); element.type = 'button'; element.title = camera.name; element.setAttribute('aria-label', camera.name); element.textContent = '📹'; element.style.fontSize = '24px'; element.style.background = '#26263f'; element.style.border = '2px solid white'; element.style.borderRadius = '50%'; element.style.width = '36px'; element.style.height = '36px'; element.onclick = () => onSelectCamera(camera.cameraId); if (camera.cameraId === selectedCameraId) element.style.transform = 'scale(1.25)';
      markersRef.current.push(new mapboxgl.Marker({ element, anchor: 'center' }).setLngLat([camera.location.longitude, camera.location.latitude]).addTo(map));
    }
  }, [mapMarkerSelectionKey, pois, cameras, categories, theme, selectedCameraId, onSelectPoi, onSelectCamera, photoImageByPoiId, photoPinTemplate]);
  return <div ref={containerRef} data-testid="tourist-mapbox" role="img" aria-label="Map" className="tourist-map-canvas" />;
}
