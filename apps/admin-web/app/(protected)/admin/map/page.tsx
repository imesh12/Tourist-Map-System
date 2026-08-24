import type { Metadata } from 'next';
import { LegacyMapRedirect } from '@/components/admin-shell/legacy-map-redirect';

export const metadata: Metadata = {
  title: 'Map Settings — Tourist Map System',
};

/**
 * Legacy URL — checkpoint 1B.6 §13. `/admin/map` was checkpoint 1B.1's
 * single-map Map Settings route; this now redirects to the tenant's
 * deterministically-resolved first map's own `/admin/maps/{mapId}/settings`.
 * See `LegacyMapRedirect`'s own doc comment for the full strategy.
 */
export default async function LegacyMapSettingsRedirectPage() {
  return <LegacyMapRedirect subpath="settings" />;
}
