import type { MapBranding } from 'shared-types';

/**
 * Checkpoint 1B.16 §4 — turns the publication snapshot's optional
 * `map.branding` (`MapBranding`: `logoUrl?`/`primaryColor?`/`secondaryColor?`,
 * each already `#RRGGBB`/http(s)-validated by `packages/validation`'s
 * `mapBrandingSchema` before it ever reaches a public consumer) into the
 * small, fixed set of CSS custom properties the floating tourist UI reads.
 *
 * Deliberately pure and framework-free (no React, no DOM) so it stays unit-
 * testable exactly like `marker-style-adapter.ts` / `language-selection.ts`
 * — the component layer only ever spreads the returned object onto a
 * `style={}` prop.
 *
 * Fallbacks (§4: "Use safe fallbacks when values are absent"):
 * - `--brand-primary` falls back to `#111827`, the dark neutral this app
 *   already uses for the selected/pressed pill — so an unbranded map looks
 *   exactly like it does today.
 * - `--brand-secondary` falls back to `#5b6472`, a muted neutral used only
 *   for minor accents (never text-on-color).
 * - `--brand-on-primary` is DERIVED, never taken from branding: the tenant
 *   primary can be any `#RRGGBB`, including a pale one where white text would
 *   fail WCAG contrast, so the readable ink/paper color to sit ON the
 *   primary is computed from its relative luminance. The focus-ring color is
 *   NOT part of this — it stays the app-wide `#2f6fed` constant regardless
 *   of tenant branding (an accessibility affordance, not a brand surface).
 */

export interface BrandingCssVars {
  readonly '--brand-primary': string;
  readonly '--brand-secondary': string;
  readonly '--brand-on-primary': string;
}

const FALLBACK_PRIMARY = '#111827';
const FALLBACK_SECONDARY = '#5b6472';
const INK = '#111827';
const PAPER = '#ffffff';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function normalizeHex(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return HEX_COLOR.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

/** sRGB channel (0–255) → linearized component, per the WCAG 2.x relative-luminance definition. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Which of ink (`#111827`) / paper (`#ffffff`) has the higher WCAG contrast
 * ratio against `background` — so text/glyphs placed on a brand-colored
 * surface stay legible whatever color the tenant chose.
 */
export function readableTextColor(background: string): string {
  const bg = relativeLuminance(background);
  const contrastWithPaper = (Math.max(bg, relativeLuminance(PAPER)) + 0.05) / (Math.min(bg, relativeLuminance(PAPER)) + 0.05);
  const contrastWithInk = (Math.max(bg, relativeLuminance(INK)) + 0.05) / (Math.min(bg, relativeLuminance(INK)) + 0.05);
  return contrastWithInk >= contrastWithPaper ? INK : PAPER;
}

export function resolveBrandingVars(branding: MapBranding | undefined): BrandingCssVars {
  const primary = normalizeHex(branding?.primaryColor, FALLBACK_PRIMARY);
  const secondary = normalizeHex(branding?.secondaryColor, FALLBACK_SECONDARY);
  return {
    '--brand-primary': primary,
    '--brand-secondary': secondary,
    '--brand-on-primary': readableTextColor(primary),
  };
}

/**
 * A stable, deterministic 1–2 character monogram for the logo-fallback chip
 * when `branding.logoUrl` is absent (§4) — the map name's first letter, or
 * the first letters of its first two words. Never rendered as the accessible
 * name (the real `<h1>` map name is always present beside it); it is a
 * decorative stand-in only.
 */
export function brandMonogram(mapName: string): string {
  const words = mapName.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  if (first === undefined) {
    return '•';
  }
  if (second === undefined) {
    return [...first].slice(0, 2).join('').toUpperCase() || '•';
  }
  const initials = ([...first][0] ?? '') + ([...second][0] ?? '');
  return initials.toUpperCase() || '•';
}
