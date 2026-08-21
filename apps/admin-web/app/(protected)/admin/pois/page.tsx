import type { Metadata } from 'next';
import Link from 'next/link';
import { describeClientContextDenial, getCurrentClientContext } from '@/lib/tenant/client-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { loadTenantPois } from '@/lib/tenant/load-pois';
import { PoisManager } from './pois-manager';

export const metadata: Metadata = {
  title: 'POIs & Spots — Tourist Map System',
};

/**
 * Checkpoint 1B.3 — `/admin/pois`, following the exact same server-component
 * shape `/admin/categories` established: `getCurrentClientContext()` is the
 * one tenant-resolution path (never re-derived here), the initial list is
 * loaded server-side via the same helper `GET /api/map/pois` uses
 * (`loadTenantPois`, so a full reload and the client's own post-mutation
 * refetch always agree on how the list is sourced/sorted), and all
 * interactive state (search/filter/drawer/delete) lives in a client
 * component that owns the breadcrumb/title/actions too.
 *
 * §21 — a client with zero categories cannot open a usable POI creation
 * form at all (every POI must reference an existing category, §6), so this
 * page never even mounts `PoisManager` in that case: it renders a dedicated
 * explanatory state with a real link to `/admin/categories`, the same
 * "dedicated server-rendered state, never a misleading interactive form"
 * principle the denied-context branch below already follows.
 */
export default async function PoisPage() {
  const result = await getCurrentClientContext();

  if (!result.ok) {
    const { heading, message } = describeClientContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">POIs & Spots</h1>
        <h2 className="card-title" style={{ marginTop: 'var(--space-4)' }}>
          {heading}
        </h2>
        <p className="card-description">{message}</p>
        <Link href="/admin" className="btn btn-secondary">
          Back to dashboard
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
          <Link href="/admin/categories" className="btn btn-primary">
            Create category
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PoisManager
      initialPois={pois}
      categories={categories}
      mapProvider={map.mapProvider.provider}
      mapCenter={map.area.center}
      mapBounds={map.area.type === 'BOUNDED' ? map.area.bounds : undefined}
      canEdit={result.context.role === 'CLIENT_ADMIN'}
    />
  );
}
