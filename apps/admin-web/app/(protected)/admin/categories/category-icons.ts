import { CATEGORY_ICONS, type CategoryIcon } from 'shared-types';

/**
 * A controlled icon catalog for `/admin/categories` — checkpoint (Category
 * CMS redesign) §12. One fixed emoji + label per `CategoryIcon` enum value
 * (shared-types) — never arbitrary SVG, HTML, script, or a remote icon URL.
 * A plain lookup table over a closed enum has zero injection surface: there
 * is no code path where anything other than one of these ten hardcoded
 * pairs can reach the DOM.
 *
 * Deliberately plain emoji, not a new icon library — admin-web has no icon
 * dependency to reuse for category glyphs specifically (the admin shell's
 * `NavIcon` set, checkpoint 1A.10, covers navigation icons only, a
 * different, fixed vocabulary) and the checkpoint's own example
 * (🍴 Food, 🛍 Shopping, 📍 Sightseeing...) is exactly this shape.
 */
export const CATEGORY_ICON_META: Record<CategoryIcon, { readonly emoji: string; readonly label: string }> = {
  FOOD: { emoji: '🍴', label: 'Food' },
  SHOPPING: { emoji: '🛍️', label: 'Shopping' },
  SIGHTSEEING: { emoji: '📍', label: 'Sightseeing' },
  HOTEL: { emoji: '🏨', label: 'Hotel' },
  STATION: { emoji: '🚉', label: 'Station' },
  MUSEUM: { emoji: '🏛️', label: 'Museum' },
  NATURE: { emoji: '🌳', label: 'Nature' },
  ACTIVITY: { emoji: '🎫', label: 'Activity' },
  INFORMATION: { emoji: 'ℹ️', label: 'Information' },
  OTHER: { emoji: '🔖', label: 'Other' },
};

export function categoryIconOptionLabel(icon: CategoryIcon): string {
  const meta = CATEGORY_ICON_META[icon];
  return `${meta.emoji} ${meta.label}`;
}

export const ALL_CATEGORY_ICONS = CATEGORY_ICONS;
