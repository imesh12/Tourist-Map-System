'use client';

import { useMemo, useState } from 'react';
import type { PublicContentLanguage } from 'shared-types';
import { liveCameraCreateInputSchema, liveCameraUpdateInputSchema, type LiveCameraParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { CameraFormDrawer, type CameraFormValues, type CameraTransportChoice } from './camera-form-drawer';
import { DeleteCameraDialog } from './delete-camera-dialog';

/**
 * The `/admin/maps/{mapId}/cameras` manager — LIVE CAMERAS FOUNDATION
 * checkpoint. Same shape `PagesManager`/`CategoriesManager`/`PoisManager`
 * already establish: after every successful create/edit/enable-disable/
 * delete mutation, this re-fetches `GET /api/maps/{mapId}/cameras` and
 * replaces state with that response — Firestore is the authoritative
 * source, not whatever was just optimistically typed into a form.
 *
 * Search/status-filter are pure client-side derivations over the
 * already-loaded `cameras` state — no new endpoint, no server round trip.
 */

type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED';

interface CamerasManagerProps {
  readonly mapId: string;
  readonly mapName: string;
  readonly initialCameras: readonly LiveCameraParsed[];
  readonly canEdit: boolean;
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
}

type DrawerState = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly camera: LiveCameraParsed } | undefined;

async function parseSafeErrorBody(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as { message?: unknown; code?: unknown };
    return {
      message: typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback,
      code: typeof body.code === 'string' ? body.code : undefined,
    };
  } catch {
    return { message: fallback };
  }
}

function emptyFormValues(): CameraFormValues {
  return {
    name: '',
    description: '',
    latitude: '',
    longitude: '',
    status: 'ENABLED',
    transport: 'NONE',
    playbackUrl: '',
    translations: {},
  };
}

function cameraToFormValues(camera: LiveCameraParsed): CameraFormValues {
  return {
    name: camera.name,
    description: camera.description ?? '',
    latitude: String(camera.location.latitude),
    longitude: String(camera.location.longitude),
    status: camera.status,
    transport: camera.playback?.transport ?? 'NONE',
    playbackUrl: camera.playback?.playbackUrl ?? '',
    translations: camera.translations ?? {},
  };
}

/**
 * Builds the `playback` value to send. `undefined` = omit the key entirely
 * (create: "not configured"); `null` = explicit clear signal (edit only —
 * see `liveCameraUpdateInputSchema`'s own doc comment); an object = set/replace.
 */
function buildPlaybackPayload(transport: CameraTransportChoice, playbackUrl: string): { transport: 'WEBRTC' | 'HLS' | 'YOUTUBE'; playbackUrl: string } | null | undefined {
  if (transport === 'NONE') {
    return null;
  }
  return { transport, playbackUrl: playbackUrl.trim() };
}

export function CamerasManager({ mapId, mapName, initialCameras, canEdit, enabledLanguages, defaultLanguage }: CamerasManagerProps) {
  const [cameras, setCameras] = useState<readonly LiveCameraParsed[]>(initialCameras);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [isRefetching, setIsRefetching] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [drawer, setDrawer] = useState<DrawerState>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);

  const [busyCameraId, setBusyCameraId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<LiveCameraParsed | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  const visibleCameras = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return cameras.filter((camera) => {
      if (statusFilter === 'ENABLED' && camera.status !== 'ENABLED') return false;
      if (statusFilter === 'DISABLED' && camera.status !== 'DISABLED') return false;
      if (query && !camera.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [cameras, searchQuery, statusFilter]);

  async function refetchCameras(): Promise<void> {
    setIsRefetching(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/cameras`);
      if (!response.ok) {
        setListError((await parseSafeErrorBody(response, 'Could not load live cameras.')).message);
        return;
      }
      const body = (await response.json()) as { cameras: LiveCameraParsed[] };
      setCameras(body.cameras);
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

  function openEditDrawer(camera: LiveCameraParsed): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'edit', camera });
  }

  function closeDrawer(): void {
    setDrawer(undefined);
  }

  function parseLatLng(values: CameraFormValues): { latitude: number; longitude: number } | undefined {
    const latitude = Number(values.latitude);
    const longitude = Number(values.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }
    return { latitude, longitude };
  }

  async function handleCreateSubmit(values: CameraFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const location = parseLatLng(values);
    if (!location) {
      setFieldErrors(['location: Latitude and longitude must both be valid numbers.']);
      return;
    }

    const playback = buildPlaybackPayload(values.transport, values.playbackUrl);
    const parsed = liveCameraCreateInputSchema.safeParse({
      name: values.name,
      ...(values.description.trim().length > 0 ? { description: values.description.trim() } : {}),
      location,
      status: values.status,
      // Create only ever OMITS the key for "not configured" — the create
      // schema has no `null` variant (see `liveCameraCreateInputSchema`'s
      // own doc comment: `null`-as-clear is an UPDATE-only signal, since
      // there is nothing to clear on a brand-new document).
      ...(playback ? { playback } : {}),
      ...(Object.keys(values.translations).length > 0 ? { translations: values.translations } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError((await parseSafeErrorBody(response, 'Could not create the camera. Please try again.')).message);
        return;
      }
      closeDrawer();
      await refetchCameras();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEditSubmit(camera: LiveCameraParsed, values: CameraFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const location = parseLatLng(values);
    if (!location) {
      setFieldErrors(['location: Latitude and longitude must both be valid numbers.']);
      return;
    }

    const parsed = liveCameraUpdateInputSchema.safeParse({
      name: values.name,
      // Update's description field accepts '' as an explicit clear signal —
      // see `liveCameraUpdateInputSchema`'s own doc comment.
      description: values.description.trim(),
      location,
      status: values.status,
      // ALWAYS sent on edit, `null` clearing an existing configuration —
      // full-replace semantics, same convention `translations` below uses.
      playback: buildPlaybackPayload(values.transport, values.playbackUrl),
      translations: values.translations,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/cameras/${camera.cameraId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError((await parseSafeErrorBody(response, 'Could not save the camera. Please try again.')).message);
        return;
      }
      closeDrawer();
      await refetchCameras();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleEnabled(camera: LiveCameraParsed): Promise<void> {
    setBusyCameraId(camera.cameraId);
    try {
      const response = await fetch(`/api/maps/${mapId}/cameras/${camera.cameraId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: camera.status === 'ENABLED' ? 'DISABLED' : 'ENABLED' }),
      });
      if (!response.ok) {
        setListError((await parseSafeErrorBody(response, 'Could not save the camera. Please try again.')).message);
      }
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    }
    await refetchCameras();
    setBusyCameraId(undefined);
  }

  function requestDelete(camera: LiveCameraParsed): void {
    setDeleteTarget(camera);
  }

  function cancelDelete(): void {
    if (isDeleting) return;
    setDeleteTarget(undefined);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/cameras/${deleteTarget.cameraId}`, { method: 'DELETE' });
      if (!response.ok) {
        const { message } = await parseSafeErrorBody(response, 'Could not delete the camera. Please try again.');
        setListError(message);
        setDeleteTarget(undefined);
        return;
      }
      setDeleteTarget(undefined);
      await refetchCameras();
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
      setDeleteTarget(undefined);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/admin' },
          { label: 'Maps', href: '/admin/maps' },
          { label: mapName, href: `/admin/maps/${mapId}` },
          { label: 'Live Cameras' },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Live Cameras</h1>
          <p className="page-description">Publish live camera views tourists can watch from the map — never an autoplaying stream.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
              + New Camera
            </button>
          </div>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can create or edit live cameras. You can view current values below.
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
            placeholder="Search cameras..."
            aria-label="Search live cameras"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="select"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="ENABLED">Enabled</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>

        {cameras.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No live cameras yet</div>
            <p>Create your first camera to give tourists a live view from this map.</p>
          </div>
        ) : visibleCameras.length === 0 ? (
          <div className="empty-state">
            <p>No cameras match your search or filter.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Playback</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCameras.map((camera) => {
                const isBusy = busyCameraId === camera.cameraId || isRefetching;

                return (
                  <tr key={camera.cameraId}>
                    <td>{camera.name}</td>
                    <td>
                      <span className={`badge ${camera.playback ? 'badge-success' : 'badge-neutral'}`}>
                        {camera.playback ? camera.playback.transport : 'Not configured'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${camera.status === 'ENABLED' ? 'badge-success' : 'badge-neutral'}`}>
                        {camera.status === 'ENABLED' ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={() => openEditDrawer(camera)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => handleToggleEnabled(camera)}>
                            {camera.status === 'ENABLED' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`Delete ${camera.name}`}
                            disabled={isBusy}
                            onClick={() => requestDelete(camera)}
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
        <CameraFormDrawer
          key={drawer.mode === 'edit' ? drawer.camera.cameraId : 'create'}
          mode={drawer.mode}
          initialValues={drawer.mode === 'edit' ? cameraToFormValues(drawer.camera) : emptyFormValues()}
          enabledLanguages={enabledLanguages}
          defaultLanguage={defaultLanguage}
          isSaving={isSaving}
          formError={formError}
          fieldErrors={fieldErrors}
          onCancel={closeDrawer}
          onSubmit={(values) => (drawer.mode === 'create' ? handleCreateSubmit(values) : handleEditSubmit(drawer.camera, values))}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteCameraDialog cameraName={deleteTarget.name} isDeleting={isDeleting} onCancel={cancelDelete} onConfirm={confirmDelete} />
      ) : null}
    </>
  );
}
