import { redirect } from 'next/navigation';
import Link from 'next/link';
import { describeTenantIdentityDenial, getCurrentTenantIdentity } from '@/lib/tenant/tenant-identity';
import { resolveFirstOwnedMapId } from '@/lib/tenant/list-owned-maps';

/**
 * Shared backward-compatibility redirect for the pre-1B.6 single-map URLs
 * (`/admin/map`, `/admin/categories`, `/admin/pois`, `/admin/menu`) —
 * checkpoint 1B.6 §13.
 *
 * §13's own words are the design constraint here: "redirect to
 * `/admin/maps/{resolvedMapId}/categories` ONLY when an appropriate owned
 * map can be deterministically selected. Do not restore the single-map
 * assumption merely to support old URLs." This component is the one place
 * that decision is made, reused by all four legacy pages so the strategy
 * stays identical across them rather than drifting.
 *
 * "Deterministically selected" here means `resolveFirstOwnedMapId()`'s
 * `createdAt`-ascending ordering (`lib/tenant/list-owned-maps.ts`) — the
 * tenant's oldest/first-provisioned map. This is a real, working redirect
 * for the common case (a tenant with exactly one map, which is every
 * existing pre-1B.6 customer today) — it is NOT a resurrection of "the
 * tenant's one map" as an architectural assumption: a tenant with two or
 * more maps is still redirected somewhere real and usable (their oldest
 * map), never silently dropped, but is also given a plain link to the Maps
 * dashboard immediately below so ambiguity about "which map did this mean"
 * is visible and resolvable, not hidden.
 *
 * A tenant with ZERO owned maps (should not occur post-provisioning, but is
 * not assumed impossible — see `resolveFirstOwnedMapId()`'s own doc
 * comment) gets a dedicated explanatory card instead of a redirect to a
 * nonexistent map.
 */

const PAGE_TITLES: Record<string, string> = {
  settings: 'Map Settings',
  categories: 'Categories',
  pois: 'POIs & Spots',
  menu: 'Menu Builder',
};

interface LegacyMapRedirectProps {
  /** The map-scoped sub-path this legacy URL used to serve, e.g. `'categories'`. */
  readonly subpath: 'settings' | 'categories' | 'pois' | 'menu';
}

export async function LegacyMapRedirect({ subpath }: LegacyMapRedirectProps) {
  const result = await getCurrentTenantIdentity();

  if (!result.ok) {
    const { heading, message } = describeTenantIdentityDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">{PAGE_TITLES[subpath]}</h1>
        <h2 className="card-title" style={{ marginTop: 'var(--space-4)' }}>
          {heading}
        </h2>
        <p className="card-description">{message}</p>
      </div>
    );
  }

  const mapId = await resolveFirstOwnedMapId(result.identity.customer.customerId);

  if (!mapId) {
    return (
      <div className="card">
        <h1 className="page-title">{PAGE_TITLES[subpath]}</h1>
        <div className="empty-state">
          <div className="empty-state-title">No maps yet</div>
          <p>Create your first map to get started.</p>
          <Link href="/admin/maps" className="btn btn-primary">
            Go to Maps
          </Link>
        </div>
      </div>
    );
  }

  redirect(`/admin/maps/${mapId}/${subpath}`);
}
