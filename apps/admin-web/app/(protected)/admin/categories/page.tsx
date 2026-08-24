import type { Metadata } from 'next';
import { LegacyMapRedirect } from '@/components/admin-shell/legacy-map-redirect';

export const metadata: Metadata = {
  title: 'Categories — Tourist Map System',
};

/**
 * Legacy URL — checkpoint 1B.6 §13. `/admin/categories` was checkpoint
 * 1B.2's single-map Categories route; this now redirects to the tenant's
 * deterministically-resolved first map's own
 * `/admin/maps/{mapId}/categories`. See `LegacyMapRedirect`'s own doc
 * comment for the full strategy.
 */
export default async function LegacyCategoriesRedirectPage() {
  return <LegacyMapRedirect subpath="categories" />;
}
