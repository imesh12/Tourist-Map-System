import { z } from 'zod';

/**
 * Basic map branding — checkpoint 1B.1, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md §2. Mirrors shared-types'
 * `MapBranding`. Colors are restricted to a controlled `#RRGGBB` format —
 * never arbitrary CSS, per SYSTEM_BLUEPRINT.md §11 ("controlled theme
 * options... not arbitrary CSS, to protect readability and prevent clients
 * from breaking the UI"). `logoUrl` accepts only a well-formed `http(s)`
 * URL — real Storage upload is deferred, so this is a plain string field
 * for now, but it is still restricted to a safe scheme: Zod's bare `.url()`
 * check accepts anything the WHATWG URL parser considers syntactically
 * valid, which includes `javascript:`/`data:` URLs (confirmed against the
 * installed zod version, not assumed) — and this value is eventually
 * rendered as an `<img src>`, where a `data:image/svg+xml` payload with an
 * embedded `onload` handler is a known XSS vector. Restricting to
 * `http:`/`https:` closes that off without needing a separate sanitizer.
 */

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const LOGO_URL_MAX_LENGTH = 2048;
const ALLOWED_LOGO_URL_PROTOCOLS = new Set(['http:', 'https:']);

function hasAllowedLogoUrlProtocol(value: string): boolean {
  try {
    return ALLOWED_LOGO_URL_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export const mapBrandingSchema = z
  .object({
    logoUrl: z
      .string()
      .trim()
      .url()
      .max(LOGO_URL_MAX_LENGTH)
      .refine(hasAllowedLogoUrlProtocol, { message: 'logoUrl must be an http(s) URL' })
      .optional(),
    primaryColor: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
    secondaryColor: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
  })
  .strict();

export type MapBrandingParsed = z.infer<typeof mapBrandingSchema>;
