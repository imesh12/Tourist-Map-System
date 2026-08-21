import type { Metadata } from 'next';
import Link from 'next/link';
import { describeClientContextDenial, getCurrentClientContext } from '@/lib/tenant/client-context';
import { MapSettingsForm } from './map-settings-form';

export const metadata: Metadata = {
  title: 'Map Settings — Tourist Map System',
};

/**
 * Checkpoint 1B.1 — `/admin/map`, docs/stages/STAGE_1B_TECHNICAL_PLAN.md §3.
 * Redesigned in checkpoint 1A.10 into the professional two-column Map
 * Settings workspace — see `map-settings-form.tsx`, which now owns the
 * breadcrumb/title/actions/workspace layout (it needs the same client
 * state the actions act on) as well as the form itself.
 *
 * Sources the same `getCurrentClientContext()` as `/admin` and
 * `/admin/account` — one tenant-resolution path, shared, never
 * reimplemented per page. `context.map` is REAL current tenant data (never
 * a client-supplied `mapId`), so the form below always initializes from
 * what is actually stored in Firestore right now, not stale client state.
 *
 * Write access (the actual save) is further restricted to CLIENT_ADMIN by
 * `PATCH /api/map/settings` itself; this page still renders the form for
 * any client-assignable role so a non-admin doesn't get a confusing "page
 * not found" — the save button surfaces the server's own safe rejection
 * message if a non-admin somehow submits it.
 */
export default async function MapSettingsPage() {
  const result = await getCurrentClientContext();

  if (!result.ok) {
    const { heading, message } = describeClientContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Map Settings</h1>
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

  return <MapSettingsForm initialMap={result.context.map} canEdit={result.context.role === 'CLIENT_ADMIN'} />;
}
