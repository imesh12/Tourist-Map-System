import { SignOutButton } from '@/components/sign-out-button';
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
 * not expose internal Firebase errors"). `SignOutButton` stays available in
 * both states so a user is never trapped here.
 */
export default async function AdminPage() {
  const result = await getCurrentClientContext();

  if (!result.ok) {
    const { heading, message } = describeClientContextDenial(result);
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
        <h1>Client Admin</h1>
        <h2>{heading}</h2>
        <p>{message}</p>
        <SignOutButton />
      </main>
    );
  }

  const { user, customer, map } = result.context;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
      <h1>Client Admin</h1>
      <dl>
        <dt>Company</dt>
        <dd>{customer.companyName}</dd>

        <dt>Signed in as</dt>
        <dd>
          {user.displayName} ({user.email})
        </dd>

        <dt>Role</dt>
        <dd>{user.role}</dd>

        <dt>Map</dt>
        <dd>{map.name}</dd>

        <dt>Customer ID</dt>
        <dd>{customer.customerId}</dd>
      </dl>
      <p>Map configuration and publishing arrive in a later phase.</p>
      <SignOutButton />
    </main>
  );
}
