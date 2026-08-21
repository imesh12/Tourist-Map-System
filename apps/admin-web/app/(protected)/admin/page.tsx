import Link from 'next/link';
import { describeClientContextDenial, getCurrentClientContext } from '@/lib/tenant/client-context';

/**
 * Checkpoint 1A.8 — real tenant/account data (§5). Proves provisioning
 * actually worked, per docs/stages/STAGE_1A_TECHNICAL_PLAN.md §17: this is
 * NOT the final CMS dashboard (no map editor/POI/category/media/analytics/
 * billing/SUPER_ADMIN console — those are later phases), just enough to
 * show a correctly-provisioned Client Admin their own company, their own
 * identity, and their initial map.
 *
 * `getCurrentClientContext()` (lib/tenant/client-context.ts) is the ONLY
 * source of this data — it derives the tenant strictly from the verified
 * session's own claims, never from anything this page could pass in, so
 * there is no code path here that could render another tenant's data.
 *
 * A denied context (missing/incomplete provisioning, or any consistency
 * failure) renders a dedicated message in place of the dashboard — never a
 * redirect (checkpoint 1A.8 §3: "prefer a dedicated server-rendered state
 * over an infinite redirect loop") and never the real error detail (§3: "do
 * not expose internal Firebase errors"). Checkpoint 1A.10 moved the actual
 * `SignOutButton` into the shared admin shell header
 * (components/admin-shell/header.tsx), which renders unconditionally
 * regardless of this result — a user is still never trapped here, just via
 * the header now rather than page-local content.
 */
export default async function AdminPage() {
  const result = await getCurrentClientContext();

  if (!result.ok) {
    const { heading, message } = describeClientContextDenial(result);
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

  const { user, customer, map } = result.context;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Client Admin</h1>
          <p className="page-description">Your organization, identity, and initial map — proof that provisioning worked.</p>
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
            <div className="field-hint">Map</div>
            <div>{map.name}</div>
          </div>
        </dl>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 0 }}>
            Places and publishing
          </div>
          <p className="card-description" style={{ marginBottom: 0 }}>
            Arrive in a later phase.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/admin/map" className="btn btn-secondary">
            Edit map settings
          </Link>
          <Link href="/admin/categories" className="btn btn-secondary">
            Manage categories
          </Link>
        </div>
      </div>
    </>
  );
}
