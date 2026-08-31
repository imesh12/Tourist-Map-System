/// <reference types="google.maps" />
'use client';

import { importLibrary } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import type { MapStyle } from 'shared-types';
import { mapThemeToGoogleMapsStyles } from 'map-theme-adapter';
import { ensureGoogleMapsApiConfigured } from './google-maps-loader';
import { MapPreviewSummary } from './map-preview-summary';
import type { MapPreviewProps } from './types';

/**
 * Google Maps adapter — checkpoint 1B.1-D. Only ever rendered by
 * `map-preview.tsx`'s dispatcher; never imported directly elsewhere.
 *
 * API key: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, read from the environment
 * only — never hardcoded (requirement 3). `NEXT_PUBLIC_`-prefixed because
 * this is browser code and, exactly like the Firebase Web SDK config in
 * `lib/firebase/client.ts`, a Google Maps browser API key is not a secret
 * by design (it's restricted by HTTP-referrer/API restrictions configured
 * in the Google Cloud Console, not by hiding the string). Local
 * development and this app's E2E suite deliberately run with this unset —
 * see the "no API key configured" branch below, and
 * e2e/map-preview.spec.ts, which is what actually exercises that branch in
 * CI, since no real key is ever configured for hermetic tests.
 *
 * `setOptions()` is called at most once module-wide (the underlying Google
 * Maps script tag must only ever be injected once per page, and the loader
 * itself only accepts configuration before the first library import); the
 * `google.maps.Map` instance itself is created once per mount and then only
 * ever *updated*
 * in place (`setCenter`/`setZoom`/`setMapTypeId`) as props change —
 * requirement 6 ("update the map immediately without saving") — never torn
 * down and recreated on every keystroke, and requirement 10 ("do not write
 * to Firestore while the user moves the map") is satisfied trivially: this
 * component never calls `fetch`/Firestore at all: it only ever calls the
 * `onCenterChange`/`onZoomChange` callback props, which `map-settings-form.tsx`
 * wires to local `useState` setters, not to the save endpoint.
 */

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station — an arbitrary, harmless default viewport
const DEFAULT_ZOOM = 5;

function mapStyleToMapTypeId(style: MapStyle): google.maps.MapTypeId {
  switch (style) {
    case 'SATELLITE':
      return google.maps.MapTypeId.SATELLITE;
    case 'HYBRID':
      return google.maps.MapTypeId.HYBRID;
    case 'TERRAIN':
      return google.maps.MapTypeId.TERRAIN;
    // CUSTOM has no built-in Google Maps equivalent yet (real custom map
    // styling is a later concern) — ROAD is the closest safe default, same
    // as ROAD itself.
    case 'ROAD':
    case 'CUSTOM':
    default:
      return google.maps.MapTypeId.ROADMAP;
  }
}

type LoadStatus = 'loading' | 'ready' | 'error';

export function GoogleMapsPreview({ style, center, zoom, bounds, onCenterChange, onZoomChange, theme }: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | undefined>(undefined);
  const rectangleRef = useRef<google.maps.Rectangle | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Create the map exactly once, on mount — initial values come from
  // whatever `center`/`zoom` this component was first rendered with
  // (requirement 5: the tenant's real Firestore-backed values, passed down
  // by map-settings-form.tsx's initial state).
  useEffect(() => {
    if (!apiKey || !containerRef.current) {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    ensureGoogleMapsApiConfigured(apiKey);

    importLibrary('maps')
      .then(({ Map }) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        const map = new Map(containerRef.current, {
          center: center ?? DEFAULT_CENTER,
          zoom: zoom ?? DEFAULT_ZOOM,
          mapTypeId: mapStyleToMapTypeId(style),
          // Checkpoint 1B.7 — initial styling, from whatever `theme` this
          // component was first rendered with. Kept in sync with later
          // `theme` prop changes by the dedicated effect below, the same
          // "seed once on mount, then update imperatively" split every other
          // prop on this component already follows.
          styles: theme ? [...mapThemeToGoogleMapsStyles(theme)] : undefined,
        });
        map.addListener('dragend', () => {
          const newCenter = map.getCenter();
          if (newCenter) {
            onCenterChange?.({ lat: newCenter.lat(), lng: newCenter.lng() });
          }
        });
        map.addListener('zoom_changed', () => {
          const newZoom = map.getZoom();
          if (newZoom !== undefined) {
            onZoomChange?.(newZoom);
          }
        });
        mapRef.current = map;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
    // Intentionally mount-only: `center`/`zoom`/`style`/`theme` here seed
    // the INITIAL map only. Subsequent prop changes are applied
    // imperatively by the effects below, not by recreating the map (which
    // would discard the user's own in-progress pan/zoom on every keystroke
    // elsewhere in the form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Sync center — requirement 6 (form → map, no save). Depends on the
  // primitive lat/lng values, not the `center` object itself — a new
  // `{lat,lng}` object literal is built fresh every render in
  // map-settings-form.tsx's `useMemo`, so depending on object identity
  // would re-run this on every render even when the actual values haven't
  // changed.
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setCenter(center);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng]);

  // Sync zoom — requirement 6.
  useEffect(() => {
    if (mapRef.current && zoom !== undefined) {
      mapRef.current.setZoom(zoom);
    }
  }, [zoom]);

  // Sync style/map type.
  useEffect(() => {
    mapRef.current?.setMapTypeId(mapStyleToMapTypeId(style));
  }, [style]);

  // Sync theme — checkpoint 1B.7 §8 ("theme changes MUST update the
  // existing map preview immediately... Save still required to persist").
  // `theme` is a compound object (preset + visibility + colors +
  // markerStyle), not a primitive like `zoom`/`style`, so depending on
  // object identity directly would re-run this on every render (a fresh
  // `MapTheme` object literal is built each render in
  // map-settings-form.tsx's memoized value the same way `center` is).
  // `JSON.stringify` gives a cheap, stable value-equality key — `MapTheme`
  // is a small plain-data object with no functions/dates/undefined-only
  // keys once validated, so this is a safe, deterministic dependency, and
  // matches this effect block's own "depend on primitive/stable values, not
  // fresh-every-render object identity" convention.
  const themeKey = theme ? JSON.stringify(theme) : undefined;
  useEffect(() => {
    if (mapRef.current && theme) {
      mapRef.current.setOptions({ styles: [...mapThemeToGoogleMapsStyles(theme)] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);

  // Visualize BOUNDED bounds as a rectangle overlay — requirement 8. Torn
  // down and redrawn (not mutated) on every bounds change, and removed
  // entirely (`setMap(null)`) once bounds becomes undefined (UNBOUNDED).
  // Same "depend on primitives, not the fresh-every-render object" reasoning
  // as the center effect above.
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    rectangleRef.current?.setMap(null);
    rectangleRef.current = undefined;

    if (bounds) {
      rectangleRef.current = new google.maps.Rectangle({
        map: mapRef.current,
        bounds: { north: bounds.north, south: bounds.south, east: bounds.east, west: bounds.west },
        fillOpacity: 0.1,
        strokeWeight: 2,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west]);

  if (!apiKey) {
    return <MapPreviewSummary notice="Live map preview requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to be configured." />;
  }

  if (status === 'error') {
    return <MapPreviewSummary notice="Could not load the Google Maps preview." />;
  }

  // Checkpoint 1B.8 §3 — "substantially larger than it is now" (was 320px);
  // bumped alongside `.workspace-grid`'s wider right column and
  // `MapPreviewSummary`'s matching `minHeight` (map-preview-summary.tsx), so
  // every preview state (live map, fallback notice) occupies the same
  // larger footprint.
  return <div ref={containerRef} data-testid="google-map-preview" className="map-preview-frame" style={{ width: '100%', height: 520 }} />;
}
