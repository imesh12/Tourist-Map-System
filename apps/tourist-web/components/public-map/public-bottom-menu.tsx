'use client';

import type { PublicationMenuItem } from 'shared-types';
import { categoryIconMeta } from '@/lib/public-map/category-icon-meta';

/**
 * Checkpoint 1B.10 §6/§7/§8 — the floating bottom menu, and the ONLY place
 * this app exposes category filtering. `apps/admin-web/lib/tenant/menu-item.ts`'s
 * own doc comment is explicit that "CATEGORY != MENU ITEM": a `Category` is
 * taxonomy, a `MenuItem` is a separate, admin-curated decision about what
 * actually appears in public navigation, in what order, under what label.
 * A second, independent "all enabled categories" filter row would fight that
 * architecture (and the checkpoint's own single-bottom-bar mockup, §3) — so
 * this component renders EXACTLY `snapshot.menu` (already published-order,
 * already enabled/disabled-filtered, already broken-reference-safe — see
 * `buildPublicMenuProjection()`'s own doc comment,
 * apps/admin-web/lib/tenant/menu-projection.ts) plus one leading "All"
 * control this app adds itself to reset the filter (§6: "provide a simple
 * way to show all categories again").
 *
 * `CATEGORY` items set the category filter and show `aria-pressed` when
 * active (§6/§8/§15: "visually indicate active selection... exposed
 * semantically"). `FEATURE` items are one-shot triggers (`SEARCH` opens the
 * search overlay; `MY_LOCATION` requests geolocation) — never toggle state,
 * §8's "visually indicate active selection" only ever applies to the
 * category-filter concept.
 *
 * A horizontally scrollable strip (§7: "For many menu items: horizontally
 * scrollable strip... do not make the entire bottom of the screen
 * permanently huge") — `app/globals.css`'s `.public-bottom-menu` rule is
 * `overflow-x: auto` with a fixed height, never growing with item count.
 */
export interface PublicBottomMenuProps {
  readonly menu: readonly PublicationMenuItem[];
  readonly selectedCategoryId: string | null;
  readonly onSelectCategory: (categoryId: string | null) => void;
  readonly onOpenSearch: () => void;
  readonly onRequestMyLocation: () => void;
}

export function PublicBottomMenu({ menu, selectedCategoryId, onSelectCategory, onOpenSearch, onRequestMyLocation }: PublicBottomMenuProps) {
  if (menu.length === 0) {
    // An admin who publishes zero menu items has deliberately chosen no
    // public navigation at all (§7: "render only what publication has
    // already projected") — rendering an empty strip would just be visual
    // noise with nothing usable inside it.
    return null;
  }

  return (
    <nav data-testid="public-bottom-menu" className="public-bottom-menu" aria-label="Map menu">
      <button
        type="button"
        data-testid="public-menu-all"
        className="public-menu-item"
        aria-pressed={selectedCategoryId === null}
        onClick={() => onSelectCategory(null)}
      >
        All
      </button>
      {menu.map((item) => {
        if (item.type === 'CATEGORY') {
          const isActive = selectedCategoryId === item.categoryId;
          return (
            <button
              key={item.categoryId}
              type="button"
              data-testid={`public-menu-category-${item.categoryId}`}
              className="public-menu-item"
              aria-pressed={isActive}
              onClick={() => onSelectCategory(item.categoryId)}
            >
              <span aria-hidden="true">{categoryIconMeta(item.icon).emoji}</span> {item.label}
            </button>
          );
        }

        const featureTestKey = item.featureKey.toLowerCase().replace(/_/g, '-');
        return (
          <button
            key={item.featureKey}
            type="button"
            data-testid={`public-menu-feature-${featureTestKey}`}
            className="public-menu-item"
            onClick={item.featureKey === 'SEARCH' ? onOpenSearch : item.featureKey === 'MY_LOCATION' ? onRequestMyLocation : undefined}
            disabled={item.featureKey !== 'SEARCH' && item.featureKey !== 'MY_LOCATION'}
          >
            <span aria-hidden="true">{categoryIconMeta(item.icon).emoji}</span> {item.label}
          </button>
        );
      })}
    </nav>
  );
}
