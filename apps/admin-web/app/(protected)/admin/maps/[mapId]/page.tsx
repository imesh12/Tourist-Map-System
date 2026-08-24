import type { Metadata } from 'next';
import Link from 'next/link';
import { describeMapContextDenial, getOwnedMapContext } from '@/lib/tenant/map-context';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';

export const metadata: Metadata = {
  title: 'Map — Tourist Map System',
};

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

/**
 * `/admin/maps/{mapId}` — checkpoint 1B.6 §3's "map overview" entry, the
 * page a Client Admin lands on right after "Open Map" from the Maps
 * dashboard (§7 — this is where "opening Shinjuku establishes it as the
 * active map" happens: reaching this route at all only succeeds once
 * `getOwnedMapContext(mapId)` has verified ownership). Deliberately a thin
 * landing/hub page, not a duplicate of Map Settings — it just orients the
 * Client Admin and links into the four real map-scoped workspaces.
 */
export default async function MapOverviewPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);

  if (!result.ok) {
    const { heading, message } = describeMapContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Map</h1>
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

  const { map } = result.context;

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Maps', href: '/admin/maps' }, { label: map.name }]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">{map.name}</h1>
          <p className="page-description">
            {map.status === 'DRAFT' ? 'Draft — ' : ''}Provider: {map.mapProvider.provider} · {map.mapProvider.style}
          </p>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div className="card-title">Manage this map</div>
        <div className="page-actions" style={{ flexWrap: 'wrap' }}>
          <Link href={`/admin/maps/${map.mapId}/settings`} className="btn btn-secondary">
            Map Settings
          </Link>
          <Link href={`/admin/maps/${map.mapId}/categories`} className="btn btn-secondary">
            Categories
          </Link>
          <Link href={`/admin/maps/${map.mapId}/pois`} className="btn btn-secondary">
            POIs & Spots
          </Link>
          <Link href={`/admin/maps/${map.mapId}/menu`} className="btn btn-secondary">
            Menu Builder
          </Link>
        </div>
      </div>
    </>
  );
}
