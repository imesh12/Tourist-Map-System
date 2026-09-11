import { z } from 'zod';
import { LIVE_CAMERA_STATUSES } from 'shared-types';
import { customerIdSchema, liveCameraIdSchema, mapIdSchema } from './ids.js';
import { localizedTextSchema } from './language.js';
import { latitudeSchema, longitudeSchema } from './map.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * LiveCamera domain + input schemas — LIVE CAMERAS FOUNDATION checkpoint,
 * see shared-types' `LiveCamera` doc comment. Mirrors `page.ts`'s shape
 * (full-document schema for defense-in-depth reads, plus separate
 * `.strict()` create/update input schemas for the untrusted mutation
 * boundary) with one addition: `playback` validation (MANDATORY
 * ARCHITECTURE CORRECTIONS 1/2 from the Phase A→B review) — see
 * `liveCameraPlaybackUrlSchema`'s own doc comment below for the exact
 * rejection rules.
 */

const NAME_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 2000;
/** Generous but bounded — a relay URL is a normal HTTPS URL, never expected to approach this length; matches `publishedPoiPlaceSchema.websiteUri`'s own bound (packages/validation/src/publication.ts). */
const PLAYBACK_URL_MAX_LENGTH = 2048;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export const liveCameraNameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);
export const liveCameraDescriptionSchema = z.string().trim().min(1).max(DESCRIPTION_MAX_LENGTH);
export const liveCameraStatusSchema = z.enum(LIVE_CAMERA_STATUSES);

export const liveCameraLocationSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

/** LIVE CAMERAS FOUNDATION checkpoint — mirrors `pageTranslationsSchema`'s own doc comment (./page.ts). Each field's translation bound matches its own scalar schema's max length exactly. */
export const liveCameraTranslationsSchema = z
  .object({
    name: localizedTextSchema(NAME_MAX_LENGTH).optional(),
    description: localizedTextSchema(DESCRIPTION_MAX_LENGTH).optional(),
  })
  .strict();

/**
 * MANDATORY ARCHITECTURE CORRECTION 2 (LIVE CAMERAS FOUNDATION checkpoint
 * Phase B) — a playback URL represents a BROWSER-SAFE RELAY endpoint only,
 * never a camera-source URL. This is the actual enforcement point for that
 * boundary:
 *
 * - Rejects anything that does not parse as an absolute URL at all
 *   (malformed input).
 * - Rejects any non-`https:` scheme — this explicitly rejects `rtsp://`
 *   (the private camera-source protocol must never even be expressible
 *   here) as well as plain `http://` (a production-facing relay endpoint a
 *   real tourist browser connects to must be served over TLS).
 * - Rejects a URL carrying an embedded `username`/`password` component
 *   (e.g. `https://user:pass@host/...`) — a relay URL never needs to carry
 *   camera credentials, and this schema is the one place that could
 *   otherwise slip through unnoticed.
 * - Rejects a hostname that is a loopback, private-network, or link-local
 *   address/literal (localhost, 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
 *   192.168.0.0/16, 169.254.0.0/16, ::1, fe80::/10, fc00::/7, *.localhost,
 *   *.local) — a public relay endpoint should never resolve to a LAN/
 *   loopback address, and this closes off using this field to probe or
 *   reach internal infrastructure. See `isPrivateOrLoopbackPlaybackHostname`
 *   below for the exact (DNS-free, network-free) matching rules.
 *
 * Deliberately independent of `poiProviderSchema`/anything Google-Places-
 * related — a Live Camera has no "provider" concept in this checkpoint at
 * all, unlike a `Poi`.
 */
/**
 * Pure string/IP-literal matching only — NO DNS resolution, NO network
 * calls. This schema must remain safely callable during synchronous
 * request validation, so "is this hostname private" can only ever be
 * answered from the literal text of the URL itself, never by resolving it.
 * A hostname that merely *could* resolve to a private address (a public
 * DNS name pointed at a LAN IP, "DNS rebinding") is explicitly out of
 * scope here — that class of attack requires runtime/network-level
 * defenses (e.g. validating the relay's actual connection target), not a
 * string check on an admin-supplied URL.
 *
 * `hostname` is taken from `new URL(value).hostname`, which — for the
 * `https:` "special" scheme — WHATWG's URL parser already normalizes:
 * shorthand/hex/octal IPv4 forms (e.g. `127.1`, `0x7f.1`) are canonicalized
 * to plain dotted-decimal, and IPv6 literals are always bracketed
 * (`[::1]`). That normalization is what makes the plain regex/range checks
 * below sufficient without re-implementing IPv4/IPv6 parsing.
 */
function isPrivateOrLoopbackPlaybackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Bracketed IPv6 literal, e.g. "[::1]", "[fe80::1]", "[fc00::1]".
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return isPrivateOrLoopbackIpv6Literal(lower.slice(1, -1));
  }

  // localhost / *.localhost, local / *.local — always private by convention,
  // never a real public relay hostname.
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower === 'local' || lower.endsWith('.local')) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4) {
    const octets = ipv4.slice(1, 5).map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    const [a, b] = octets;
    if (a === undefined || b === undefined) return false;
    if (a === 127) return true; // 127.0.0.0/8 — loopback
    if (a === 10) return true; // 10.0.0.0/8 — private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 — private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 — private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local
    return false;
  }

  return false;
}

function isPrivateOrLoopbackIpv6Literal(literal: string): boolean {
  const lower = literal.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // fe80::/10 — link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 — unique local
  return false;
}

/** Extracts a video ID only from exact official HTTPS YouTube URL forms. */
export function extractYouTubeVideoId(value: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
  const host = parsed.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
  } else if (host === 'youtube.com' || host === 'www.youtube.com') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parsed.pathname === '/watch') candidate = parsed.searchParams.get('v');
    else if (parts[0] === 'live' || parts[0] === 'embed') candidate = parts[1] ?? null;
  }
  return candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate) ? candidate : undefined;
}

export const liveCameraPlaybackUrlSchema = z
  .string()
  .trim()
  .max(PLAYBACK_URL_MAX_LENGTH)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Playback URL must be a valid, absolute URL.' });
      return;
    }
    if (parsed.protocol !== 'https:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Playback URL must use https:// — a browser-safe relay endpoint, never rtsp:// or plain http://.',
      });
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Playback URL must not contain an embedded username or password.' });
    }
    if (isPrivateOrLoopbackPlaybackHostname(parsed.hostname)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Playback URL must not target localhost, a loopback, private, or link-local address — it must be a publicly reachable relay endpoint.',
      });
    }
  });

export const liveCameraYouTubeUrlSchema = z
  .string()
  .trim()
  .max(PLAYBACK_URL_MAX_LENGTH)
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'YouTube URL must be a valid, absolute URL.' });
      return;
    }
    if (parsed.protocol !== 'https:') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'YouTube URL must use https://.' });
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'YouTube URL must not contain an embedded username or password.' });
    }
    if (!extractYouTubeVideoId(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use an official YouTube watch, youtu.be, live, or embed URL.' });
    }
  });

/**
 * MANDATORY ARCHITECTURE CORRECTION 1 — `transport` is `'WEBRTC' | 'HLS' | 'YOUTUBE'`
 * only; there is no `'TEST'` (or any other non-durable) member on this
 * domain schema. See shared-types' `LiveCameraPlayback` doc comment
 * (./live-camera.js) for where a deterministic test transport actually
 * lives instead (tourist-web's own playback adapter layer, never this
 * schema).
 */
export const liveCameraPlaybackSchema = z.discriminatedUnion('transport', [
  z.object({ transport: z.literal('WEBRTC'), playbackUrl: liveCameraPlaybackUrlSchema }).strict(),
  z.object({ transport: z.literal('HLS'), playbackUrl: liveCameraPlaybackUrlSchema }).strict(),
  z.object({ transport: z.literal('YOUTUBE'), playbackUrl: liveCameraYouTubeUrlSchema }).strict(),
]);

/**
 * Full stored document — defense-in-depth validation for reads, mirroring
 * `pageSchema`/`poiSchema`'s role. `playback` is OPTIONAL (MANDATORY
 * ARCHITECTURE CORRECTION 1 — a camera with no playback configuration is a
 * fully valid stored document).
 */
export const liveCameraSchema = z.object({
  cameraId: liveCameraIdSchema,
  customerId: customerIdSchema,
  mapId: mapIdSchema,
  name: liveCameraNameSchema,
  translations: liveCameraTranslationsSchema.optional(),
  description: liveCameraDescriptionSchema.optional(),
  location: liveCameraLocationSchema,
  status: liveCameraStatusSchema,
  playback: liveCameraPlaybackSchema.optional(),
  createdAt: firestoreTimestampLikeSchema,
  updatedAt: firestoreTimestampLikeSchema,
});
export type LiveCameraParsed = z.infer<typeof liveCameraSchema>;

/**
 * `POST /api/maps/{mapId}/cameras` input. `.strict()` rejects `cameraId`/
 * `customerId`/`mapId`/`createdAt`/`updatedAt` outright — none of those are
 * ever client-suppliable; the server derives/generates/stamps them. `status`
 * is optional (defaults to `ENABLED` in the route handler, mirroring
 * `pageCreateInputSchema`'s identical default-on-omit convention). No RTSP
 * URL / camera username / camera password / private LAN-address field
 * exists on this schema at all — see shared-types' `LiveCamera.playback`
 * doc comment for why that is a deliberate, permanent omission for this
 * checkpoint, not an oversight.
 */
export const liveCameraCreateInputSchema = z
  .object({
    name: liveCameraNameSchema,
    description: liveCameraDescriptionSchema.optional(),
    location: liveCameraLocationSchema,
    status: liveCameraStatusSchema.optional(),
    playback: liveCameraPlaybackSchema.optional(),
    translations: liveCameraTranslationsSchema.optional(),
  })
  .strict();
export type LiveCameraCreateInput = z.infer<typeof liveCameraCreateInputSchema>;

/**
 * `PATCH /api/maps/{mapId}/cameras/{cameraId}` input — every field optional
 * (a partial update: e.g. an enable/disable toggle sends only `status`),
 * but at least one must be present. `cameraId`/`customerId`/`mapId`/
 * `createdAt`/`updatedAt` are not fields on this schema at all, exactly
 * like `pageUpdateInputSchema`.
 *
 * `playback` accepts `null` as an explicit "clear the playback
 * configuration back to Not Configured" signal (the route handler maps
 * `null` to `FieldValue.delete()`), distinct from `undefined` ("this PATCH
 * does not touch playback at all") — the same "explicit clear vs. leave
 * alone" distinction `pageUpdateInputSchema.translations`'s empty-object
 * convention already establishes for a different field shape.
 */
export const liveCameraUpdateInputSchema = z
  .object({
    name: liveCameraNameSchema.optional(),
    // Deliberately NOT `liveCameraDescriptionSchema.optional()` — that
    // schema's `min(1)` would make an explicit "clear the description"
    // request (an empty string) fail validation. An update payload may send
    // `''` to mean "clear"; the route handler maps an empty string to
    // `FieldValue.delete()`, a non-empty string to a plain set, and
    // `undefined` (the key omitted) to "leave the stored value alone."
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    location: liveCameraLocationSchema.optional(),
    status: liveCameraStatusSchema.optional(),
    playback: liveCameraPlaybackSchema.nullable().optional(),
    translations: liveCameraTranslationsSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
export type LiveCameraUpdateInput = z.infer<typeof liveCameraUpdateInputSchema>;
