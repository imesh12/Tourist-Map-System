import { CATEGORY_ICONS, type CategoryIcon } from 'shared-types';

/**
 * Checkpoint 1B.10 §5 — tourist-web's OWN controlled glyph lookup for the
 * closed `CategoryIcon` enum (`shared-types`). Deliberately NOT imported
 * from admin-web's equivalent
 * (`apps/admin-web/app/(protected)/admin/maps/[mapId]/categories/category-icons.ts`)
 * — that file lives inside admin-web's own app directory, and `CategoryIcon`
 * itself is explicitly documented (see that enum's own doc comment,
 * `packages/shared-types/src/enums.ts`) as "a fixed, small, semantic set...
 * the actual glyph/asset per identifier is an admin-web UI concern, not a
 * domain concept" — i.e. the concrete glyph choice is deliberately a
 * per-app UI decision, not a shared domain type, matching the exact same
 * "small, per-app, no cross-app import" precedent
 * `lib/public-map/google-maps-loader.ts` already establishes for this app.
 * The emoji chosen here intentionally match admin-web's own table for
 * visual/brand consistency between the CMS and the public map, but that is
 * a design choice, not an architectural coupling — the two tables could
 * diverge without breaking anything.
 *
 * §5 also requires NOT introducing a new external icon dependency when the
 * existing controlled icon vocabulary is reusable — this reuses exactly the
 * same `CATEGORY_ICONS` closed enum every category/menu item already
 * validates against, never a free-form string or a remote icon URL.
 */
export interface CategoryIconMeta {
  readonly emoji: string;
  readonly color: string;
  /**
   * Checkpoint 1B.16 §5 — a coherent, platform-independent SVG glyph for the
   * MAP MARKER only, replacing the emoji rendered inside `<text>` (which
   * paints inconsistently across OS/browser — mono vs. color, vertical
   * misalignment, sometimes a tofu box). Path data authored in a `0 0 24 24`
   * box, drawn `fill`-inheriting (the marker's contrasting glyph color is
   * set on the wrapping `<g>` by `buildMarkerIcon`), so a fragment here must
   * NOT hard-code its own `fill`. The DOM surfaces (bottom menu, POI detail
   * card) keep using `emoji` — it renders fine as real text there, paired
   * with a visible label and `aria-hidden`.
   */
  readonly markerGlyphPath: string;
}

export const CATEGORY_ICON_META: Readonly<Record<CategoryIcon, CategoryIconMeta>> = {
  // `color` is the marker/badge fill color `marker-style-adapter.ts` uses —
  // a small, fixed, accessible-contrast palette, not a per-tenant setting.
  FOOD: {
    emoji: '🍴',
    color: '#e2622a',
    markerGlyphPath:
      'M8 2c.55 0 1 .45 1 1v5h1V3c0-.55.45-1 1-1s1 .45 1 1v5h1V3c0-.55.45-1 1-1s1 .45 1 1v6c0 1.86-1.28 3.41-3 3.86V21a1 1 0 0 1-2 0v-8.14C9.28 12.41 8 10.86 8 9V3c0-.55.45-1 1-1zm9 0c1.1 0 2 2.24 2 5 0 2.42-.69 4.44-1.6 4.9L17.5 21a1.25 1.25 0 0 1-2.5 0V4c0-1.1.9-2 2-2z',
  },
  SHOPPING: {
    emoji: '🛍️',
    color: '#a24fc4',
    markerGlyphPath:
      'M12 2a4 4 0 0 1 4 4h2.2c.9 0 1.65.67 1.78 1.56l1.4 10A2 2 0 0 1 20.4 21H3.6a2 2 0 0 1-1.98-2.44l1.4-10A1.8 1.8 0 0 1 4.8 6H7a5 5 0 0 1 5-4zm0 2a2 2 0 0 0-2 2h4a2 2 0 0 0-2-2z',
  },
  SIGHTSEEING: {
    emoji: '📍',
    color: '#2f6fed',
    markerGlyphPath:
      'M9.2 3h5.6l1.4 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8l1.4-2zM12 8a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
  },
  HOTEL: {
    emoji: '🏨',
    color: '#0f8f7c',
    markerGlyphPath:
      'M3 5a1 1 0 0 1 2 0v7h10V9a2 2 0 0 1 2-2h2a3 3 0 0 1 3 3v9a1 1 0 0 1-2 0v-2H4v2a1 1 0 0 1-2 0V5zm5.5 1A2.5 2.5 0 1 0 8.5 11 2.5 2.5 0 0 0 8.5 6z',
  },
  STATION: {
    emoji: '🚉',
    color: '#5a5f66',
    markerGlyphPath:
      'M7 2h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3l1.8 2.4a.75.75 0 0 1-.6 1.2H5.8a.75.75 0 0 1-.6-1.2L7 18a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zm-.5 4v4h11V6h-11zM8.5 12A1.5 1.5 0 1 0 8.5 15 1.5 1.5 0 0 0 8.5 12zm7 0A1.5 1.5 0 1 0 15.5 15 1.5 1.5 0 0 0 15.5 12z',
  },
  MUSEUM: {
    emoji: '🏛️',
    color: '#8a6d3b',
    markerGlyphPath:
      'M12 2l9 5v2H3V7l9-5zM5 11h2v7H5v-7zm4 0h2v7H9v-7zm4 0h2v7h-2v-7zm4 0h2v7h-2v-7zM3 19h18v2.5H3V19z',
  },
  NATURE: {
    emoji: '🌳',
    color: '#2e8b3d',
    markerGlyphPath: 'M12 2c3.5 0 6 3 6 6.5 0 3.2-2.2 5.9-5 6.4V21a1 1 0 0 1-2 0v-6.1c-2.8-.5-5-3.2-5-6.4C6 5 8.5 2 12 2z',
  },
  ACTIVITY: {
    emoji: '🎫',
    color: '#d6a621',
    markerGlyphPath:
      'M3 6h18a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1zm12 1.5v9h1.5v-9H15z',
  },
  INFORMATION: {
    emoji: 'ℹ️',
    color: '#1f78b4',
    markerGlyphPath: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a1.6 1.6 0 1 1 0 3.2A1.6 1.6 0 0 1 12 6zm-1.5 5h3v6.5H16V19H8v-1.5h2.5V13H9v-1.5h1.5z',
  },
  OTHER: {
    emoji: '🔖',
    color: '#6b7280',
    markerGlyphPath: 'M7 3h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5a2 2 0 0 1 2-2z',
  },
};

/** Safe lookup that never throws for an unexpected string — the closed enum should make this unreachable, but a stored value is still read back through `validation`'s schema, not this table, so this stays defensive rather than assuming. */
export function categoryIconMeta(icon: CategoryIcon): CategoryIconMeta {
  return CATEGORY_ICON_META[icon] ?? CATEGORY_ICON_META.OTHER;
}

export const ALL_CATEGORY_ICONS = CATEGORY_ICONS;
