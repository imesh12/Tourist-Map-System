/**
 * Checkpoint 1B.16 §1/§3/§5 — vector glyphs for the DOM navigation dock that
 * are NOT tied to a `CategoryIcon`: the app's own "All" reset control and the
 * platform UTILITY features (Search, My Location). Category/Page menu items
 * keep using `categoryIconMeta(icon).markerGlyphPath` — this module only
 * covers the glyphs that vocabulary doesn't have.
 *
 * Same rules as `category-icon-meta.ts`'s `markerGlyphPath`: authored in a
 * `0 0 24 24` box, `fill`-inheriting (the consumer sets `fill: currentColor`),
 * no external icon dependency, our own trusted constants — never user input.
 * The DOM renders these as an `aria-hidden` `<svg>` paired with a real
 * visible text label, so they are decoration, never an icon-only control.
 */

/** A 2×2 grid — the "show everything" reset. */
export const ALL_GLYPH_PATH = 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z';

const MAGNIFIER_GLYPH_PATH =
  'M10 3a7 7 0 1 0 4.19 12.6l4.1 4.1a1 1 0 0 0 1.42-1.42l-4.1-4.1A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z';

const MY_LOCATION_GLYPH_PATH =
  'M12 2a1 1 0 0 1 1 1v1.06A8 8 0 0 1 19.94 11H21a1 1 0 1 1 0 2h-1.06A8 8 0 0 1 13 19.94V21a1 1 0 1 1-2 0v-1.06A8 8 0 0 1 4.06 13H3a1 1 0 1 1 0-2h1.06A8 8 0 0 1 11 4.06V3a1 1 0 0 1 1-1zm0 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z';

/**
 * A functional glyph for a known utility `featureKey`, or `undefined` for any
 * other value — the caller then falls back to the item's `CategoryIcon`
 * glyph. Choosing a magnifier for SEARCH / a crosshair for MY_LOCATION is a
 * per-app UI decision (exactly like `category-icon-meta.ts`'s emoji table),
 * not new data — the published menu item and its label are unchanged.
 */
export function featureGlyphPath(featureKey: string): string | undefined {
  switch (featureKey) {
    case 'SEARCH':
      return MAGNIFIER_GLYPH_PATH;
    case 'MY_LOCATION':
      return MY_LOCATION_GLYPH_PATH;
    default:
      return undefined;
  }
}
