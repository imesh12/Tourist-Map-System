import type { CSSProperties, ReactNode } from 'react';

/**
 * The full-viewport shell every public map page renders inside — checkpoint
 * 1B.9 §6, restructured by checkpoint 1B.16 into a genuinely map-first
 * surface: the map body now fills the entire viewport and every piece of
 * chrome (tenant branding, the menu dock, search, POI/page detail, the
 * language selector, the "Powered by" attribution) FLOATS over it rather
 * than occupying its own layout row. There is no longer a static header or
 * footer band eating vertical space — §14/§16's "map is the interface, not
 * the background for the interface".
 *
 * A plain server-renderable component (no 'use client' — nothing here is
 * interactive): one `<main>` positioning root, and whatever floating layer
 * its `children` (the `TouristMap`) render inside it. The branding `<h1>`
 * and the attribution line moved into `PublicMapDock` (rendered by
 * `TouristMap`) so they can be visually integrated into the one floating
 * dock instead of standing alone — the accessibility contract is unchanged
 * (still exactly one `<h1>` = the map name, still a visible attribution
 * line), only its container moved.
 *
 * `brandingStyle` carries the resolved `--brand-*` CSS custom properties
 * (checkpoint 1B.16 §4, `lib/public-map/branding.ts`) down onto the
 * positioning root so every floating overlay inherits the tenant palette
 * with no prop-drilling.
 *
 * EMBEDDABLE PUBLIC MAP FOUNDATION checkpoint — `isEmbed` stamps an inert
 * `data-embed="1"` attribute on the shell root when the page was requested
 * with `?embed=1` (resolved in `app/maps/[mapId]/page.tsx`). It is
 * DELIBERATELY not a rendering fork: the exact same tree renders either
 * way, the attribute is only a hook for future CSS / analytics / E2E
 * assertions. There is no `embed`-specific layout branch anywhere — every
 * responsive rule is already a plain `@media` query against the rendered
 * document's own viewport, which is exactly the iframe's viewport once
 * embedded. See that page's own doc comment and
 * `apps/tourist-web/next.config.ts` (the `frame-ancestors` header that
 * actually permits framing).
 */
export interface PublicMapShellProps {
  readonly mapName: string;
  readonly children: ReactNode;
  /** checkpoint 1B.16 §4 — resolved tenant branding custom properties (`--brand-primary` etc.), spread onto the map body so all floating chrome inherits them. */
  readonly brandingStyle?: CSSProperties;
  /** EMBEDDABLE PUBLIC MAP FOUNDATION checkpoint — `true` when the page was requested with `?embed=1`. Only stamps an inert `data-embed="1"` attribute; never forks markup. */
  readonly isEmbed?: boolean;
}

export function PublicMapShell({ mapName, children, brandingStyle, isEmbed = false }: PublicMapShellProps) {
  return (
    <div className="tourist-map-shell" data-testid="tourist-map-shell" data-embed={isEmbed ? '1' : undefined}>
      <main className="tourist-map-body" aria-label={`Map of ${mapName}`} style={brandingStyle}>
        {children}
      </main>
    </div>
  );
}
