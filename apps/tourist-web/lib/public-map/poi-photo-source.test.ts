import { describe, expect, it } from 'vitest';
import {
  buildPoiPhotoMetaUrl,
  buildPoiPhotoUrl,
  bytesToDataUri,
  COVER_PHOTO_PX,
  GALLERY_MAX_PHOTOS,
  MARKER_PHOTO_MAX,
  MARKER_PHOTO_PX,
  normalizePhotoApiBaseUrl,
} from './poi-photo-source';

describe('prototype constants', () => {
  it('MARKER_PHOTO_MAX is a small positive integer cap (bounds the up-front fetch blast radius)', () => {
    expect(Number.isInteger(MARKER_PHOTO_MAX)).toBe(true);
    expect(MARKER_PHOTO_MAX).toBeGreaterThan(0);
    expect(MARKER_PHOTO_MAX).toBeLessThanOrEqual(50);
  });

  it('the marker request is smaller than the cover request', () => {
    expect(MARKER_PHOTO_PX).toBeLessThan(COVER_PHOTO_PX);
  });

  it('GALLERY_MAX_PHOTOS is a small positive integer (mirrors the server cap)', () => {
    expect(Number.isInteger(GALLERY_MAX_PHOTOS)).toBe(true);
    expect(GALLERY_MAX_PHOTOS).toBeGreaterThan(1);
    expect(GALLERY_MAX_PHOTOS).toBeLessThanOrEqual(20);
  });
});

const BASE = 'https://admin.example';
const MAP_ID = 'map_aB3dEf6gH9jKlMn0pQ';
const POI_ID = 'poi_aB3dEf6gH9jKlMn0pQ';

describe('normalizePhotoApiBaseUrl', () => {
  it('returns undefined for an unset, empty, or whitespace-only value (feature disabled)', () => {
    expect(normalizePhotoApiBaseUrl(undefined)).toBeUndefined();
    expect(normalizePhotoApiBaseUrl('')).toBeUndefined();
    expect(normalizePhotoApiBaseUrl('   ')).toBeUndefined();
  });

  it('trims surrounding whitespace and any trailing slashes', () => {
    expect(normalizePhotoApiBaseUrl('  https://admin.example/  ')).toBe('https://admin.example');
    expect(normalizePhotoApiBaseUrl('https://admin.example///')).toBe('https://admin.example');
    expect(normalizePhotoApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('buildPoiPhotoUrl', () => {
  it('returns undefined when no base URL is configured — no photo request is ever attempted', () => {
    expect(buildPoiPhotoUrl(undefined, MAP_ID, POI_ID)).toBeUndefined();
    expect(buildPoiPhotoUrl(undefined, MAP_ID, POI_ID, { maxPx: MARKER_PHOTO_PX })).toBeUndefined();
  });

  it('builds the binary photo endpoint path against the configured base', () => {
    expect(buildPoiPhotoUrl(BASE, MAP_ID, POI_ID)).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo`,
    );
  });

  it('appends both max dimension params when a size is given', () => {
    expect(buildPoiPhotoUrl(BASE, MAP_ID, POI_ID, { maxPx: MARKER_PHOTO_PX })).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo?maxWidthPx=${MARKER_PHOTO_PX}&maxHeightPx=${MARKER_PHOTO_PX}`,
    );
    expect(buildPoiPhotoUrl(BASE, MAP_ID, POI_ID, { maxPx: COVER_PHOTO_PX })).toContain(`maxWidthPx=${COVER_PHOTO_PX}`);
  });

  it('adds ?index=N only for N > 0 (0 is the implicit default — keeps the cover URL stable)', () => {
    expect(buildPoiPhotoUrl(BASE, MAP_ID, POI_ID, { index: 0 })).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo`,
    );
    expect(buildPoiPhotoUrl(BASE, MAP_ID, POI_ID, { index: 2, maxPx: COVER_PHOTO_PX })).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo?index=2&maxWidthPx=${COVER_PHOTO_PX}&maxHeightPx=${COVER_PHOTO_PX}`,
    );
  });

  it('URL-encodes the mapId and poiId path segments', () => {
    const url = buildPoiPhotoUrl(BASE, 'map/../../etc', 'poi id', { maxPx: MARKER_PHOTO_PX });
    expect(url).toContain('/maps/map%2F..%2F..%2Fetc/pois/poi%20id/photo');
  });
});

describe('buildPoiPhotoMetaUrl', () => {
  it('returns undefined when no base URL is configured', () => {
    expect(buildPoiPhotoMetaUrl(undefined, MAP_ID, POI_ID)).toBeUndefined();
  });

  it('builds the photo-meta endpoint path (never takes size params)', () => {
    expect(buildPoiPhotoMetaUrl(BASE, MAP_ID, POI_ID)).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo-meta`,
    );
  });

  it('adds ?index=N only for N > 0', () => {
    expect(buildPoiPhotoMetaUrl(BASE, MAP_ID, POI_ID, { index: 0 })).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo-meta`,
    );
    expect(buildPoiPhotoMetaUrl(BASE, MAP_ID, POI_ID, { index: 3 })).toBe(
      `https://admin.example/api/public/maps/${MAP_ID}/pois/${POI_ID}/photo-meta?index=3`,
    );
  });
});

describe('bytesToDataUri', () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('produces a base64 data: URI that round-trips back to the exact input bytes', () => {
    const uri = bytesToDataUri(bytes, 'image/png');
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    const decoded = atob(uri.slice('data:image/png;base64,'.length));
    expect(Array.from(decoded, (ch) => ch.charCodeAt(0))).toEqual(Array.from(bytes));
  });

  it('preserves image content types that carry parameters', () => {
    expect(bytesToDataUri(bytes, 'image/jpeg;charset=binary').startsWith('data:image/jpeg;charset=binary;base64,')).toBe(true);
  });

  it('returns "" for a non-image content type (never inlines an unexpected payload)', () => {
    expect(bytesToDataUri(bytes, 'text/html')).toBe('');
    expect(bytesToDataUri(bytes, '')).toBe('');
    expect(bytesToDataUri(bytes, 'application/octet-stream')).toBe('');
  });

  it('returns "" for empty input', () => {
    expect(bytesToDataUri(new Uint8Array(), 'image/png')).toBe('');
  });

  it('handles a payload larger than the 0x8000 chunk boundary without corruption', () => {
    const big = new Uint8Array(0x8000 * 2 + 5);
    for (let i = 0; i < big.length; i += 1) {
      big[i] = i % 256;
    }
    const uri = bytesToDataUri(big, 'image/webp');
    const decoded = atob(uri.slice('data:image/webp;base64,'.length));
    expect(decoded.length).toBe(big.length);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(big.length - 1)).toBe((big.length - 1) % 256);
  });
});
