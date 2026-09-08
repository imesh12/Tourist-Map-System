'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import type { PublicContentLanguage } from 'shared-types';
import type { PublicMapSnapshotParsed } from 'validation';
import { resolveBrandingVars } from '@/lib/public-map/branding';
import type { PhotoPinTemplate } from '@/lib/public-map/marker-style-adapter';
import { PublicMapShell } from './public-map-shell';
import { TouristMap } from './tourist-map';

/**
 * Checkpoint 1B.17B §12 — the ONE client component that owns the tourist
 * public-content language STATE, shared by both the `LanguageSelector` (in
 * the branding header) and `TouristMap` (the map body) — they are siblings
 * under this single component rather than independent subtrees, which is
 * what lets a language change update BOTH at once with no context/URL-sync
 * plumbing between them.
 *
 * `initialLanguage` is resolved SERVER-SIDE by `app/maps/[mapId]/page.tsx`
 * (via `resolveInitialLanguage()`, ./lib/public-map/language-selection.ts,
 * using the request's own `?lang=` query param and `Accept-Language`
 * header) — so the very first paint, on both server and client, already
 * reflects §12's full resolution order with no post-hydration flash.
 *
 * On change (§12): `language` state updates immediately (re-rendering
 * `TouristMap` with the new resolved text — no re-fetch, `snapshot` itself
 * never changes), and the URL's `?lang=` query param is updated via the
 * plain browser History API (`window.history.replaceState`) — deliberately
 * NOT `next/navigation`'s router, which would re-run this route's Server
 * Component (`page.tsx`) and re-fetch the published snapshot on every
 * language click for no reason (the snapshot itself is language-agnostic;
 * only which of its already-loaded translations gets displayed changes).
 * `replaceState` never adds a browser history entry (§12 doesn't ask for
 * back-button-per-language-switch) and never triggers a full page
 * navigation or reload — the map, its camera, and every other piece of
 * client state are completely undisturbed.
 */
export interface TouristMapPageClientProps {
  readonly snapshot: PublicMapSnapshotParsed;
  readonly initialLanguage: PublicContentLanguage;
  /** EMBEDDABLE PUBLIC MAP FOUNDATION checkpoint — `?embed=1` presence, resolved server-side by `app/maps/[mapId]/page.tsx`. Threaded straight through to `PublicMapShell` (which stamps an inert `data-embed="1"`); this component's behavior is otherwise identical whether embedded or not. */
  readonly isEmbed?: boolean;
  /**
   * ADMIN PHOTO MARKER STYLE checkpoint — the resolved `PhotoPinTemplate`
   * for this map's photo-eligible POI markers, already fully resolved
   * server-side by `app/maps/[mapId]/page.tsx` via
   * `resolvePublicPhotoPinTemplate()` (which of the map's currently
   * PUBLISHED `photoMarkerStyle`, or the development-only `?photoMarker=`
   * override, wins — see that function's own doc comment). Forwarded
   * straight through to `TouristMap` — this component adds no logic of its
   * own for it.
   */
  readonly photoPinTemplate?: PhotoPinTemplate;
}

export function TouristMapPageClient({ snapshot, initialLanguage, isEmbed = false, photoPinTemplate }: TouristMapPageClientProps) {
  const [language, setLanguage] = useState<PublicContentLanguage>(initialLanguage);

  const handleLanguageChange = useCallback((next: PublicContentLanguage) => {
    setLanguage(next);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('lang', next);
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, []);

  // checkpoint 1B.16 §4 — the immutable publication snapshot's own branding
  // (never the live draft), turned into `--brand-*` custom properties once
  // and inherited by every floating overlay via the shell's map body.
  const brandingStyle = useMemo(
    () => ({ ...resolveBrandingVars(snapshot.map.branding) }) as CSSProperties,
    [snapshot.map.branding],
  );

  return (
    <PublicMapShell mapName={snapshot.map.name} brandingStyle={brandingStyle} isEmbed={isEmbed}>
      <TouristMap snapshot={snapshot} language={language} onLanguageChange={handleLanguageChange} photoPinTemplate={photoPinTemplate} />
    </PublicMapShell>
  );
}
