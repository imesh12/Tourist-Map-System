'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CategoryParsed, ExternalPoiCandidateParsed, PoiParsed } from 'validation';
import { CATEGORY_ICON_META } from '../categories/category-icons';

/**
 * The "Discover Places" drawer — checkpoint 1B.4 §"discovery UI mockup".
 * Same drawer-overlay visual pattern `PoiFormDrawer`/`CategoryFormDrawer`
 * already establish, but its own dialog (never nested inside the create/edit
 * POI drawer) — search is explicit and user-triggered only (a "Search
 * nearby" button, never an auto-search on open/category-change), and
 * importing one result never auto-imports any other.
 *
 * Talks to `POST /api/map/pois/discover` and `POST /api/map/pois/import`
 * directly — it does not receive the fake/real provider distinction as a
 * prop; that seam lives entirely server-side (`lib/pois/provider-registry.ts`),
 * exactly like the existing POI drawer never knows whether the Google Maps
 * JS API is really configured, only whether a location picker renders.
 */

const RADIUS_OPTIONS_METERS = [500, 1000, 2000, 5000] as const;
const DEFAULT_RADIUS_METERS = 1000;

interface DiscoverPlacesDrawerProps {
  /** Only categories `categorySupportsGooglePlacesDiscovery()` already approved — see `pois-manager.tsx`. Never the full tenant category list. */
  readonly eligibleCategories: readonly CategoryParsed[];
  /** Every currently-loaded POI — used only to pre-mark already-imported places (by `providerPlaceId`) so this drawer never invites a doomed duplicate-import attempt; the server's own duplicate check remains authoritative regardless. */
  readonly existingPois: readonly PoiParsed[];
  readonly onClose: () => void;
  /** Called after a successful import so the caller can refetch `GET /api/map/pois` — mirrors every other mutation in this manager. */
  readonly onImported: () => Promise<void>;
}

async function parseSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export function DiscoverPlacesDrawer({ eligibleCategories, existingPois, onClose, onImported }: DiscoverPlacesDrawerProps) {
  const [categoryId, setCategoryId] = useState(eligibleCategories[0]?.categoryId ?? '');
  const [radiusMeters, setRadiusMeters] = useState<number>(DEFAULT_RADIUS_METERS);
  const [results, setResults] = useState<readonly ExternalPoiCandidateParsed[] | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>(undefined);
  const [importingPlaceId, setImportingPlaceId] = useState<string | undefined>(undefined);
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const [justImportedPlaceIds, setJustImportedPlaceIds] = useState<ReadonlySet<string>>(new Set());

  const alreadyImportedPlaceIds = useMemo(
    () => new Set(existingPois.filter((poi) => poi.sourceType === 'GOOGLE_PLACES' && poi.providerPlaceId).map((poi) => poi.providerPlaceId as string)),
    [existingPois],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleSearch(): Promise<void> {
    if (!categoryId) return;
    setIsSearching(true);
    setSearchError(undefined);
    setResults(undefined);
    try {
      const response = await fetch('/api/map/pois/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, radiusMeters }),
      });
      if (!response.ok) {
        setSearchError(await parseSafeErrorMessage(response, 'Could not search nearby places. Please try again.'));
        return;
      }
      const body = (await response.json()) as { candidates: ExternalPoiCandidateParsed[] };
      setResults(body.candidates);
    } catch {
      setSearchError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleImport(candidate: ExternalPoiCandidateParsed): Promise<void> {
    setImportError(undefined);
    setImportingPlaceId(candidate.providerPlaceId);
    try {
      const response = await fetch('/api/map/pois/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, provider: candidate.provider, providerPlaceId: candidate.providerPlaceId }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          // Already imported (a race with another tab, or a stale result
          // list) — reflect it as "Imported" rather than a scary error.
          setJustImportedPlaceIds((prev) => new Set(prev).add(candidate.providerPlaceId));
          return;
        }
        setImportError(await parseSafeErrorMessage(response, 'Could not import this place. Please try again.'));
        return;
      }
      setJustImportedPlaceIds((prev) => new Set(prev).add(candidate.providerPlaceId));
      await onImported();
    } catch {
      setImportError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setImportingPlaceId(undefined);
    }
  }

  const isImported = (providerPlaceId: string): boolean =>
    alreadyImportedPlaceIds.has(providerPlaceId) || justImportedPlaceIds.has(providerPlaceId);

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="discoverPlacesDrawerTitle" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="discoverPlacesDrawerTitle" className="drawer-title">
              Discover Places
            </h2>
            <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="drawer-body">
            {eligibleCategories.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-title">No categories are linked to Google Places yet</div>
                <p>Link a category to the released Restaurant platform category to search nearby places.</p>
                <Link href="/admin/categories" className="btn btn-primary">
                  Go to Categories
                </Link>
              </div>
            ) : (
              <>
                {importError ? (
                  <div className="alert alert-danger" role="alert">
                    {importError}
                  </div>
                ) : null}
                {searchError ? (
                  <div className="alert alert-danger" role="alert">
                    {searchError}
                  </div>
                ) : null}

                <div className="field">
                  <label className="field-label" htmlFor="discoverCategory">
                    Search category
                  </label>
                  <select
                    id="discoverCategory"
                    className="select"
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                    disabled={isSearching}
                  >
                    {eligibleCategories.map((category) => {
                      const iconMeta = CATEGORY_ICON_META[category.icon];
                      return (
                        <option key={category.categoryId} value={category.categoryId}>
                          {iconMeta.emoji} {category.name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="discoverRadius">
                    Radius
                  </label>
                  <select
                    id="discoverRadius"
                    className="select"
                    value={radiusMeters}
                    onChange={(event) => setRadiusMeters(Number(event.target.value))}
                    disabled={isSearching}
                  >
                    {RADIUS_OPTIONS_METERS.map((meters) => (
                      <option key={meters} value={meters}>
                        {meters >= 1000 ? `${meters / 1000} km` : `${meters} m`}
                      </option>
                    ))}
                  </select>
                </div>

                <button type="button" className="btn btn-primary" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? 'Searching…' : 'Search nearby'}
                </button>

                {results ? (
                  results.length === 0 ? (
                    <div className="empty-state" style={{ marginTop: 'var(--space-4)' }}>
                      <p>No places found nearby. Try a larger radius.</p>
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 'var(--space-4) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {results.map((candidate) => {
                        const imported = isImported(candidate.providerPlaceId);
                        const isImportingThis = importingPlaceId === candidate.providerPlaceId;
                        return (
                          <li key={candidate.providerPlaceId} className="card" style={{ padding: 'var(--space-3)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)' }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{candidate.name}</div>
                                {candidate.address ? <div className="field-hint">{candidate.address}</div> : null}
                                {candidate.distanceMeters !== undefined ? (
                                  <div className="field-hint">{Math.round(candidate.distanceMeters)} m away</div>
                                ) : null}
                              </div>
                              {imported ? (
                                <span className="badge badge-success">Imported</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  aria-label={`Import ${candidate.name}`}
                                  disabled={isImportingThis}
                                  onClick={() => handleImport(candidate)}
                                >
                                  {isImportingThis ? 'Importing…' : 'Import'}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </>
            )}
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
