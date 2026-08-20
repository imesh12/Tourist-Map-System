import Link from 'next/link';
import { describeClientContextDenial, getCurrentClientContext } from '@/lib/tenant/client-context';

/**
 * Checkpoint 1A.8 — real account/tenant data (§6). Read-only: no edit form
 * (§16 — "Read-only account/tenant info screen in Phase 1A"). Sources the
 * same `getCurrentClientContext()` as `/admin` — one tenant-resolution path,
 * shared, not reimplemented per page.
 */
export default async function AccountPage() {
  const result = await getCurrentClientContext();

  if (!result.ok) {
    const { heading, message } = describeClientContextDenial(result);
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
        <h1>Account</h1>
        <h2>{heading}</h2>
        <p>{message}</p>
        <p>
          <Link href="/admin">Back to dashboard</Link>
        </p>
      </main>
    );
  }

  const { user, customer } = result.context;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
      <h1>Account</h1>

      {/* Deliberately not "Account" again — the page-level <h1> already
          uses that name; a duplicate accessible name here would make
          `getByRole('heading', { name: 'Account' })` ambiguous for any
          test (existing or new) that targets the page heading. */}
      <h2>Your account</h2>
      <dl>
        <dt>Display name</dt>
        <dd>{user.displayName}</dd>

        <dt>Email</dt>
        <dd>{user.email}</dd>

        <dt>Role</dt>
        <dd>{user.role}</dd>
      </dl>

      <h2>Customer</h2>
      <dl>
        <dt>Company</dt>
        <dd>{customer.companyName}</dd>

        <dt>Customer ID</dt>
        <dd>{customer.customerId}</dd>

        <dt>Provisioning status</dt>
        <dd>{customer.provisioning.status}</dd>
      </dl>

      <p>
        <Link href="/admin">Back to dashboard</Link>
      </p>
    </main>
  );
}
