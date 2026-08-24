import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell/admin-shell';
import { getCurrentTenantIdentity } from '@/lib/tenant/tenant-identity';

/**
 * Wraps every page under `/admin/**` in the reusable admin shell —
 * checkpoint 1A.10 §1, updated in checkpoint 1B.6 to source
 * `getCurrentTenantIdentity()` (identity only) rather than the old
 * `getCurrentClientContext()` (identity + one implicitly-resolved map) —
 * this layout has no `mapId` of its own (it wraps EVERY `/admin/**` route,
 * including `/admin`, `/admin/account`, and `/admin/maps` itself, none of
 * which are scoped to a specific map), so it was never actually using the
 * map half of the old context. `getCurrentTenantIdentity()` is still
 * `React.cache()`-wrapped, so calling it here AND independently in each
 * page below performs the underlying `verifySession()` + Firestore reads
 * only once per request, not twice.
 *
 * A denied context renders the shell anyway (branding + sign-out only, no
 * personal info) — never blocks the page underneath from rendering its own
 * denial message.
 */
export default async function AdminSectionLayout({ children }: { readonly children: ReactNode }) {
  const result = await getCurrentTenantIdentity();
  const userInfo = result.ok
    ? {
        displayName: result.identity.user.displayName,
        companyName: result.identity.customer.companyName,
        role: result.identity.user.role,
      }
    : undefined;

  return <AdminShell userInfo={userInfo}>{children}</AdminShell>;
}
