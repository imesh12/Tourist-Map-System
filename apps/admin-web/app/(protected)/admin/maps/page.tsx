import type { Metadata } from 'next';
import Link from 'next/link';
import { describeTenantIdentityDenial, getCurrentTenantIdentity } from '@/lib/tenant/tenant-identity';
import { listOwnedMaps } from '@/lib/tenant/list-owned-maps';
import { MapsDashboardManager } from './maps-dashboard-manager';

export const metadata: Metadata = {
  title: 'Maps — Tourist Map System',
};

/**
 * `/admin/maps` — checkpoint 1B.6 §5, the Maps dashboard. Tenant-scoped
 * (not map-scoped): sources `getCurrentTenantIdentity()` (identity only,
 * never a resolved map — this page's whole job is choosing/managing one)
 * plus `listOwnedMaps()`, so a Client Admin sees ONLY maps belonging to
 * their own `customerId` (§14) — never another tenant's maps, and never a
 * client-supplied filter of any kind.
 */
export default async function MapsDashboardPage() {
  const result = await getCurrentTenantIdentity();

  if (!result.ok) {
    const { heading, message } = describeTenantIdentityDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Maps</h1>
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

  const maps = await listOwnedMaps(result.identity.customer.customerId);

  return <MapsDashboardManager initialMaps={maps} canCreate={result.identity.role === 'CLIENT_ADMIN'} />;
}
