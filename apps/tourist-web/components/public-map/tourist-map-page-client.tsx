'use client';

import { useCallback, useState } from 'react';
import type { PublicContentLanguage } from 'shared-types';
import type { PublicMapSnapshotParsed } from 'validation';
import { LanguageSelector } from './language-selector';
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
}

export function TouristMapPageClient({ snapshot, initialLanguage }: TouristMapPageClientProps) {
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

  return (
    <PublicMapShell
      mapName={snapshot.map.name}
      headerEnd={
        <LanguageSelector supportedLanguages={snapshot.supportedLanguages} currentLanguage={language} onChange={handleLanguageChange} />
      }
    >
      <TouristMap snapshot={snapshot} language={language} />
    </PublicMapShell>
  );
}
