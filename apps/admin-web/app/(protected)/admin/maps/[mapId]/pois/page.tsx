import type { Metadata } from 'next';
import Link from 'next/link';
import { describeMapContextDenial, getOwnedMapContext } from '@/lib/tenant/map-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { loadTenantPois } from '@/lib/tenant/load-pois';
import { PoisManager } from './pois-manager';

export const metadata: Metadata = {
  title: 'POIs & Spots — Tourist Map System',
};

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

/**
 * `/admin/maps/{mapId}/pois` — checkpoint 1B.6, replacing checkpoint
 * 1B.3/1B.4's `/admin/pois`. Same server-component shape as
 * `/admin/maps/{mapId}/categories`: `getOwnedMapContext(mapId)` verifies the
 * requested map belongs to the authenticated tenant (§14) before either
 * `loadTenantCategories()`/`loadTenantPois()` ever runs, and both are the
 * exact same helpers `GET /api/maps/{mapId}/categories`/`pois` use.
 *
 * §10/§21 (unchanged from 1B.3): a client with zero categories UNDER THIS
 * MAP cannot open a usable POI creation form — this never even mounts
 * `PoisManager` in that case, and links to Categories scoped to THIS map,
 * not a different one.
 */
export default async function PoisPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);

  if (!result.ok) {
    const { heading, message } = describeMapContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">POIs & Spots</h1>
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
  const [categories, pois] = await Promise.all([loadTenantCategories(map.mapId), loadTenantPois(map.mapId)]);

  if (categories.length === 0) {
    return (
      <div className="card">
        <h1 className="page-title">POIs & Spots</h1>
        <div className="empty-state">
          <div className="empty-state-title">You need at least one category before adding a POI.</div>
          <p>Categories group your POIs by type (Restaurant, Sightseeing, and so on) — create one first, then come back here.</p>
          <Link href={`/admin/maps/${map.mapId}/categories`} className="btn btn-primary">
            Create category
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PoisManager
      mapId={map.mapId}
      mapName={map.name}
      initialPois={pois}
      categories={categories}
      mapProvider={map.mapProvider.provider}
      mapCenter={map.area.center}
      mapBounds={map.area.type === 'BOUNDED' ? map.area.bounds : undefined}
      canEdit={result.context.identity.role === 'CLIENT_ADMIN'}
    />
  );
}
