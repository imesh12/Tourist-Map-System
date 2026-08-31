/// <reference types="google.maps" />
'use client';

import { importLibrary } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import { mapThemeToGoogleMapsStyles } from 'map-theme-adapter';
import type { PublicMapSnapshotParsed } from 'validation';
import { ensureGoogleMapsApiConfigured } from '@/lib/public-map/google-maps-loader';

/**
 * The public tourist map — checkpoint 1B.9 §4/§6/§8/§10.
 *
 * A CLIENT component (Google Maps is a browser-only SDK) that renders
 * EXCLUSIVELY from the already-fetched, already-validated publication
 * snapshot its server-component parent (app/maps/[mapId]/page.tsx) passes
 * down — this component never fetches anything itself, never talks to
 * Firestore, and never talks to admin-web's API directly (§10: "Client
 * component: loads Google Maps JS, renders map, applies theme"). This keeps
 * the server/client boundary clean: all data-fetching and 404/unpublished/
 * error handling happens once, server-side, in the parent.
 *
 * Reuses `mapThemeToGoogleMapsStyles` from the shared `map-theme-adapter`
 * package — the exact same theme translation `admin-web`'s live preview
 * uses (checkpoint 1B.7) — so a Client Admin's chosen `MapTheme` renders
 * identically here as it did in their own live preview. Never duplicates
 * that logic.
 *
 * Geography (§8): `area.type === 'BOUNDED'` with real `bounds` initializes
 * the map via `fitBounds()` rather than a fixed center/zoom — the
 * checkpoint's own guidance ("acceptable to fit/initialize to bounds rather
 * than enforcing hard movement constraints") is followed literally: a
 * visitor can still freely pan/zoom away from the initial view afterward,
 * nothing here locks the camera. Every other case (UNBOUNDED, or a BOUNDED
 * area whose `bounds` is for some reason absent) falls back to
 * `center`/`defaultZoom` from the snapshot, with the same harmless default
 * viewport `google-maps-preview.tsx` uses when even those are absent.
 *
 * Marker style (§9): this checkpoint does not render POI markers yet, so
 * `snapshot.map.theme.markerStyle` is not consumed by this component at
 * all — see `lib/public-map/marker-style-adapter.ts` for the foundation a
 * future POI layer will use, deliberately not wired in here.
 *
 * Checkpoint 1B.9 §18 — a small, deterministic test-diagnostics block
 * (`data-testid="tourist-map-diagnostics"`) is rendered ONLY when
 * `NODE_ENV !== 'production'` (true for `next dev`, the mode this app's own
 * E2E suite runs under — see apps/admin-web/e2e/constants.ts's
 * `E2E_TOURIST_APP_ENV` — and false for a real `next build`/`next start`
 * deployment), so it never reaches production tourist users but stays
 * assertable in tests without inspecting live Google Maps SDK internals —
 * the same reasoning `map-preview-info.tsx`'s "no real key in E2E" doc
 * comment gives for admin-web's own equivalent row.
 *
 * E2E repair round (checkpoint 1B.9, render-decoupling repair) — the
 * diagnostics block above, and the accessible `tourist-map` canvas
 * container below, are rendered UNCONDITIONALLY once this component mounts
 * — never gated behind `apiKey` being present or the Google Maps SDK
 * actually loading successfully. Both are derived purely from the
 * already-validated publication `snapshot` this component receives as a
 * prop; neither has ever depended on a live `google.maps.Map` existing.
 * Gating them behind SDK success was an unintended coupling introduced when
 * this component was first built, and it directly contradicted this
 * project's own established, deliberate convention — see
 * `apps/admin-web/e2e/map-preview.spec.ts` and `map-theme.spec.ts`'s own
 * doc comments — that NO real, billed Google Maps API key is EVER
 * configured for hermetic/CI E2E, anywhere in this codebase; the live SDK
 * path is exercised manually only. Because `E2E_TOURIST_APP_ENV` correctly
 * follows that same convention (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: ''`, see
 * `apps/admin-web/e2e/constants.ts`), the old apiKey-gated structure meant
 * the diagnostics/canvas testids could never appear under E2E at all — not
 * a flake, a structural impossibility. The fix does not add a fake key or
 * any Google Maps network mock (which would be new, inconsistent
 * infrastructure); it simply stops requiring Maps SDK success for content
 * that never needed it. The `.tourist-map-canvas` / `.tourist-map-diagnostics`
 * / `.tourist-map-unavailable` rules in `app/globals.css` already use
 * `position: absolute; inset: 0` specifically so canvas + diagnostics +
 * "unavailable" message can coexist as overlays — this was already the
 * intended layered architecture, just not fully wired up in this file.
 * `TouristMapUnavailable` still renders (still real, still tourist-facing,
 * still not faking success) whenever the live map genuinely can't load —
 * apiKey missing, an unsupported provider, or a client-side load error —
 * it now sits ALONGSIDE the (SDK-empty but accessibly-labeled) canvas
 * region rather than replacing the whole component tree.
 */

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station — an arbitrary, harmless default viewport, matching admin-web's own.
const DEFAULT_ZOOM = 5;

function mapStyleToMapTypeId(style: PublicMapSnapshotParsed['map']['mapProvider']['style']): google.maps.MapTypeId {
  switch (style) {
    case 'SATELLITE':
      return google.maps.MapTypeId.SATELLITE;
    case 'HYBRID':
      return google.maps.MapTypeId.HYBRID;
    case 'TERRAIN':
      return google.maps.MapTypeId.TERRAIN;
    case 'ROAD':
    case 'CUSTOM':
    default:
      return google.maps.MapTypeId.ROADMAP;
  }
}

type LoadStatus = 'loading' | 'ready' | 'error';

export interface TouristMapProps {
  readonly snapshot: PublicMapSnapshotParsed;
}

export function TouristMap({ snapshot }: TouristMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | undefined>(undefined);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { mapProvider, area, theme } = snapshot.map;
  const isDiagnosticsMode = process.env.NODE_ENV !== 'production';
  // Whether the live Google Maps SDK load is even attempted — see this
  // component's top doc comment ("E2E repair round") for why the canvas
  // container and diagnostics below no longer wait on this being true.
  const canLoadLiveMap = Boolean(apiKey) && mapProvider.provider === 'GOOGLE_MAPS';

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapProvider.provider !== 'GOOGLE_MAPS') {
      return;
    }
    let cancelled = false;
    setStatus('loading');
    ensureGoogleMapsApiConfigured(apiKey);

    importLibrary('maps')
      .then(({ Map }) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        const map = new Map(containerRef.current, {
          center: area.center ?? DEFAULT_CENTER,
          zoom: area.defaultZoom ?? DEFAULT_ZOOM,
          mapTypeId: mapStyleToMapTypeId(mapProvider.style),
          styles: [...mapThemeToGoogleMapsStyles(theme)],
          // A public tourist visitor is never editing anything — the
          // default "Keep exploring"/legal attribution/zoom controls stay
          // exactly as Google provides them (§4 of google-theme-adapter's
          // own doc comment: a `styles` array cannot and does not attempt
          // to touch that required UI).
        });

        // §8: initialize to bounds when the map is BOUNDED and real bounds
        // exist, rather than a fixed center/zoom — this only sets the
        // INITIAL viewport; nothing here restricts later panning/zooming.
        if (area.type === 'BOUNDED' && area.bounds) {
          map.fitBounds({
            north: area.bounds.north,
            south: area.bounds.south,
            east: area.bounds.east,
            west: area.bounds.west,
          });
        }

        mapRef.current = map;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
    // Mount-only, matching google-maps-preview.tsx's own established
    // convention — this component's `snapshot` prop never changes after
    // first render (a fresh page load fetches a fresh snapshot instead), so
    // there is no "sync on prop change" concern to replicate here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // What (if anything) explains why no live map is showing — still a real,
  // tourist-friendly message (never faking success when configuration is
  // genuinely missing), just no longer the ONLY thing this component
  // renders. See the top doc comment's "E2E repair round" paragraph.
  const unavailableMessage = !apiKey
    ? 'Map preview is unavailable in this environment.'
    : mapProvider.provider !== 'GOOGLE_MAPS'
      ? `Live preview for ${mapProvider.provider} is not yet implemented.`
      : status === 'error'
        ? "We couldn't load this map right now."
        : null;

  return (
    <>
      {canLoadLiveMap && status === 'loading' ? (
        // The client-side Google Maps SDK load phase — rendered ALONGSIDE
        // (not instead of) the canvas div below: the div must stay mounted
        // the whole time so `new Map(containerRef.current, ...)` has a real
        // node to attach to once `importLibrary('maps')` resolves. §13's
        // "Loading: 'Loading map…'" wording applies here, so a visitor
        // never sees a silent blank canvas while the SDK/script loads.
        // Gated on `canLoadLiveMap` (not just `status`) because `status`
        // never leaves its initial 'loading' value when no live load is
        // ever attempted (missing key / unsupported provider) — this line
        // would otherwise show "Loading map…" forever in exactly the cases
        // `unavailableMessage` below already explains permanently.
        <p data-testid="tourist-map-loading" className="tourist-map-message-text" role="status">
          Loading map…
        </p>
      ) : null}
      {/* Always mounted — the accessible map region for this map, regardless
          of whether a live Google Maps object ever attaches inside it. See
          the top doc comment's "E2E repair round" paragraph for why this no
          longer waits on SDK/key success. */}
      <div
        ref={containerRef}
        data-testid="tourist-map"
        role="img"
        aria-label={`Map of ${snapshot.map.name}`}
        className="tourist-map-canvas"
      />
      {unavailableMessage ? <TouristMapUnavailable message={unavailableMessage} /> : null}
      {isDiagnosticsMode ? (
        <dl data-testid="tourist-map-diagnostics" className="tourist-map-diagnostics" aria-hidden="true">
          <dt>preset</dt>
          <dd data-testid="tourist-map-diag-preset">{theme.preset}</dd>
          <dt>areaType</dt>
          <dd data-testid="tourist-map-diag-area-type">{area.type}</dd>
          <dt>center</dt>
          <dd data-testid="tourist-map-diag-center">{area.center ? `${area.center.lat},${area.center.lng}` : 'unset'}</dd>
          <dt>zoom</dt>
          <dd data-testid="tourist-map-diag-zoom">{area.defaultZoom ?? 'unset'}</dd>
          <dt>bounds</dt>
          <dd data-testid="tourist-map-diag-bounds">
            {area.bounds ? `${area.bounds.north},${area.bounds.south},${area.bounds.east},${area.bounds.west}` : 'unset'}
          </dd>
          <dt>markerStyle</dt>
          <dd data-testid="tourist-map-diag-marker-style">
            {theme.markerStyle.style},{theme.markerStyle.size}
          </dd>
        </dl>
      ) : null}
    </>
  );
}

/**
 * The shared "map can't render right now" fallback — deliberately a small
 * local component (not `MapPreviewSummary` imported across apps): the two
 * apps' fallback needs genuinely differ (admin-web's shows live form
 * values; this one shows nothing but a tourist-friendly sentence, §13), so
 * sharing would mean threading admin-only concerns through a tourist-facing
 * component for no real reuse benefit.
 */
function TouristMapUnavailable({ message }: { readonly message: string }) {
  return (
    <div data-testid="tourist-map-unavailable" className="tourist-map-unavailable" role="status">
      <p>{message}</p>
    </div>
  );
}
