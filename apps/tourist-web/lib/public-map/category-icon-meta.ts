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
export const CATEGORY_ICON_META: Readonly<Record<CategoryIcon, { readonly emoji: string; readonly color: string }>> = {
  // `color` is the marker/badge fill color `marker-style-adapter.ts` uses —
  // a small, fixed, accessible-contrast palette, not a per-tenant setting.
  FOOD: { emoji: '🍴', color: '#e2622a' },
  SHOPPING: { emoji: '🛍️', color: '#a24fc4' },
  SIGHTSEEING: { emoji: '📍', color: '#2f6fed' },
  HOTEL: { emoji: '🏨', color: '#0f8f7c' },
  STATION: { emoji: '🚉', color: '#5a5f66' },
  MUSEUM: { emoji: '🏛️', color: '#8a6d3b' },
  NATURE: { emoji: '🌳', color: '#2e8b3d' },
  ACTIVITY: { emoji: '🎫', color: '#d6a621' },
  INFORMATION: { emoji: 'ℹ️', color: '#1f78b4' },
  OTHER: { emoji: '🔖', color: '#6b7280' },
};

/** Safe lookup that never throws for an unexpected string — the closed enum should make this unreachable, but a stored value is still read back through `validation`'s schema, not this table, so this stays defensive rather than assuming. */
export function categoryIconMeta(icon: CategoryIcon): { readonly emoji: string; readonly color: string } {
  return CATEGORY_ICON_META[icon] ?? CATEGORY_ICON_META.OTHER;
}

export const ALL_CATEGORY_ICONS = CATEGORY_ICONS;
