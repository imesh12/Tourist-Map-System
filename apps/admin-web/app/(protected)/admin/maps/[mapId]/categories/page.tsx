import type { Metadata } from 'next';
import Link from 'next/link';
import { describeMapContextDenial, getOwnedMapContext } from '@/lib/tenant/map-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { CategoriesManager } from './categories-manager';

export const metadata: Metadata = {
  title: 'Categories — Tourist Map System',
};

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

/**
 * `/admin/maps/{mapId}/categories` — checkpoint 1B.6, replacing checkpoint
 * 1B.2's `/admin/categories`. Sources `getOwnedMapContext(mapId)` instead of
 * the old implicit-single-map resolution — `mapId` is now explicit in the
 * URL and verified to belong to the authenticated tenant (§14) before this
 * page loads any category data. `loadTenantCategories()` itself is
 * unchanged (§10/§11: category storage/loading logic is preserved) — only
 * which `mapId` gets passed to it moved from an implicit resolution to this
 * page's own verified URL parameter.
 */
export default async function CategoriesPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);

  if (!result.ok) {
    const { heading, message } = describeMapContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Categories</h1>
        <h2 className="card-title" style={{ marginTop: 'var(--space-4)' }}>
          {heading}
        </h2>
        <p className="card-description">{message}</p>
        <Link href="/admin/maps" className="btn btn-secondary">
          Back to Maps
        </Link>
      </div>
    );
  }

  const categories = await loadTenantCategories(result.context.map.mapId);

  return (
    <CategoriesManager
      mapId={result.context.map.mapId}
      mapName={result.context.map.name}
      initialCategories={categories}
      canEdit={result.context.identity.role === 'CLIENT_ADMIN'}
    />
  );
}
