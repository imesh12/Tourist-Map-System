/// <reference types="google.maps" />
import type { PublishedLiveCamera } from 'shared-types';

/**
 * LIVE CAMERAS FOUNDATION checkpoint — the one place a real
 * `google.maps.Marker` is ever created for a Live Camera. A dedicated,
 * standalone layer, deliberately NOT sharing `poi-marker-layer.ts`'s
 * `PoiMarkerLayer`/`SyncOptions` types or its `markers` array: cameras are
 * NOT POIs (see shared-types' `LiveCamera` doc comment), so they get their
 * own small module with its own icon, mirroring `poi-marker-layer.ts`'s
 * shape (`sync()`/`destroy()`, full clear-and-recreate resync) without
 * touching that file or the approved photo-pin marker geometry in
 * `marker-style-adapter.ts` at all.
 *
 * The camera glyph is a small, self-contained inline SVG data URI — not a
 * call into `buildMarkerIcon()` (marker-style-adapter.ts): that function's
 * pattern set (`rounded-square`/`circle`/`classic-pin`/`icon-circle`/
 * `photo-pin`) is the already-approved POI marker geometry, and this
 * checkpoint's instructions are explicit that it must not be modified or
 * reused to grow a second, unrelated content type's visual language. A
 * distinct dark "viewfinder" badge with a red dot reads unambiguously as
 * "camera" against the same clean tourism basemap POI markers already use.
 */

export interface LiveCameraMarkerLayer {
  readonly sync: (options: LiveCameraSyncOptions) => void;
  readonly destroy: () => void;
}

export interface LiveCameraSyncOptions {
  readonly cameras: readonly PublishedLiveCamera[];
  readonly selectedCameraId: string | null;
  readonly onSelect: (cameraId: string) => void;
}

const BASE_SIZE = 34;
const SELECTED_SCALE = 1.25;

function cameraIconDataUri(selected: boolean): string {
  const fill = selected ? '#1a1a2e' : '#26263f';
  const accent = '#ef4444';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BASE_SIZE}" height="${BASE_SIZE}" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="16" fill="${fill}" stroke="#ffffff" stroke-width="2"/>
    <path d="M9 13.5A1.5 1.5 0 0 1 10.5 12h2l1-1.5h7L21.5 12h2A1.5 1.5 0 0 1 25 13.5v7A1.5 1.5 0 0 1 23.5 22h-13A1.5 1.5 0 0 1 9 20.5Z" fill="#ffffff"/>
    <circle cx="17" cy="17" r="2.6" fill="${fill}"/>
    <circle cx="22.5" cy="12.5" r="2" fill="${accent}"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function createLiveCameraMarkerLayer(map: google.maps.Map): LiveCameraMarkerLayer {
  let markers: google.maps.Marker[] = [];
  let listeners: google.maps.MapsEventListener[] = [];

  function clear(): void {
    for (const listener of listeners) listener.remove();
    listeners = [];
    for (const marker of markers) {
      marker.setMap(null);
    }
    markers = [];
  }

  function sync(options: LiveCameraSyncOptions): void {
    clear();

    for (const camera of options.cameras) {
      const isSelected = options.selectedCameraId === camera.cameraId;
      const size = isSelected ? Math.round(BASE_SIZE * SELECTED_SCALE) : BASE_SIZE;
      const marker = new google.maps.Marker({
        map,
        position: { lat: camera.location.latitude, lng: camera.location.longitude },
        title: camera.name,
        icon: {
          url: cameraIconDataUri(isSelected),
          scaledSize: new google.maps.Size(size, size),
          anchor: new google.maps.Point(size / 2, size / 2),
        },
        zIndex: isSelected ? 2000 : 10,
      });
      listeners.push(marker.addListener('click', () => options.onSelect(camera.cameraId)));
      markers.push(marker);
    }
  }

  function destroy(): void {
    clear();
  }

  return { sync, destroy };
}
