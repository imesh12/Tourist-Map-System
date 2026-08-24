'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { mapCreateInputSchema, type MapParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { CreateMapDrawer, type CreateMapFormValues } from './create-map-drawer';

/**
 * The `/admin/maps` Maps dashboard manager — checkpoint 1B.6 §5. Same
 * "server-loaded initial list + client component owns interactive state"
 * shape `categories-manager.tsx`/`pois-manager.tsx`/`menu-builder-manager.tsx`
 * already establish: after a successful `POST /api/maps`, this navigates
 * straight to the new map's own overview page (`/admin/maps/{mapId}`)
 * rather than merely refetching the list in place — creating a map is
 * meant to be immediately followed by configuring it (§7's "opening a map
 * establishes it as active"), not just adding a row to a table.
 *
 * §5 (explicit non-goal): no destructive delete/archive action here — this
 * checkpoint does not invent map-deletion semantics that don't already
 * exist elsewhere in the project.
 */

interface MapsDashboardManagerProps {
  readonly initialMaps: readonly MapParsed[];
  readonly canCreate: boolean;
}

async function parseSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export function MapsDashboardManager({ initialMaps, canCreate }: MapsDashboardManagerProps) {
  const router = useRouter();
  const [maps] = useState<readonly MapParsed[]>(initialMaps);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);

  async function handleCreate(values: CreateMapFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const parsed = mapCreateInputSchema.safeParse({ name: values.name.trim() });
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not create the map. Please try again.'));
        return;
      }
      const body = (await response.json()) as { mapId: string };
      setIsDrawerOpen(false);
      router.push(`/admin/maps/${body.mapId}`);
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Maps' }]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Maps</h1>
          <p className="page-description">Every map that belongs to your organization.</p>
        </div>
        {canCreate ? (
          <div className="page-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setFormError(undefined);
                setFieldErrors([]);
                setIsDrawerOpen(true);
              }}
            >
              + Create map
            </button>
          </div>
        ) : null}
      </div>

      {!canCreate ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can create maps. You can view current maps below.
        </div>
      ) : null}

      <div className="card">
        {maps.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No maps yet</div>
            <p>Create your first map to start adding categories, POIs, and menu items.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Map</th>
                <th>Map ID</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {maps.map((map) => (
                <tr key={map.mapId}>
                  <td>{map.name}</td>
                  <td>
                    <span className="field-hint">{map.mapId}</span>
                  </td>
                  <td>{map.mapProvider.provider}</td>
                  <td>
                    <span className={`badge ${map.status === 'DRAFT' ? 'badge-neutral' : 'badge-success'}`}>{map.status}</span>
                  </td>
                  <td>
                    <Link href={`/admin/maps/${map.mapId}`} className="btn btn-secondary">
                      Open Map
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isDrawerOpen ? (
        <CreateMapDrawer
          isSaving={isSaving}
          formError={formError}
          fieldErrors={fieldErrors}
          onCancel={() => setIsDrawerOpen(false)}
          onSubmit={handleCreate}
        />
      ) : null}
    </>
  );
}
