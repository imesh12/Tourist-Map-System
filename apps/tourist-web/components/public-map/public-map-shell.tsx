import type { ReactNode } from 'react';

/**
 * The near-full-viewport shell every public map page renders inside —
 * checkpoint 1B.9 §6. A deliberately thin layout component: a small,
 * subtle branding overlay (map name only — see §7 for exactly what is and
 * is not safe to show here) plus one large body region the map itself
 * fills. No category filter, search, or bottom sheet/menu chrome — this
 * checkpoint is explicitly the FOUNDATION only (§6/§20); the body region's
 * `.tourist-map-body` class is what a later checkpoint's floating bottom
 * menu/POI cards are expected to layer on top of, without this shell
 * itself needing to change shape.
 *
 * A plain server-renderable component (no 'use client' — nothing here is
 * interactive), matching §10's "avoid hydration issues" instruction: static
 * markup and CSS only, no client-only state.
 *
 * Accessibility (§15): the branding overlay's map name is a real `<h1>`,
 * not a styled `<div>` — "subtle branding" is a CSS/visual decision (kept
 * small, unobtrusive, per §6.B), not a semantic one; the page's one
 * meaningful heading is not conveyed only visually.
 */
export interface PublicMapShellProps {
  readonly mapName: string;
  readonly children: ReactNode;
  /** checkpoint 1B.17B §12 — an optional slot rendered beside the map name in the branding header; used for the `LanguageSelector`, kept generic (not a hardcoded language-selector prop) so this shell doesn't need to know what it renders. */
  readonly headerEnd?: ReactNode;
}

export function PublicMapShell({ mapName, children, headerEnd }: PublicMapShellProps) {
  return (
    <div className="tourist-map-shell">
      <header className="tourist-map-branding" data-testid="tourist-map-branding">
        <h1 className="tourist-map-branding-name">{mapName}</h1>
        {headerEnd}
      </header>
      <main className="tourist-map-body" aria-label={`Map of ${mapName}`}>
        {children}
      </main>
      {/* §6.F — a minimal, optional attribution shell. Google's own required
          logo/legal control is rendered by the Maps JS SDK itself inside the
          map canvas (see google-theme-adapter.ts's own compliance note) —
          this line is this app's own, separate "what is this" affordance
          for a tourist who lands on the page without context, not a
          duplicate of Google's attribution. */}
      <footer className="tourist-map-attribution" data-testid="tourist-map-attribution">
        Powered by Tourist Map System
      </footer>
    </div>
  );
}
