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
      <div className="card">
        <h1 className="page-title">Account</h1>
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

  const { user, customer } = result.context;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account</h1>
        </div>
      </div>

      <div className="card">
        {/* Deliberately not "Account" again — the page-level <h1> already
            uses that name; a duplicate accessible name here would make
            `getByRole('heading', { name: 'Account' })` ambiguous for any
            test (existing or new) that targets the page heading. */}
        <h2 className="card-title">Your account</h2>
        <dl className="field-row">
          <div>
            <div className="field-hint">Display name</div>
            <div>{user.displayName}</div>
          </div>
          <div>
            <div className="field-hint">Email</div>
            <div>{user.email}</div>
          </div>
          <div>
            <div className="field-hint">Role</div>
            <div>{user.role}</div>
          </div>
        </dl>
      </div>

      <div className="card">
        <h2 className="card-title">Customer</h2>
        <dl className="field-row">
          <div>
            <div className="field-hint">Company</div>
            <div>{customer.companyName}</div>
          </div>
          <div>
            <div className="field-hint">Customer ID</div>
            <div>{customer.customerId}</div>
          </div>
          <div>
            <div className="field-hint">Provisioning status</div>
            <div>{customer.provisioning.status}</div>
          </div>
        </dl>
      </div>

      <Link href="/admin" className="btn btn-secondary">
        Back to dashboard
      </Link>
    </>
  );
}
