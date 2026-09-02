import type { Metadata } from 'next';
import Link from 'next/link';
import { describeMapContextDenial, getOwnedMapContext } from '@/lib/tenant/map-context';
import { loadTenantPages } from '@/lib/tenant/load-pages';
import { PagesManager } from './pages-manager';

export const metadata: Metadata = {
  title: 'Pages — Tourist Map System',
};

interface PageParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

/**
 * `/admin/maps/{mapId}/pages` — checkpoint 1B.11, same server-component
 * shape every other map-scoped page in this checkpoint uses (§6 of the
 * checkpoint: "Do not introduce an implicit 'currently selected map'"):
 * `getOwnedMapContext(mapId)` verifies the requested map before
 * `loadTenantPages()` ever runs, scoped to THIS map only.
 */
export default async function PagesPage({ params }: PageParams) {
  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);

  if (!result.ok) {
    const { heading, message } = describeMapContextDenial(result);
    return (
      <div className="card">
        <h1 className="page-title">Pages</h1>
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

  const pages = await loadTenantPages(result.context.map.mapId);

  return (
    <PagesManager
      mapId={result.context.map.mapId}
      mapName={result.context.map.name}
      initialPages={pages}
      canEdit={result.context.identity.role === 'CLIENT_ADMIN'}
      enabledLanguages={result.context.map.enabledLanguages}
      defaultLanguage={result.context.map.defaultLanguage}
    />
  );
}
