import type { Metadata } from 'next';
import Link from 'next/link';
import { describeMapContextDenial, getOwnedMapContext } from '@/lib/tenant/map-context';
import { MapSettingsForm } from './map-settings-form';

export const metadata: Metadata = {
  title: 'Map Settings — Tourist Map System',
};

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

/**
 * `/admin/maps/{mapId}/settings` — checkpoint 1B.6, replacing checkpoint
 * 1B.1/1A.10's `/admin/map`. Sources `getOwnedMapContext(mapId)` (§4)
 * instead of the old implicit-single-map `getCurrentClientContext()` — the
 * target map is now the one named explicitly in the URL, verified to
 * belong to the authenticated tenant before this page renders anything
 * (§14). `context.map` is still REAL current Firestore data (never a
 * client-supplied value beyond the `mapId` used to look it up), so the form
 * below always initializes from what is actually stored right now.
 *
 * Write access is further restricted to CLIENT_ADMIN by
 * `PATCH /api/maps/{mapId}/settings` itself; this page still renders the
 * form for any client-assignable role so a non-admin doesn't get a
 * confusing "page not found."
 */
export default async function MapSettingsPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);

  if (!result.ok) {
    const { heading, message } = describeMapContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Map Settings</h1>
        <h2 className="card-title" style={{ marginTop: 'var(--space-4)' }}>
          {heading}
        </h2>
        <p className="card-description">{message}</p>
        <Link href="/admin/maps" className="btn btn-secondary">
          Back to Maps
        </Link>
      </div>
    );
  }

  return (
    <MapSettingsForm
      mapId={result.context.map.mapId}
      initialMap={result.context.map}
      canEdit={result.context.identity.role === 'CLIENT_ADMIN'}
    />
  );
}
