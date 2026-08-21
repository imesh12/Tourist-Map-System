'use client';

import { useMemo, useState } from 'react';
import type { MapAreaBounds, MapProviderName } from 'shared-types';
import { poiCreateInputSchema, poiUpdateInputSchema, type CategoryParsed, type PoiParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import type { MapPreviewCenter } from '@/lib/map-preview/types';
import { categorySupportsGooglePlacesDiscovery } from '@/lib/tenant/category-capabilities';
import { CATEGORY_ICON_META } from '../categories/category-icons';
import { DeletePoiDialog } from './delete-poi-dialog';
import { DiscoverPlacesDrawer } from './discover-places-drawer';
import { PoiFormDrawer, type PoiFormValues } from './poi-form-drawer';

/**
 * The `/admin/pois` manager — checkpoint 1B.3, same shape
 * `categories-manager.tsx` established: after every successful
 * create/edit/enable-disable/delete mutation, this re-fetches
 * `GET /api/map/pois` and replaces state with that response — Firestore is
 * the authoritative source, not whatever was just optimistically typed into
 * a form. A full browser reload re-runs the server component instead, which
 * sources the same `loadTenantPois()` helper — both paths agree (§ F/T).
 *
 * Search/category-filter/status-filter (§12) are pure client-side
 * derivations over the already-loaded `pois` state — no new endpoint, no
 * server round trip.
 */

type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED';
type CategoryFilter = 'ALL' | string;
/** checkpoint 1B.4 — mixed-source table support. */
type SourceFilter = 'ALL' | 'MANUAL' | 'GOOGLE_PLACES';

interface PoisManagerProps {
  readonly initialPois: readonly PoiParsed[];
  readonly categories: readonly CategoryParsed[];
  readonly mapProvider: MapProviderName;
  readonly mapCenter?: MapPreviewCenter;
  readonly mapBounds?: MapAreaBounds;
  readonly canEdit: boolean;
}

type DrawerState = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly poi: PoiParsed } | undefined;

// An arbitrary, harmless fallback viewport — used ONLY when this tenant's
// map has no configured `area.center` at all (a fully UNBOUNDED map with no
// initial viewport ever saved in Map Settings). §14 explicitly forbids
// hardcoding this when a real center IS configured — `initialCenter` below
// always prefers `mapCenter` first; this is never used in that case. Same
// value, and the same "arbitrary, harmless default" reasoning, as
// `lib/map-preview/google-maps-preview.tsx`'s own `DEFAULT_CENTER` — kept as
// a second, independent constant (not imported from that module) because
// that one is intentionally private to the map-preview viewer, not part of
// its exported contract.
const FALLBACK_CENTER: MapPreviewCenter = { lat: 35.6812, lng: 139.7671 };

async function parseSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

function emptyFormValues(defaultCategoryId: string): PoiFormValues {
  return { name: '', categoryId: defaultCategoryId, address: '', description: '', latitude: '', longitude: '', status: 'ENABLED' };
}

function poiToFormValues(poi: PoiParsed): PoiFormValues {
  return {
    name: poi.name,
    categoryId: poi.categoryId,
    address: poi.address ?? '',
    description: poi.description ?? '',
    latitude: String(poi.location.latitude),
    longitude: String(poi.location.longitude),
    status: poi.status,
  };
}

export function PoisManager({ initialPois, categories, mapProvider, mapCenter, mapBounds, canEdit }: PoisManagerProps) {
  const [pois, setPois] = useState<readonly PoiParsed[]>(initialPois);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [isRefetching, setIsRefetching] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('ALL');

  const [drawer, setDrawer] = useState<DrawerState>(undefined);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);

  const [busyPoiId, setBusyPoiId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PoiParsed | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryParsed>();
    for (const category of categories) {
      map.set(category.categoryId, category);
    }
    return map;
  }, [categories]);

  const visiblePois = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return pois.filter((poi) => {
      if (categoryFilter !== 'ALL' && poi.categoryId !== categoryFilter) return false;
      if (statusFilter === 'ENABLED' && poi.status !== 'ENABLED') return false;
      if (statusFilter === 'DISABLED' && poi.status !== 'DISABLED') return false;
      if (sourceFilter === 'MANUAL' && poi.sourceType !== 'CLIENT_CUSTOM') return false;
      if (sourceFilter === 'GOOGLE_PLACES' && poi.sourceType !== 'GOOGLE_PLACES') return false;
      if (query) {
        const haystack = `${poi.name} ${poi.address ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [pois, searchQuery, categoryFilter, statusFilter, sourceFilter]);

  // checkpoint 1B.4 — which tenant categories the Discover Places drawer may
  // offer; a category with no eligible Google Places capability is never
  // shown there, matching the drawer's own controlled-selection contract.
  const eligibleCategories = useMemo(() => categories.filter((category) => categorySupportsGooglePlacesDiscovery(category)), [categories]);

  async function refetchPois(): Promise<void> {
    setIsRefetching(true);
    try {
      const response = await fetch('/api/map/pois');
      if (!response.ok) {
        setListError(await parseSafeErrorMessage(response, 'Could not load POIs.'));
        return;
      }
      const body = (await response.json()) as { pois: PoiParsed[] };
      setPois(body.pois);
      setListError(undefined);
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsRefetching(false);
    }
  }

  function openCreateDrawer(): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'create' });
  }

  function openEditDrawer(poi: PoiParsed): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'edit', poi });
  }

  function closeDrawer(): void {
    setDrawer(undefined);
  }

  function buildCreatePayload(values: PoiFormValues): unknown {
    return {
      name: values.name,
      categoryId: values.categoryId,
      latitude: Number(values.latitude.trim()),
      longitude: Number(values.longitude.trim()),
      ...(values.address.trim() ? { address: values.address.trim() } : {}),
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      status: values.status,
    };
  }

  async function handleCreateSubmit(values: PoiFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const parsed = poiCreateInputSchema.safeParse(buildCreatePayload(values));
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/map/pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not create the POI. Please try again.'));
        return;
      }
      closeDrawer();
      await refetchPois();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEditSubmit(poi: PoiParsed, values: PoiFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    // checkpoint 1B.4: an imported (`GOOGLE_PLACES`) POI's content fields
    // are never sent from this form — `PoiFormDrawer` already renders them
    // read-only via `readOnlyExceptStatus`, and this is the matching
    // client-side half of that restriction (the server enforces it
    // authoritatively regardless — see `PATCH /api/map/pois/{poiId}`'s own
    // `sourceType === 'GOOGLE_PLACES'` check).
    const payload =
      poi.sourceType === 'GOOGLE_PLACES'
        ? { status: values.status }
        : {
            name: values.name,
            categoryId: values.categoryId,
            latitude: Number(values.latitude.trim()),
            longitude: Number(values.longitude.trim()),
            // Sending the field only when non-blank means clearing a
            // previously-set address/description back to blank via this form
            // isn't possible yet — a deliberate, minor, documented scope
            // trim (matching the create payload's own convention above), not an
            // oversight: the checkpoint's optional-field requirement is "support"
            // address/description, not "support clearing" them.
            ...(values.address.trim() ? { address: values.address.trim() } : {}),
            ...(values.description.trim() ? { description: values.description.trim() } : {}),
            status: values.status,
          };
    const parsed = poiUpdateInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/map/pois/${poi.poiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not save the POI. Please try again.'));
        return;
      }
      closeDrawer();
      await refetchPois();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleEnabled(poi: PoiParsed): Promise<void> {
    setBusyPoiId(poi.poiId);
    try {
      const response = await fetch(`/api/map/pois/${poi.poiId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: poi.status === 'ENABLED' ? 'DISABLED' : 'ENABLED' }),
      });
      if (!response.ok) {
        setListError(await parseSafeErrorMessage(response, 'Could not save the POI. Please try again.'));
      }
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    }
    await refetchPois();
    setBusyPoiId(undefined);
  }

  function requestDelete(poi: PoiParsed): void {
    setDeleteTarget(poi);
  }

  function cancelDelete(): void {
    if (isDeleting) return;
    setDeleteTarget(undefined);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/map/pois/${deleteTarget.poiId}`, { method: 'DELETE' });
      if (!response.ok) {
        setListError(await parseSafeErrorMessage(response, 'Could not delete the POI. Please try again.'));
      }
      setDeleteTarget(undefined);
      await refetchPois();
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  const defaultCategoryId = categories[0]?.categoryId ?? '';
  const createInitialCenter: MapPreviewCenter = mapCenter ?? FALLBACK_CENTER;

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'POIs & Spots' }]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">POIs & Spots</h1>
          <p className="page-description">Manage places and locations displayed on your tourist map.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setIsDiscoverOpen(true)}>
              Discover Places
            </button>
            <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
              + New POI
            </button>
          </div>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can create or edit POIs. You can view current values below.
        </div>
      ) : null}

      {listError ? (
        <div className="alert alert-danger" role="alert">
          {listError}
        </div>
      ) : null}

      <div className="card">
        <div className="table-toolbar">
          <input
            type="text"
            className="input"
            placeholder="Search..."
            aria-label="Search POIs"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="select"
            // "Filter by category", not the bare "Category" the drawer's own
            // category field already uses — when the create/edit drawer is
            // open, this toolbar select is still present underneath the
            // overlay (the drawer doesn't unmount the page), so a shared
            // accessible name between the two would be a Playwright
            // strict-mode ambiguity, not just a cosmetic label choice.
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="ALL">All categories</option>
            {categories.map((category) => (
              <option key={category.categoryId} value={category.categoryId}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Filter by source"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
          >
            <option value="ALL">All sources</option>
            <option value="MANUAL">Manual</option>
            <option value="GOOGLE_PLACES">Google Places</option>
          </select>
          <select
            className="select"
            aria-label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="ENABLED">Enabled</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>

        {pois.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No POIs yet</div>
            <p>Add your first POI to start placing content on this map.</p>
          </div>
        ) : visiblePois.length === 0 ? (
          <div className="empty-state">
            <p>No POIs match your search or filters.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>POI</th>
                <th>Category</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visiblePois.map((poi) => {
                const isBusy = busyPoiId === poi.poiId || isRefetching;
                const category = categoryById.get(poi.categoryId);
                const iconMeta = category ? CATEGORY_ICON_META[category.icon] : undefined;

                return (
                  <tr key={poi.poiId}>
                    <td>{poi.name}</td>
                    <td>
                      {category ? (
                        <span className="icon-cell">
                          <span aria-hidden="true">{iconMeta?.emoji}</span>
                          {category.name}
                        </span>
                      ) : (
                        <span className="field-hint">Unknown category</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {poi.sourceType === 'CLIENT_CUSTOM' ? 'Manual' : poi.sourceType === 'GOOGLE_PLACES' ? 'Google Places' : poi.sourceType}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${poi.status === 'ENABLED' ? 'badge-success' : 'badge-neutral'}`}>
                        {poi.status === 'ENABLED' ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={() => openEditDrawer(poi)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => handleToggleEnabled(poi)}>
                            {poi.status === 'ENABLED' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`Delete ${poi.name}`}
                            disabled={isBusy}
                            onClick={() => requestDelete(poi)}
                          >
                            •••
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {drawer ? (
        <PoiFormDrawer
          key={drawer.mode === 'edit' ? drawer.poi.poiId : 'create'}
          mode={drawer.mode}
          initialValues={drawer.mode === 'edit' ? poiToFormValues(drawer.poi) : emptyFormValues(defaultCategoryId)}
          categories={categories}
          mapProvider={mapProvider}
          initialCenter={
            drawer.mode === 'edit' ? { lat: drawer.poi.location.latitude, lng: drawer.poi.location.longitude } : createInitialCenter
          }
          bounds={mapBounds}
          isSaving={isSaving}
          formError={formError}
          fieldErrors={fieldErrors}
          onCancel={closeDrawer}
          onSubmit={(values) => (drawer.mode === 'create' ? handleCreateSubmit(values) : handleEditSubmit(drawer.poi, values))}
          readOnlyExceptStatus={drawer.mode === 'edit' && drawer.poi.sourceType === 'GOOGLE_PLACES'}
        />
      ) : null}

      {deleteTarget ? (
        <DeletePoiDialog poiName={deleteTarget.name} isDeleting={isDeleting} onCancel={cancelDelete} onConfirm={confirmDelete} />
      ) : null}

      {isDiscoverOpen ? (
        <DiscoverPlacesDrawer
          eligibleCategories={eligibleCategories}
          existingPois={pois}
          onClose={() => setIsDiscoverOpen(false)}
          onImported={refetchPois}
        />
      ) : null}
    </>
  );
}
