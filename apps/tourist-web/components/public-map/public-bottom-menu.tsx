'use client';

import type { PublicationMenuItem } from 'shared-types';
import { categoryIconMeta } from '@/lib/public-map/category-icon-meta';
import { ALL_GLYPH_PATH, featureGlyphPath } from '@/lib/public-map/menu-glyphs';

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
 * Checkpoint 1B.16 §1/§3 — the VISUAL treatment moved from an outlined
 * horizontal pill to a compact "icon above, label below" tourism-navigation
 * cell (icon = the same closed `CategoryIcon` vector vocabulary already used
 * for markers, `category-icon-meta.ts`, rendered as an `aria-hidden` `<svg>`
 * paired with the real visible label — never an icon-only control). Utility
 * FEATURE items (Search / My Location) get a subtly distinct treatment via
 * a `data-testid`-prefixed CSS hook so they read as platform tools, not
 * tourism categories, wherever the published order places them (§5) — the
 * order itself is never re-grouped here. Behavior, testids, `aria-pressed`
 * rules and the horizontal-scroll strip are all UNCHANGED.
 *
 * A horizontally scrollable strip (§7: "For many menu items: horizontally
 * scrollable strip... do not make the entire bottom of the screen
 * permanently huge") — `app/globals.css`'s `.public-bottom-menu` rule is
 * `overflow-x: auto` with a fixed height, never growing with item count.
 *
 * checkpoint 1B.11 — a `PAGE` item is a one-shot trigger like a `FEATURE`
 * item (never toggles filter state), but it is its own explicit branch
 * rather than folded into the FEATURE fallthrough below: once `CATEGORY` is
 * excluded, the remaining union member is no longer just `FEATURE` now that
 * `PublicationMenuItem` has three variants, so `PAGE` must be checked
 * explicitly before that fallthrough can safely assume `FEATURE` — the same
 * fix already applied to `buildPublicMenuProjection()`'s identical
 * CATEGORY/FEATURE narrowing (apps/admin-web/lib/tenant/menu-projection.ts).
 */
export interface PublicBottomMenuProps {
  readonly menu: readonly PublicationMenuItem[];
  readonly selectedCategoryId: string | null;
  readonly onSelectCategory: (categoryId: string | null) => void;
  readonly onOpenSearch: () => void;
  readonly onRequestMyLocation: () => void;
  readonly onOpenPage: (pageId: string) => void;
}

/**
 * The decorative glyph + visible label pair every dock control shares.
 * `path` is a `0 0 24 24` vector fragment (preferred); `emoji` is the
 * legacy text fallback for the (currently unreachable) case of no path.
 */
function MenuItemFace({ path, emoji, label }: { path?: string; emoji?: string; label: string }) {
  return (
    <>
      <span className="public-menu-item-icon" aria-hidden="true">
        {path ? (
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d={path} />
          </svg>
        ) : (
          emoji
        )}
      </span>
      <span className="public-menu-item-label">{label}</span>
    </>
  );
}

export function PublicBottomMenu({
  menu,
  selectedCategoryId,
  onSelectCategory,
  onOpenSearch,
  onRequestMyLocation,
  onOpenPage,
}: PublicBottomMenuProps) {
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
        title="All"
      >
        <MenuItemFace path={ALL_GLYPH_PATH} label="All" />
      </button>
      {menu.map((item) => {
        if (item.type === 'CATEGORY') {
          const isActive = selectedCategoryId === item.categoryId;
          const meta = categoryIconMeta(item.icon);
          return (
            <button
              key={item.categoryId}
              type="button"
              data-testid={`public-menu-category-${item.categoryId}`}
              className="public-menu-item"
              aria-pressed={isActive}
              onClick={() => onSelectCategory(item.categoryId)}
              title={item.label}
            >
              <MenuItemFace path={meta.markerGlyphPath} emoji={meta.emoji} label={item.label} />
            </button>
          );
        }

        if (item.type === 'PAGE') {
          const meta = categoryIconMeta(item.icon);
          return (
            <button
              key={item.pageId}
              type="button"
              data-testid={`public-menu-page-${item.pageId}`}
              className="public-menu-item"
              onClick={() => onOpenPage(item.pageId)}
              title={item.label}
            >
              <MenuItemFace path={meta.markerGlyphPath} emoji={meta.emoji} label={item.label} />
            </button>
          );
        }

        const featureTestKey = item.featureKey.toLowerCase().replace(/_/g, '-');
        const meta = categoryIconMeta(item.icon);
        return (
          <button
            key={item.featureKey}
            type="button"
            data-testid={`public-menu-feature-${featureTestKey}`}
            className="public-menu-item public-menu-item--utility"
            onClick={item.featureKey === 'SEARCH' ? onOpenSearch : item.featureKey === 'MY_LOCATION' ? onRequestMyLocation : undefined}
            disabled={item.featureKey !== 'SEARCH' && item.featureKey !== 'MY_LOCATION'}
            title={item.label}
          >
            <MenuItemFace path={featureGlyphPath(item.featureKey) ?? meta.markerGlyphPath} emoji={meta.emoji} label={item.label} />
          </button>
        );
      })}
    </nav>
  );
}
