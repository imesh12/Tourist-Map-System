import type { Metadata } from 'next';
import Link from 'next/link';
import { describeMapContextDenial, getOwnedMapContext } from '@/lib/tenant/map-context';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { loadTenantMenuItems } from '@/lib/tenant/load-menu-items';
import { loadTenantPages } from '@/lib/tenant/load-pages';
import { MenuBuilderManager } from './menu-builder-manager';

export const metadata: Metadata = {
  title: 'Menu Builder — Tourist Map System',
};

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

/**
 * `/admin/maps/{mapId}/menu` — checkpoint 1B.6, replacing checkpoint 1B.5's
 * `/admin/menu`. Same server-component shape every other map-scoped page in
 * this checkpoint uses: `getOwnedMapContext(mapId)` verifies the requested
 * map (§14) before either `loadTenantCategories()`/`loadTenantMenuItems()`
 * ever runs — both scoped to THIS map only (§11: menu items remain
 * `maps/{mapId}/menuItems/*`, CATEGORY != MENU ITEM stays an invariant,
 * `Category.menuEnabled` is still deliberately not a thing).
 *
 * Unlike `/admin/maps/{mapId}/pois`, this page does NOT gate on "zero
 * categories" — unchanged from 1B.5's reasoning (FEATURE menu items don't
 * need any category to exist).
 */
export default async function MenuBuilderPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);

  if (!result.ok) {
    const { heading, message } = describeMapContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Menu Builder</h1>
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

  const { map } = result.context;
  const [categories, menuItems, pages] = await Promise.all([
    loadTenantCategories(map.mapId),
    loadTenantMenuItems(map.mapId),
    loadTenantPages(map.mapId),
  ]);

  return (
    <MenuBuilderManager
      mapId={map.mapId}
      mapName={map.name}
      initialMenuItems={menuItems}
      categories={categories}
      pages={pages}
      canEdit={result.context.identity.role === 'CLIENT_ADMIN'}
    />
  );
}
