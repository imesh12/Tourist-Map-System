import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedLiveCamera } from 'shared-types';
import { createLiveCameraMarkerLayer } from './live-camera-marker-layer';

// Only the SDK boundary is fake. The real camera layer constructs, updates,
// selects and destroys markers; no SDK loader, key, DOM or network is needed.
class FakeMarker {
  static instances: FakeMarker[] = [];
  readonly clicks = new Set<() => void>();
  readonly setMap = vi.fn();
  constructor(readonly options: google.maps.MarkerOptions) {
    FakeMarker.instances.push(this);
  }
  addListener(event: string, callback: () => void) {
    expect(event).toBe('click');
    this.clicks.add(callback);
    return { remove: () => this.clicks.delete(callback) };
  }
  click() {
    for (const callback of this.clicks) callback();
  }
}

const cameras: PublishedLiveCamera[] = [
  { cameraId: 'cam_harbor', name: 'Harbor', location: { latitude: 35.68, longitude: 139.76 } },
  { cameraId: 'cam_hill', name: 'Hill', location: { latitude: 35.70, longitude: 139.80 } },
];

beforeEach(() => {
  FakeMarker.instances = [];
  vi.stubGlobal('google', { maps: {
    Marker: FakeMarker,
    Size: class { constructor(readonly width: number, readonly height: number) {} },
    Point: class { constructor(readonly x: number, readonly y: number) {} },
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe('LiveCameraMarkerLayer', () => {
  it('creates only the supplied published cameras with positions, camera glyphs and correct click IDs', () => {
    const map = {} as google.maps.Map;
    const layer = createLiveCameraMarkerLayer(map);
    const select = vi.fn();
    layer.sync({ cameras, selectedCameraId: null, onSelect: select });
    expect(FakeMarker.instances).toHaveLength(2);
    expect(select).not.toHaveBeenCalled();
    for (const [index, camera] of cameras.entries()) {
      const marker = FakeMarker.instances[index];
      expect(marker).toBeDefined();
      expect(marker?.options).toMatchObject({ map, title: camera.name,
        position: { lat: camera.location.latitude, lng: camera.location.longitude },
        icon: { url: expect.stringContaining('data:image/svg+xml'), scaledSize: { width: 34, height: 34 } },
      });
      marker?.click();
      expect(select).toHaveBeenNthCalledWith(index + 1, camera.cameraId);
    }
    expect(select).toHaveBeenCalledTimes(2);
    layer.destroy();
  });

  it('detaches markers AND removes click listeners on resync and destroy', () => {
    const layer = createLiveCameraMarkerLayer({} as google.maps.Map);
    const oldSelect = vi.fn();
    layer.sync({ cameras, selectedCameraId: null, onSelect: oldSelect });
    const oldMarkers = [...FakeMarker.instances];
    const select = vi.fn();
    layer.sync({ cameras, selectedCameraId: 'cam_hill', onSelect: select });
    for (const marker of oldMarkers) {
      expect(marker.setMap).toHaveBeenCalledTimes(1);
      expect(marker.setMap).toHaveBeenCalledWith(null);
      expect(marker.clicks.size).toBe(0);
      marker.click();
    }
    expect(oldSelect).not.toHaveBeenCalled();
    const current = FakeMarker.instances.slice(2);
    expect(current).toHaveLength(2);
    expect(current[1]?.options).toMatchObject({ zIndex: 2000, icon: { scaledSize: { width: 43, height: 43 } } });
    current[1]?.click();
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('cam_hill');
    layer.destroy();
    layer.destroy();
    for (const marker of current) {
      expect(marker.setMap).toHaveBeenCalledTimes(1);
      expect(marker.setMap).toHaveBeenCalledWith(null);
      expect(marker.clicks.size).toBe(0);
      marker.click();
    }
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('keeps camera ownership separate from other markers and removes cameras absent from updated publication input', () => {
    const map = {} as google.maps.Map;
    const unrelatedMarker = new FakeMarker({ map, title: 'Existing POI/photo marker' });
    const layer = createLiveCameraMarkerLayer(map);
    layer.sync({ cameras, selectedCameraId: null, onSelect: vi.fn() });
    const cameraMarkers = FakeMarker.instances.slice(1);
    layer.sync({ cameras: [], selectedCameraId: null, onSelect: vi.fn() });
    expect(FakeMarker.instances).toHaveLength(3);
    for (const marker of cameraMarkers) expect(marker.setMap).toHaveBeenCalledWith(null);
    expect(unrelatedMarker.setMap).not.toHaveBeenCalled();
    layer.destroy();
    expect(unrelatedMarker.setMap).not.toHaveBeenCalled();
  });
});
