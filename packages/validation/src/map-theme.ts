import { z } from 'zod';
import { MAP_MARKER_SIZES, MAP_MARKER_STYLES, MAP_THEME_PRESETS } from 'shared-types';

/**
 * `MapTheme` validation — checkpoint 1B.7, see
 * docs/architecture/MAP_THEME_ARCHITECTURE.md. Mirrors `mapBrandingSchema`'s
 * (./branding.ts) exact shape/reasoning: a small, explicit, `.strict()`
 * schema per sub-object — never arbitrary provider style JSON, never an
 * ownership/system field. Reused, unmodified, in BOTH `mapSchema` (defense-
 * in-depth read validation, ./map.ts) and `mapSettingsUpdateSchema` (the
 * untrusted PATCH input boundary, ./map-settings.ts) — one schema, two
 * trust boundaries, same as every other embedded map sub-object.
 *
 * `.strict()` on every object here means an unrecognized key — a raw
 * Google Maps `styles` array entry, a `customerId`/`mapId`/`status`/other
 * ownership or system field, or any other forged field — is REJECTED
 * outright at parse time, never silently stripped. This is what makes
 * "reject unknown fields" and "reject raw provider-specific JSON" (§4 of
 * the checkpoint) an enforced invariant rather than a UI convention: there
 * is no field on this schema a raw Google `MapTypeStyle[]` array could
 * possibly satisfy, since this schema has no array-of-stylers shape at all.
 */

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const mapThemePresetSchema = z.enum(MAP_THEME_PRESETS);
export const mapMarkerStyleSchema = z.enum(MAP_MARKER_STYLES);
export const mapMarkerSizeSchema = z.enum(MAP_MARKER_SIZES);

/** `MapTheme.visibility` — every flag required (not optional): a saved theme always has an explicit, complete visibility decision for every provider content category, never a partially-specified one. */
export const mapThemeVisibilitySchema = z
  .object({
    businessPois: z.boolean(),
    transit: z.boolean(),
    schools: z.boolean(),
    hospitals: z.boolean(),
    parks: z.boolean(),
    roadLabels: z.boolean(),
    transitLabels: z.boolean(),
  })
  .strict();

/** `MapTheme.colors` — every field optional (an absent color defers to the provider's own default), each restricted to `#RRGGBB` exactly like `mapBrandingSchema`'s colors. */
export const mapThemeColorsSchema = z
  .object({
    background: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
    land: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
    road: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
    water: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
    label: z.string().trim().regex(HEX_COLOR_PATTERN, 'Must be a #RRGGBB color').optional(),
  })
  .strict();

export const mapThemeMarkerStyleSchema = z
  .object({
    style: mapMarkerStyleSchema,
    size: mapMarkerSizeSchema,
  })
  .strict();

export const mapThemeSchema = z
  .object({
    preset: mapThemePresetSchema,
    visibility: mapThemeVisibilitySchema,
    colors: mapThemeColorsSchema.optional(),
    markerStyle: mapThemeMarkerStyleSchema,
  })
  .strict();

export type MapThemeParsed = z.infer<typeof mapThemeSchema>;
