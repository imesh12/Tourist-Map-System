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
 */
export interface PublicMapShellProps {
  readonly mapName: string;
  readonly children: ReactNode;
  /** checkpoint 1B.16 §4 — resolved tenant branding custom properties (`--brand-primary` etc.), spread onto the map body so all floating chrome inherits them. */
  readonly brandingStyle?: CSSProperties;
}

export function PublicMapShell({ mapName, children, brandingStyle }: PublicMapShellProps) {
  return (
    <div className="tourist-map-shell">
      <main className="tourist-map-body" aria-label={`Map of ${mapName}`} style={brandingStyle}>
        {children}
      </main>
    </div>
  );
}
