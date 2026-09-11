import { describe, expect, it } from 'vitest';
import {
  extractYouTubeVideoId,
  liveCameraCreateInputSchema,
  liveCameraPlaybackSchema,
  liveCameraPlaybackUrlSchema,
  liveCameraYouTubeUrlSchema,
  liveCameraSchema,
  liveCameraTranslationsSchema,
  liveCameraUpdateInputSchema,
} from './live-camera';

/**
 * LIVE CAMERAS FOUNDATION checkpoint — mirrors `page.test.ts`'s own
 * structure/conventions exactly (packages/validation/src/page.test.ts).
 */

const validCamera = {
  cameraId: 'cam_aB3dEf6gH9jKlMn0pQ',
  customerId: 'cust_aB3dEf6gH9jKlMn0pQ',
  mapId: 'map_aB3dEf6gH9jKlMn0pQ',
  name: 'Beachfront Plaza',
  location: { latitude: 35.0116, longitude: 135.7681 },
  status: 'ENABLED',
  createdAt: { seconds: 1700000000, nanoseconds: 0 },
  updatedAt: { seconds: 1700000001, nanoseconds: 0 },
};

const validCreateInput = {
  name: 'Beachfront Plaza',
  location: { latitude: 35.0116, longitude: 135.7681 },
};

describe('liveCameraSchema', () => {
  it('accepts a valid LiveCamera document with no playback configured', () => {
    expect(liveCameraSchema.safeParse(validCamera).success).toBe(true);
  });

  it('accepts a valid LiveCamera document WITH a WEBRTC playback configuration', () => {
    const result = liveCameraSchema.safeParse({
      ...validCamera,
      playback: { transport: 'WEBRTC', playbackUrl: 'https://relay.example.com/whep/cam-1' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized status', () => {
    expect(liveCameraSchema.safeParse({ ...validCamera, status: 'ARCHIVED' }).success).toBe(false);
  });

  it('rejects a malformed cameraId', () => {
    expect(liveCameraSchema.safeParse({ ...validCamera, cameraId: 'not-a-camera-id' }).success).toBe(false);
  });

  it('rejects a latitude out of range', () => {
    expect(liveCameraSchema.safeParse({ ...validCamera, location: { latitude: 999, longitude: 0 } }).success).toBe(false);
  });

  it('rejects a longitude out of range', () => {
    expect(liveCameraSchema.safeParse({ ...validCamera, location: { latitude: 0, longitude: -999 } }).success).toBe(false);
  });
});

describe('liveCameraTranslationsSchema — backward compatibility', () => {
  it('accepts a LiveCamera document with no translations field at all', () => {
    expect(liveCameraSchema.safeParse(validCamera).success).toBe(true);
  });

  it('accepts a valid name/description translations bag', () => {
    const result = liveCameraSchema.safeParse({
      ...validCamera,
      translations: { name: { ja: 'ビーチフロント広場' }, description: { ja: '海辺の広場のライブカメラ' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a translations bag keyed by an unregistered language code', () => {
    expect(liveCameraTranslationsSchema.safeParse({ name: { de: 'Info' } }).success).toBe(false);
  });

  it('rejects an unknown field on the translations object (strict mode)', () => {
    expect(liveCameraTranslationsSchema.safeParse({ name: { en: 'Camera' }, title: { en: 'nope' } }).success).toBe(false);
  });
});

describe('MANDATORY ARCHITECTURE CORRECTION 1 — playback is optional, WEBRTC/HLS only, no TEST transport', () => {
  it('accepts a LiveCamera document with no playback field at all — a camera with no playback is fully valid', () => {
    const { playback: _unused, ...withoutPlayback } = { ...validCamera, playback: undefined };
    void _unused;
    expect(liveCameraSchema.safeParse(withoutPlayback).success).toBe(true);
  });

  it('accepts transport: HLS', () => {
    expect(liveCameraPlaybackSchema.safeParse({ transport: 'HLS', playbackUrl: 'https://relay.example.com/live/cam-1.m3u8' }).success).toBe(
      true,
    );
  });

  it('accepts transport: WEBRTC', () => {
    expect(liveCameraPlaybackSchema.safeParse({ transport: 'WEBRTC', playbackUrl: 'https://relay.example.com/whep/cam-1' }).success).toBe(
      true,
    );
  });

  it('accepts official YouTube URL forms and extracts the video ID', () => {
    for (const [url, id] of [
      ['https://www.youtube.com/watch?v=abcDEF_1234', 'abcDEF_1234'],
      ['https://youtu.be/abcDEF_1234', 'abcDEF_1234'],
      ['https://www.youtube.com/live/abcDEF_1234', 'abcDEF_1234'],
      ['https://youtube.com/embed/abcDEF_1234', 'abcDEF_1234'],
    ] as const) {
      expect(liveCameraYouTubeUrlSchema.safeParse(url).success).toBe(true);
      expect(extractYouTubeVideoId(url)).toBe(id);
      expect(liveCameraPlaybackSchema.safeParse({ transport: 'YOUTUBE', playbackUrl: url }).success).toBe(true);
    }
  });

  it('rejects non-YouTube hosts, HTTP, credentials and malformed IDs', () => {
    for (const url of [
      'https://evil-youtube.example/watch?v=abcDEF_1234',
      'http://www.youtube.com/watch?v=abcDEF_1234',
      'https://user:pass@www.youtube.com/watch?v=abcDEF_1234',
      'https://www.youtube.com/watch?v=bad.id',
    ]) {
      expect(liveCameraYouTubeUrlSchema.safeParse(url).success).toBe(false);
      expect(extractYouTubeVideoId(url)).toBeUndefined();
    }
  });

  it('rejects transport: TEST — there is no non-durable transport member on the domain schema', () => {
    expect(liveCameraPlaybackSchema.safeParse({ transport: 'TEST', playbackUrl: 'https://relay.example.com/x' }).success).toBe(false);
  });

  it('rejects an unrecognized transport value entirely', () => {
    expect(liveCameraPlaybackSchema.safeParse({ transport: 'RTMP', playbackUrl: 'https://relay.example.com/x' }).success).toBe(false);
  });
});

describe('MANDATORY ARCHITECTURE CORRECTION 2 — playback URL must be a browser-safe relay endpoint', () => {
  it('accepts a plain https:// URL', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://relay.example.com/live/cam-1.m3u8').success).toBe(true);
  });

  it('rejects rtsp:// — the private camera-source protocol must never be expressible here', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('rtsp://192.168.1.50:554/stream1').success).toBe(false);
  });

  it('rejects plain http:// — a production relay endpoint must be served over TLS', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('http://relay.example.com/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects a URL with an embedded username/password', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://admin:password123@relay.example.com/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects a URL with only an embedded username', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://admin@relay.example.com/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects a malformed / non-absolute URL', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('not a url').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('/relative/path').success).toBe(false);
  });
});

describe('MANDATORY ARCHITECTURE CORRECTION 2 hardening — playback URL must not target localhost/private/link-local addresses (pure string/IP-literal matching, no DNS, no network calls)', () => {
  it('still accepts a normal public https:// relay hostname', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://relay.example.com/live/cam-1.m3u8').success).toBe(true);
  });

  it('still accepts a normal public https:// IPv4 literal', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://203.0.113.10/live/cam-1.m3u8').success).toBe(true);
  });

  it('rejects localhost and *.localhost', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://localhost/live/cam-1.m3u8').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://relay.localhost/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects 127.0.0.0/8 (loopback)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://127.0.0.1/live/cam-1.m3u8').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://127.255.255.254/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects 10.0.0.0/8 (private)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://10.0.0.5/live/cam-1.m3u8').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://10.255.255.255/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects 172.16.0.0/12 (private) but accepts neighboring public ranges 172.15.x.x / 172.32.x.x', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://172.16.0.1/live/cam-1.m3u8').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://172.31.255.255/live/cam-1.m3u8').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://172.15.255.255/live/cam-1.m3u8').success).toBe(true);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://172.32.0.1/live/cam-1.m3u8').success).toBe(true);
  });

  it('rejects 192.168.0.0/16 (private)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://192.168.1.50/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects 169.254.0.0/16 (link-local)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://169.254.1.1/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects ::1 (IPv6 loopback)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://[::1]/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects fe80::/10 (IPv6 link-local)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://[fe80::1]/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects fc00::/7 (IPv6 unique local)', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://[fc00::1]/live/cam-1.m3u8').success).toBe(false);
    expect(liveCameraPlaybackUrlSchema.safeParse('https://[fd12::1]/live/cam-1.m3u8').success).toBe(false);
  });

  it('rejects *.local', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://camera-relay.local/live/cam-1.m3u8').success).toBe(false);
  });

  it('still accepts a normal public https:// IPv6 literal', () => {
    expect(liveCameraPlaybackUrlSchema.safeParse('https://[2001:db8::1]/live/cam-1.m3u8').success).toBe(true);
  });
});

describe('liveCameraCreateInputSchema', () => {
  it('accepts a minimal valid create input (no playback — Not Configured)', () => {
    expect(liveCameraCreateInputSchema.safeParse(validCreateInput).success).toBe(true);
  });

  it('accepts an explicit status', () => {
    expect(liveCameraCreateInputSchema.safeParse({ ...validCreateInput, status: 'DISABLED' }).success).toBe(true);
  });

  it('rejects a missing name', () => {
    const { name, ...rest } = validCreateInput;
    void name;
    expect(liveCameraCreateInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing location', () => {
    const { location, ...rest } = validCreateInput;
    void location;
    expect(liveCameraCreateInputSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects client-supplied cameraId/customerId/mapId/timestamps outright (.strict())', () => {
    expect(liveCameraCreateInputSchema.safeParse({ ...validCreateInput, cameraId: 'cam_x' }).success).toBe(false);
    expect(liveCameraCreateInputSchema.safeParse({ ...validCreateInput, customerId: 'cust_x' }).success).toBe(false);
    expect(liveCameraCreateInputSchema.safeParse({ ...validCreateInput, mapId: 'map_x' }).success).toBe(false);
    expect(liveCameraCreateInputSchema.safeParse({ ...validCreateInput, createdAt: { seconds: 1, nanoseconds: 0 } }).success).toBe(false);
    expect(liveCameraCreateInputSchema.safeParse({ ...validCreateInput, updatedAt: { seconds: 1, nanoseconds: 0 } }).success).toBe(false);
  });

  it('rejects an rtsp:// playback URL on create — the boundary is enforced at every entry point, not only on read', () => {
    const result = liveCameraCreateInputSchema.safeParse({
      ...validCreateInput,
      playback: { transport: 'HLS', playbackUrl: 'rtsp://192.168.1.50/stream1' },
    });
    expect(result.success).toBe(false);
  });
});

describe('liveCameraUpdateInputSchema', () => {
  it('accepts a partial update (status only)', () => {
    expect(liveCameraUpdateInputSchema.safeParse({ status: 'DISABLED' }).success).toBe(true);
  });

  it('rejects an empty object — at least one field must be provided', () => {
    expect(liveCameraUpdateInputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts playback: null as the explicit "clear playback configuration" signal', () => {
    expect(liveCameraUpdateInputSchema.safeParse({ playback: null }).success).toBe(true);
  });

  it('accepts an empty translations object — the "clear every translation" case', () => {
    expect(liveCameraUpdateInputSchema.safeParse({ translations: {} }).success).toBe(true);
  });

  it('accepts an empty description string — the "clear the description" case', () => {
    expect(liveCameraUpdateInputSchema.safeParse({ description: '' }).success).toBe(true);
  });

  it('rejects cameraId/customerId/mapId/timestamps outright (.strict())', () => {
    expect(liveCameraUpdateInputSchema.safeParse({ status: 'ENABLED', cameraId: 'cam_x' }).success).toBe(false);
    expect(liveCameraUpdateInputSchema.safeParse({ status: 'ENABLED', customerId: 'cust_x' }).success).toBe(false);
    expect(liveCameraUpdateInputSchema.safeParse({ status: 'ENABLED', mapId: 'map_x' }).success).toBe(false);
  });
});
