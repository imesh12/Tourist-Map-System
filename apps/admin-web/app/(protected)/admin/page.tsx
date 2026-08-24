import Link from 'next/link';
import { describeTenantIdentityDenial, getCurrentTenantIdentity } from '@/lib/tenant/tenant-identity';
import { listOwnedMaps } from '@/lib/tenant/list-owned-maps';

/**
 * Checkpoint 1A.8 — real tenant/account data (§5), updated in checkpoint
 * 1B.6 for the "customer → N maps" model. Through checkpoint 1B.5 this page
 * showed a single "Map" field and links straight into that one map's
 * Settings/Categories, because `getCurrentClientContext()` always resolved
 * exactly one implicit map. That assumption is gone: this page is now
 * customer-scoped only (`getCurrentTenantIdentity()`, no map at all) and
 * shows how many maps the tenant owns plus a link to the Maps dashboard
 * (`/admin/maps`), which is where map-specific actions now live — this page
 * itself never guesses which map the Client Admin meant.
 *
 * `getCurrentTenantIdentity()` is the ONLY source of the identity data
 * below — it derives the tenant strictly from the verified session's own
 * claims, never from anything this page could pass in.
 *
 * A denied context (missing/incomplete provisioning, or any consistency
 * failure) renders a dedicated message in place of the dashboard — never a
 * redirect, and never the real error detail.
 */
export default async function AdminPage() {
  const result = await getCurrentTenantIdentity();

  if (!result.ok) {
    const { heading, message } = describeTenantIdentityDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Client Admin</h1>
        <h2 className="card-title" style={{ marginTop: 'var(--space-4)' }}>
          {heading}
        </h2>
        <p className="card-description">{message}</p>
      </div>
    );
  }

  const { user, customer } = result.identity;
  const maps = await listOwnedMaps(customer.customerId);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Client Admin</h1>
          <p className="page-description">Your organization, identity, and maps — proof that provisioning worked.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Organization</div>
        <dl className="field-row" style={{ rowGap: 'var(--space-3)' }}>
          <div>
            <div className="field-hint">Company</div>
            <div>{customer.companyName}</div>
          </div>
          <div>
            <div className="field-hint">Customer ID</div>
            <div>{customer.customerId}</div>
          </div>
          <div>
            <div className="field-hint">Signed in as</div>
            <div>
              {user.displayName} ({user.email})
            </div>
          </div>
          <div>
            <div className="field-hint">Role</div>
            <div>{user.role}</div>
          </div>
          <div>
            <div className="field-hint">Maps</div>
            <div>{maps.length}</div>
          </div>
        </dl>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Maps
          </div>
          <p className="card-description" style={{ marginBottom: 0 }}>
            {maps.length === 0
              ? 'No maps yet.'
              : maps.length === 1
                ? 'You have one map.'
                : `You have ${maps.length} maps.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/admin/maps" className="btn btn-primary">
            Go to Maps
          </Link>
        </div>
      </div>
    </>
  );
}
