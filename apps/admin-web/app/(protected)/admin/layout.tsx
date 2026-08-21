import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell/admin-shell';
import { getCurrentClientContext } from '@/lib/tenant/client-context';

/**
 * Wraps every page under `/admin/**` in the reusable admin shell —
 * checkpoint 1A.10 §1. `getCurrentClientContext()` is `React.cache()`-wrapped
 * (checkpoint 1A.10, see lib/tenant/client-context.ts), so calling it here
 * AND independently in each page below performs the underlying
 * `verifySession()` + Firestore reads only once per request, not twice.
 *
 * A denied context renders the shell anyway (branding + sign-out only, no
 * personal info) — never blocks the page underneath from rendering its own
 * denial message (§13: preserve every existing fail-closed behavior; this
 * layout does not gate access itself, `(protected)/layout.tsx` already did
 * that, and each page's own `getCurrentClientContext()` call still decides
 * what content is safe to show).
 */
export default async function AdminSectionLayout({ children }: { readonly children: ReactNode }) {
  const result = await getCurrentClientContext();
  const userInfo = result.ok
    ? {
        displayName: result.context.user.displayName,
        companyName: result.context.customer.companyName,
        role: result.context.user.role,
      }
    : undefined;

  return <AdminShell userInfo={userInfo}>{children}</AdminShell>;
}
