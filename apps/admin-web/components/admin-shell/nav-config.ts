import type { NavIconName } from './nav-icon';

/**
 * Sidebar navigation model — checkpoint 1A.10 §1/§11/§12, restructured in
 * checkpoint 1B.6 for the "customer → N maps" model.
 *
 * `kind: 'link'` items are real, clickable navigation; `kind: 'future'`
 * items are visible for product direction only — never a link to a
 * nonexistent page (§12 — "must not lead users into fake functionality").
 *
 * Through checkpoint 1B.5, Map Settings/Categories/POIs/Menu Builder were
 * each a single, always-present, tenant-implicit link
 * (`/admin/map`/`/admin/categories`/`/admin/pois`/`/admin/menu`) — that no
 * longer makes sense once a tenant can own several maps: there is no longer
 * one "the" map for a static link to point at. `buildAdminNavSections()`
 * replaces the old static `ADMIN_NAV_SECTIONS` export with a function of
 * the CURRENTLY ACTIVE map (if any): outside any map's routes it renders
 * only "All maps"; inside `/admin/maps/{mapId}/**` it additionally renders
 * the four workspaces as real links scoped to THAT `mapId`. `Sidebar`
 * derives `activeMapId` itself from the current pathname (see
 * `lib/tenant/map-route.ts`) — no server-side prop drilling needed.
 */

export type NavItem =
  | { readonly kind: 'link'; readonly label: string; readonly href: string; readonly icon: NavIconName }
  | { readonly kind: 'future'; readonly label: string; readonly icon: NavIconName };

export interface NavSection {
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export function buildAdminNavSections(activeMapId?: string): readonly NavSection[] {
  const mapsSectionItems: NavItem[] = [{ kind: 'link', label: 'All maps', href: '/admin/maps', icon: 'map' }];

  if (activeMapId) {
    mapsSectionItems.push(
      { kind: 'link', label: 'Map Settings', href: `/admin/maps/${activeMapId}/settings`, icon: 'map' },
      { kind: 'link', label: 'Categories', href: `/admin/maps/${activeMapId}/categories`, icon: 'tag' },
      { kind: 'link', label: 'POIs / Spots', href: `/admin/maps/${activeMapId}/pois`, icon: 'pin' },
      { kind: 'link', label: 'Menu Builder', href: `/admin/maps/${activeMapId}/menu`, icon: 'menu' },
      { kind: 'future', label: 'Map Preview', icon: 'preview' },
    );
  }

  return [
    { items: [{ kind: 'link', label: 'Dashboard', href: '/admin', icon: 'dashboard' }] },
    { items: [{ kind: 'future', label: 'Organization', icon: 'organization' }] },
    { label: 'Maps', items: mapsSectionItems },
    { items: [{ kind: 'future', label: 'Media', icon: 'media' }] },
    { items: [{ kind: 'future', label: 'Pages', icon: 'page' }] },
    { items: [{ kind: 'future', label: 'Announcements', icon: 'announcement' }] },
    { items: [{ kind: 'future', label: 'Analytics', icon: 'analytics' }] },
    { items: [{ kind: 'future', label: 'Users', icon: 'users' }] },
    { items: [{ kind: 'future', label: 'Settings', icon: 'settings' }] },
  ];
}
