import type { Metadata } from 'next';
import Link from 'next/link';
import { describeClientContextDenial, getCurrentClientContext } from '@/lib/tenant/client-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { CategoriesManager } from './categories-manager';

export const metadata: Metadata = {
  title: 'Categories — Tourist Map System',
};

/**
 * Checkpoint 1B.2 — `/admin/categories`, docs/stages/STAGE_1B_TECHNICAL_PLAN.md.
 * Redesigned into the professional table + drawer CMS UI (see
 * `categories-manager.tsx`, which now owns the breadcrumb/title/actions —
 * the same "client component owns everything that needs interactive
 * state" shape `admin/map/map-settings-form.tsx` already established).
 *
 * Sources the same `getCurrentClientContext()` as `/admin` and `/admin/map`
 * — one tenant-resolution path, shared, never reimplemented per page. The
 * initial category list is loaded server-side via `loadTenantCategories()`
 * (real Firestore data, sorted by `order` per §7), the same helper
 * `GET /api/map/categories` uses, so a full page reload and the client's
 * own post-mutation refetch always agree on how the list is sourced/sorted.
 */
export default async function CategoriesPage() {
  const result = await getCurrentClientContext();

  if (!result.ok) {
    const { heading, message } = describeClientContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Categories</h1>
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

  const categories = await loadTenantCategories(result.context.map.mapId);

  return <CategoriesManager initialCategories={categories} canEdit={result.context.role === 'CLIENT_ADMIN'} />;
}
