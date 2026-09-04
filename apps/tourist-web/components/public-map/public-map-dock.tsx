'use client';

import type { MapBranding, PublicContentLanguage, PublicationMenuItem } from 'shared-types';
import { brandMonogram } from '@/lib/public-map/branding';
import { LanguageSelector } from './language-selector';
import { PublicBottomMenu } from './public-bottom-menu';

/**
 * Checkpoint 1B.16 §3/§4 — the floating navigation dock: one polished,
 * rounded surface near the bottom of the map that carries everything the
 * tourist needs to move around the map, so the rest of the viewport stays
 * pure map (§14/§16).
 *
 * It is the single home for TENANT IDENTITY (§4): the published branding
 * logo (or a name-derived monogram when none is set), the map name as the
 * page's one real `<h1>`, and — deliberately quiet beneath it — the "Powered
 * by Tourist Map System" line. Colors come from the `--brand-*` custom
 * properties the shell already put on the map body (`lib/public-map/branding.ts`),
 * so this component never re-reads branding for anything but the logo URL.
 *
 * The middle of the dock is `PublicBottomMenu` UNCHANGED in behavior — it
 * still renders exactly `snapshot.menu` (published order, already
 * enabled-filtered) plus the one "All" reset, with the same testids,
 * `aria-pressed` rules and horizontal-scroll strip as before; only its
 * visual frame moved inside the dock. It returns `null` for a zero-item
 * menu, and this dock still renders (branding, attribution and the language
 * selector must not vanish just because an admin published no menu items).
 *
 * The language selector (§7) sits at the trailing edge — the existing
 * `<select>`, unchanged, reading only `snapshot.supportedLanguages` from the
 * immutable publication snapshot; it renders nothing when a map supports a
 * single language.
 */
export interface PublicMapDockProps {
  readonly mapName: string;
  readonly branding: MapBranding | undefined;
  readonly menu: readonly PublicationMenuItem[];
  readonly selectedCategoryId: string | null;
  readonly onSelectCategory: (categoryId: string | null) => void;
  readonly onOpenSearch: () => void;
  readonly onRequestMyLocation: () => void;
  readonly onOpenPage: (pageId: string) => void;
  readonly supportedLanguages: readonly PublicContentLanguage[];
  readonly currentLanguage: PublicContentLanguage;
  readonly onLanguageChange: (language: PublicContentLanguage) => void;
}

export function PublicMapDock({
  mapName,
  branding,
  menu,
  selectedCategoryId,
  onSelectCategory,
  onOpenSearch,
  onRequestMyLocation,
  onOpenPage,
  supportedLanguages,
  currentLanguage,
  onLanguageChange,
}: PublicMapDockProps) {
  const logoUrl = branding?.logoUrl;
  // Hairline separators between the dock's logical sections (§1: "subtle
  // dividers between logical sections... Search and utility actions visually
  // separated"). Purely decorative — rendered only when there is content on
  // both sides so an empty menu or a single-language map never leaves a
  // divider floating against the dock edge.
  const hasMenu = menu.length > 0;
  const hasLanguage = supportedLanguages.length > 1;

  return (
    <div className="public-map-dock" data-testid="public-map-dock">
      <div className="public-map-dock-brand" data-testid="tourist-map-branding">
        {logoUrl ? (
          // Decorative: the real, accessible identity is the `<h1>` beside it.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="public-map-dock-logo" src={logoUrl} alt="" data-testid="tourist-map-brand-logo" />
        ) : (
          <span className="public-map-dock-logo public-map-dock-logo--fallback" aria-hidden="true">
            {brandMonogram(mapName)}
          </span>
        )}
        <span className="public-map-dock-brand-text">
          <h1 className="tourist-map-branding-name">{mapName}</h1>
          <span className="tourist-map-attribution" data-testid="tourist-map-attribution">
            Powered by Tourist Map System
          </span>
        </span>
      </div>

      {hasMenu ? (
        <>
          <span className="public-map-dock-divider" aria-hidden="true" />
          {/* §1 — the ONLY elastic zone: this viewport clips, the menu strip
              inside scrolls. Keeps a long published menu from ever squeezing
              the fixed brand or pushing the fixed language selector out. */}
          <div className="public-map-dock-menu-viewport">
            <PublicBottomMenu
              menu={menu}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={onSelectCategory}
              onOpenSearch={onOpenSearch}
              onRequestMyLocation={onRequestMyLocation}
              onOpenPage={onOpenPage}
            />
          </div>
        </>
      ) : null}

      {hasLanguage ? (
        <>
          <span className="public-map-dock-divider" aria-hidden="true" />
          <div className="public-map-dock-utilities">
            <LanguageSelector supportedLanguages={supportedLanguages} currentLanguage={currentLanguage} onChange={onLanguageChange} />
          </div>
        </>
      ) : null}
    </div>
  );
}
