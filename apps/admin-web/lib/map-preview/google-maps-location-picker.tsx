/// <reference types="google.maps" />
'use client';

import { importLibrary } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import { ensureGoogleMapsApiConfigured } from './google-maps-loader';
import { MapPreviewSummary } from './map-preview-summary';
import type { LocationPickerProps } from './types';

/**
 * Google Maps location-picker adapter — checkpoint 1B.3 §14. Only ever
 * rendered by `location-picker.tsx`'s dispatcher, mirroring
 * `google-maps-preview.tsx`/`map-preview.tsx`'s existing split. Reuses the
 * SAME loader singleton (`google-maps-loader.ts`) as the Map Settings
 * preview — no second Google Maps script tag, no second `setOptions()`
 * call.
 *
 * Unlike `GoogleMapsPreview` (an area/bounds viewer with no marker), this
 * component's whole purpose is a single draggable marker: clicking the map
 * OR dragging the marker both call `onLocationChange`; the map itself is
 * never programmatically re-centered after the initial mount (re-centering
 * on every keystroke from the paired lat/lng text inputs would fight a user
 * who is actively panning to find their POI).
 */
const DEFAULT_ZOOM = 15;

type LoadStatus = 'loading' | 'ready' | 'error';

export function GoogleMapsLocationPicker({ value, initialCenter, initialZoom, bounds, onLocationChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | undefined>(undefined);
  const markerRef = useRef<google.maps.Marker | undefined>(undefined);
  const rectangleRef = useRef<google.maps.Rectangle | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Create the map + marker exactly once, on mount.
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
          center: initialCenter,
          zoom: initialZoom ?? DEFAULT_ZOOM,
        });
        const marker = new google.maps.Marker({ map, position: value, draggable: true });

        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (event.latLng) {
            onLocationChange({ lat: event.latLng.lat(), lng: event.latLng.lng() });
          }
        });
        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (position) {
            onLocationChange({ lat: position.lat(), lng: position.lng() });
          }
        });

        mapRef.current = map;
        markerRef.current = marker;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
    };
    // Intentionally mount-only — see `google-maps-preview.tsx`'s identical
    // note: `initialCenter`/`value`/`initialZoom` seed the INITIAL map/marker
    // only. Subsequent `value` changes are applied imperatively below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Move the marker when `value` changes (typed lat/lng, or a parent
  // re-render after a click/drag already round-tripped through state) —
  // never re-centers the map itself, so the user's own pan/zoom is
  // preserved. This effect only ever imperatively repositions the EXISTING
  // marker created by the mount-only effect above — it never touches
  // `mapRef`/`markerRef` creation or the map's click/dragend listeners, so
  // depending on the live coordinates here does not recreate the map
  // instance or re-attach listeners on every location change; only the
  // FIRST effect (map/marker/listener creation, intentionally `[apiKey]`-
  // only) carries that risk, and this fix leaves it untouched.
  //
  // `setPosition({ lat: value.lat, lng: value.lng })`, not
  // `setPosition(value)` — passing the object reference itself made
  // `react-hooks/exhaustive-deps` correctly flag a missing `value`
  // dependency (the effect body read the whole object, which the
  // `[value.lat, value.lng]` primitive-only dependency list doesn't cover).
  // Rebuilding the literal from the two primitives it actually reads keeps
  // the effect's real dependencies (`value.lat`/`value.lng`) exactly
  // matching what the linter can verify, with no behavior change and no
  // `eslint-disable`.
  useEffect(() => {
    markerRef.current?.setPosition({ lat: value.lat, lng: value.lng });
  }, [value.lat, value.lng]);

  // Visualize configured bounds as a rectangle overlay — visual guide only
  // (§16); the server is still the actual enforcement boundary. Same
  // pattern as `google-maps-preview.tsx`'s bounds rectangle.
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
        fillOpacity: 0.05,
        strokeWeight: 2,
        clickable: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west]);

  if (!apiKey) {
    return <MapPreviewSummary notice="Map location picker requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to be configured. Enter coordinates manually below." />;
  }

  if (status === 'error') {
    return <MapPreviewSummary notice="Could not load the map location picker. Enter coordinates manually below." />;
  }

  return (
    <div
      ref={containerRef}
      data-testid="google-map-location-picker"
      className="map-preview-frame"
      style={{ width: '100%', height: 240 }}
    />
  );
}
