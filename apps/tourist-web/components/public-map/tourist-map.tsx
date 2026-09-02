/// <reference types="google.maps" />
'use client';

import { importLibrary } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapThemeToGoogleMapsStyles } from 'map-theme-adapter';
import { resolveLocalizedText, type CategoryIcon, type PublicContentLanguage, type PublishedPoi } from 'shared-types';
import type { PublicMapSnapshotParsed } from 'validation';
import { ensureGoogleMapsApiConfigured } from '@/lib/public-map/google-maps-loader';
import { computeBoundsForPois } from '@/lib/public-map/map-camera-utils';
import { buildMarkerIcon, resolveMarkerVisualConfig } from '@/lib/public-map/marker-style-adapter';
import { myLocationErrorMessage, requestMyLocation, type MyLocationFailureReason } from '@/lib/public-map/my-location';
import { createPoiMarkerLayer, type PoiMarkerLayer } from '@/lib/public-map/poi-marker-layer';
import { filterPoisByCategory } from '@/lib/public-map/public-poi-filter';
import { PageOverlay } from './page-overlay';
import { PoiDetailCard } from './poi-detail-card';
import { PublicBottomMenu } from './public-bottom-menu';
import { PublicSearch } from './public-search';

/**
 * The public tourist map — checkpoint 1B.9 §4/§6/§8/§10, extended by
 * checkpoint 1B.10 into the first genuinely interactive public experience
 * (POI markers, category filtering, the published Menu Builder navigation,
 * local search, My Location, and the selected-POI detail card).
 *
 * Still renders EXCLUSIVELY from the already-fetched, already-validated
 * `snapshot` prop its server-component parent passes down (1B.9's own
 * architecture, UNCHANGED by this checkpoint — §1 of 1B.10's spec: "Do not
 * make TouristMap independently re-fetch the snapshot"). Every new feature
 * here — markers, filter, search, menu — reads only `snapshot.pois`/
 * `snapshot.categories`/`snapshot.menu`, never a second network call.
 *
 * Interaction state (selected category, selected POI, search-overlay open,
 * My Location result) is deliberately ALL client-side component state —
 * §6: "filter state is client-side only for this checkpoint... no Firestore
 * write... no authentication" — nothing here is persisted anywhere, and a
 * fresh page load always starts from the full, unfiltered snapshot.
 *
 * E2E repair round doc comment (checkpoint 1B.9, unchanged by this
 * checkpoint) explains why the diagnostics block and the accessible canvas
 * container render unconditionally, independent of Google Maps SDK success
 * — this checkpoint leans on that same posture for its own new interactive
 * elements: `PublicBottomMenu`/`PublicSearch`/`PoiDetailCard` are all plain
 * React/DOM, entirely independent of whether a live `google.maps.Map` ever
 * loads, which is what makes every one of 1B.10's E2E scenarios provable in
 * this project's hermetic no-key environment (see
 * apps/admin-web/e2e/public-tourist-map-interaction.spec.ts's own header
 * comment) — only the actual POI *markers* (`poi-marker-layer.ts`) require a
 * live SDK, and that file is never exercised by this project's E2E for the
 * same reason `google-maps-preview.tsx`'s live path never is (see
 * `apps/admin-web/e2e/map-preview.spec.ts`'s own doc comment).
 */

const DEFAULT_CENTER = { lat: 35.6812, lng: 139.7671 }; // Tokyo Station — an arbitrary, harmless default viewport, matching admin-web's own.
const DEFAULT_ZOOM = 5;
const USER_LOCATION_ZOOM = 15;

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
type MyLocationState = { readonly status: 'idle' } | { readonly status: 'success' } | { readonly status: 'error'; readonly reason: MyLocationFailureReason };

export interface TouristMapProps {
  readonly snapshot: PublicMapSnapshotParsed;
  /** checkpoint 1B.17B §12/§14-§17 — the tourist's currently-selected public content language, owned by `TouristMapPageClient` (the shared parent of this component and the `LanguageSelector`). Every piece of translatable content below is resolved against this on every render — never against `snapshot.defaultLanguage` directly, and never by mutating `snapshot` itself. */
  readonly language: PublicContentLanguage;
}

export function TouristMap({ snapshot, language }: TouristMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | undefined>(undefined);
  const markerLayerRef = useRef<PoiMarkerLayer | undefined>(undefined);
  const userLocationMarkerRef = useRef<google.maps.Marker | undefined>(undefined);
  const hasUserChangedCategoryRef = useRef(false);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [myLocation, setMyLocation] = useState<MyLocationState>({ status: 'idle' });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const { mapProvider, area, theme } = snapshot.map;
  const { pois, categories, menu, pages, defaultLanguage } = snapshot;
  const isDiagnosticsMode = process.env.NODE_ENV !== 'production';
  const canLoadLiveMap = Boolean(apiKey) && mapProvider.provider === 'GOOGLE_MAPS';

  // checkpoint 1B.17B §14-§17 — the ONE place this component resolves
  // translatable content, via the shared `resolveLocalizedText()` fallback
  // (requested → map default → legacy scalar → deterministic available →
  // `''`, shared-types/src/language.ts) — never re-implemented ad hoc, and
  // never mutating `snapshot` itself: each `useMemo` derives a fresh,
  // display-only projection, recomputed only when `language` (or the source
  // data) actually changes. Every downstream consumer below (markers,
  // search, the detail card, the Page overlay, the bottom menu) reads ONLY
  // these localized projections, never `snapshot.categories`/`.pois`/`.pages`/
  // `.menu` directly — this is also what makes search operate on the
  // DISPLAYED localized text (§17), not just the legacy scalar.
  const localizedCategories = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        name: resolveLocalizedText({
          requestedLanguage: language,
          defaultLanguage,
          translations: category.translations?.name,
          legacyValue: category.name,
        }),
      })),
    [categories, language, defaultLanguage],
  );

  const localizedPois = useMemo(
    () =>
      pois.map((poi) => ({
        ...poi,
        name: resolveLocalizedText({
          requestedLanguage: language,
          defaultLanguage,
          translations: poi.translations?.name,
          legacyValue: poi.name,
        }),
        description:
          resolveLocalizedText({
            requestedLanguage: language,
            defaultLanguage,
            translations: poi.translations?.description,
            legacyValue: poi.description,
          }) || undefined,
      })),
    [pois, language, defaultLanguage],
  );

  const localizedPages = useMemo(
    () =>
      pages.map((page) => ({
        ...page,
        title: resolveLocalizedText({
          requestedLanguage: language,
          defaultLanguage,
          translations: page.translations?.title,
          legacyValue: page.title,
        }),
        content: resolveLocalizedText({
          requestedLanguage: language,
          defaultLanguage,
          translations: page.translations?.content,
          legacyValue: page.content,
        }),
      })),
    [pages, language, defaultLanguage],
  );

  const localizedMenu = useMemo(
    () =>
      menu.map((item) => ({
        ...item,
        label: resolveLocalizedText({
          requestedLanguage: language,
          defaultLanguage,
          translations: item.translations?.label,
          legacyValue: item.label,
        }),
      })),
    [menu, language, defaultLanguage],
  );

  const categoryById = useMemo(
    () => new Map(localizedCategories.map((category) => [category.categoryId, category] as const)),
    [localizedCategories],
  );
  const categoryIconById = useMemo<ReadonlyMap<string, CategoryIcon>>(
    () => new Map(localizedCategories.map((category) => [category.categoryId, category.icon] as const)),
    [localizedCategories],
  );
  const visiblePois = useMemo(() => filterPoisByCategory(localizedPois, selectedCategoryId), [localizedPois, selectedCategoryId]);
  const selectedPoi: PublishedPoi | undefined = selectedPoiId ? visiblePois.find((poi) => poi.poiId === selectedPoiId) : undefined;
  // checkpoint 1B.11 §12: resolved from the already-loaded, already-localized
  // `localizedPages` — never an independent fetch when a PAGE menu item is
  // clicked.
  const selectedPage = selectedPageId ? localizedPages.find((page) => page.pageId === selectedPageId) : undefined;

  // §6: "If the currently selected POI is hidden by a category change: close
  // the selected POI detail rather than leaving stale content visible."
  const handleSelectCategory = useCallback(
    (categoryId: string | null) => {
      hasUserChangedCategoryRef.current = true;
      setSelectedCategoryId(categoryId);
      setSelectedPoiId((current) => {
        if (current === null) {
          return current;
        }
        const stillVisible = pois.some((poi) => poi.poiId === current && (categoryId === null || poi.categoryId === categoryId));
        return stillVisible ? current : null;
      });
    },
    [pois],
  );

  const handleSelectPoi = useCallback((poiId: string) => {
    setSelectedPoiId(poiId);
    setSearchOpen(false);
    // checkpoint 1B.11 §13: a Page overlay and a POI detail card occupy the
    // same visual slot — selecting a POI closes any open Page rather than
    // stacking two overlays. Never touches `selectedCategoryId`/map camera.
    setSelectedPageId(null);
  }, []);

  const handleSelectSearchResult = useCallback(
    (poi: PublishedPoi) => {
      // A search result may belong to a category currently filtered out —
      // selecting it is an explicit intent to see THAT place, so the filter
      // resets to "All" rather than silently failing to show the card.
      setSelectedCategoryId(null);
      handleSelectPoi(poi.poiId);
    },
    [handleSelectPoi],
  );

  const handleCloseDetail = useCallback(() => setSelectedPoiId(null), []);
  const handleOpenSearch = useCallback(() => setSearchOpen(true), []);
  const handleCloseSearch = useCallback(() => setSearchOpen(false), []);

  // checkpoint 1B.11 §12/§13: opens the Page as an information overlay,
  // reading only the already-loaded `snapshot.pages` (resolved above as
  // `selectedPage`) — no network request. Deliberately does NOT touch
  // `selectedCategoryId` or the map camera (§13: "opening a Page must not
  // destroy map state unnecessarily... the map position doesn't reset"), and
  // closes any open POI detail/search for the same single-overlay-slot
  // reason `handleSelectPoi` closes an open Page.
  const handleOpenPage = useCallback((pageId: string) => {
    setSelectedPageId(pageId);
    setSelectedPoiId(null);
    setSearchOpen(false);
  }, []);
  const handleClosePage = useCallback(() => setSelectedPageId(null), []);

  const handleRequestMyLocation = useCallback(() => {
    requestMyLocation({
      onSuccess: (position) => {
        setMyLocation({ status: 'success' });
        if (mapRef.current) {
          const point = { lat: position.latitude, lng: position.longitude };
          mapRef.current.panTo(point);
          mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? USER_LOCATION_ZOOM, USER_LOCATION_ZOOM));

          const spec = buildMarkerIcon({ shape: 'dot', pixelSize: 18, color: '#1a73e8', glyph: '', selected: true });
          if (!userLocationMarkerRef.current) {
            userLocationMarkerRef.current = new google.maps.Marker({
              map: mapRef.current,
              position: point,
              title: 'Your location',
              zIndex: 2000,
              icon: { url: spec.url, scaledSize: new google.maps.Size(spec.width, spec.height), anchor: new google.maps.Point(spec.anchorX, spec.anchorY) },
            });
          } else {
            userLocationMarkerRef.current.setPosition(point);
          }
        }
      },
      onError: (reason) => setMyLocation({ status: 'error', reason }),
    });
  }, []);

  // The Google Maps SDK load — unchanged from checkpoint 1B.9 apart from
  // also creating the POI marker layer once the map exists.
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
        });

        if (area.type === 'BOUNDED' && area.bounds) {
          map.fitBounds({
            north: area.bounds.north,
            south: area.bounds.south,
            east: area.bounds.east,
            west: area.bounds.west,
          });
        }

        mapRef.current = map;
        markerLayerRef.current = createPoiMarkerLayer(map);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      markerLayerRef.current?.destroy();
      markerLayerRef.current = undefined;
      mapRef.current = undefined;
      userLocationMarkerRef.current = undefined;
    };
    // Mount-only, matching 1B.9's own established convention (`snapshot`
    // never changes after first render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Re-sync markers whenever the visible POI set or selection changes —
  // independent of the mount effect above so a category-filter/selection
  // change never re-creates the whole `google.maps.Map` instance.
  useEffect(() => {
    if (!markerLayerRef.current) {
      return;
    }
    const visual = resolveMarkerVisualConfig(theme.markerStyle);
    markerLayerRef.current.sync({
      pois: visiblePois,
      categoryIconById,
      shape: visual.shape,
      pixelSize: visual.pixelSize,
      selectedPoiId,
      onSelect: handleSelectPoi,
    });
  }, [visiblePois, categoryIconById, selectedPoiId, theme.markerStyle, handleSelectPoi, status]);

  // §12: fit the camera to the filtered set on an EXPLICIT category change
  // only — never on initial mount, so the configured UNBOUNDED/BOUNDED
  // starting camera (1B.9 §8) is never immediately overridden.
  useEffect(() => {
    if (!hasUserChangedCategoryRef.current || !mapRef.current) {
      return;
    }
    const bounds = computeBoundsForPois(visiblePois);
    if (bounds) {
      mapRef.current.fitBounds(bounds);
      return;
    }
    // `noUncheckedIndexedAccess` types `visiblePois[0]` as possibly
    // `undefined` even guarded by `.length === 1` above it — narrow into a
    // local and guard it explicitly rather than asserting non-null; this
    // branch is unreachable in practice whenever the length check passes.
    const onlyVisiblePoi = visiblePois.length === 1 ? visiblePois[0] : undefined;
    if (onlyVisiblePoi) {
      mapRef.current.panTo({ lat: onlyVisiblePoi.location.latitude, lng: onlyVisiblePoi.location.longitude });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId]);

  // §12: pan to a selected POI without destroying the configured experience.
  useEffect(() => {
    if (!selectedPoi || !mapRef.current) {
      return;
    }
    mapRef.current.panTo({ lat: selectedPoi.location.latitude, lng: selectedPoi.location.longitude });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoiId]);

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
        <p data-testid="tourist-map-loading" className="tourist-map-message-text" role="status">
          Loading map…
        </p>
      ) : null}
      <div
        ref={containerRef}
        data-testid="tourist-map"
        role="img"
        aria-label={`Map of ${snapshot.map.name}`}
        className="tourist-map-canvas"
      />
      {unavailableMessage ? <TouristMapUnavailable message={unavailableMessage} /> : null}
      {visiblePois.length === 0 ? (
        // §8 — a subtle empty-state, not an application error, whenever the
        // current filter (or the published content itself) leaves nothing
        // to show.
        <p data-testid="public-poi-empty-state" className="public-poi-empty-state" role="status">
          {pois.length === 0 ? 'No places have been published yet.' : 'No places in this category yet.'}
        </p>
      ) : null}
      {selectedPoi ? <PoiDetailCard poi={selectedPoi} category={categoryById.get(selectedPoi.categoryId)} onClose={handleCloseDetail} /> : null}
      {selectedPage ? <PageOverlay page={selectedPage} onClose={handleClosePage} /> : null}
      {myLocation.status === 'success' ? (
        <p data-testid="my-location-status" className="my-location-banner" role="status">
          Showing your current location.
        </p>
      ) : null}
      {myLocation.status === 'error' ? (
        <p data-testid="my-location-message" className="my-location-banner" role="status">
          {myLocationErrorMessage(myLocation.reason)}
        </p>
      ) : null}
      {searchOpen ? (
        <PublicSearch pois={localizedPois} categories={localizedCategories} onSelect={handleSelectSearchResult} onClose={handleCloseSearch} />
      ) : null}
      <PublicBottomMenu
        menu={localizedMenu}
        selectedCategoryId={selectedCategoryId}
        onSelectCategory={handleSelectCategory}
        onOpenSearch={handleOpenSearch}
        onRequestMyLocation={handleRequestMyLocation}
        onOpenPage={handleOpenPage}
      />
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
          {/* Checkpoint 1B.10 — a deterministic, dev-mode-only DOM
              representation of the currently visible POI set, so E2E can
              prove filtering/publication-safety without ever depending on a
              live Google Maps marker (this project's hermetic E2E never has
              a real key — see this file's own top doc comment). Names are
              sorted alphabetically (not published order) purely so an
              assertion never depends on incidental Firestore/array order.
              `poiId`s are not sensitive — they already appear verbatim in
              the public snapshot every visitor's browser receives. */}
          <dt>poiCount</dt>
          <dd data-testid="tourist-map-diag-poi-count">{visiblePois.length}</dd>
          <dt>poiNames</dt>
          <dd data-testid="tourist-map-diag-poi-names">
            {[...visiblePois].map((poi) => poi.name).sort().join(' | ') || 'none'}
          </dd>
          <dt>selectedCategory</dt>
          <dd data-testid="tourist-map-diag-selected-category">{selectedCategoryId ?? 'ALL'}</dd>
          <dt>selectedPoi</dt>
          <dd data-testid="tourist-map-diag-selected-poi">{selectedPoiId ?? 'none'}</dd>
          <dt>selectedPage</dt>
          <dd data-testid="tourist-map-diag-selected-page">{selectedPageId ?? 'none'}</dd>
          <dt>userLocation</dt>
          <dd data-testid="tourist-map-diag-user-location">{myLocation.status === 'success' ? 'set' : 'unset'}</dd>
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
