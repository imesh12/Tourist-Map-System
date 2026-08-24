import type { Metadata } from 'next';
import { LegacyMapRedirect } from '@/components/admin-shell/legacy-map-redirect';

export const metadata: Metadata = {
  title: 'POIs & Spots — Tourist Map System',
};

/**
 * Legacy URL — checkpoint 1B.6 §13. `/admin/pois` was checkpoint 1B.3's
 * single-map POIs route; this now redirects to the tenant's
 * deterministically-resolved first map's own `/admin/maps/{mapId}/pois`.
 * See `LegacyMapRedirect`'s own doc comment for the full strategy.
 */
export default async function LegacyPoisRedirectPage() {
  return <LegacyMapRedirect subpath="pois" />;
}
