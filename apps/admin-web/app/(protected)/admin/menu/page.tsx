import type { Metadata } from 'next';
import { LegacyMapRedirect } from '@/components/admin-shell/legacy-map-redirect';

export const metadata: Metadata = {
  title: 'Menu Builder — Tourist Map System',
};

/**
 * Legacy URL — checkpoint 1B.6 §13. `/admin/menu` was checkpoint 1B.5's
 * single-map Menu Builder route; this now redirects to the tenant's
 * deterministically-resolved first map's own `/admin/maps/{mapId}/menu`.
 * See `LegacyMapRedirect`'s own doc comment for the full strategy.
 */
export default async function LegacyMenuRedirectPage() {
  return <LegacyMapRedirect subpath="menu" />;
}
