import type { NavIconName } from './nav-icon';

/**
 * Sidebar navigation model — checkpoint 1A.10 §1/§11/§12.
 *
 * `kind: 'link'` items are the ONLY currently-implemented routes
 * (`/admin`, `/admin/map`, `/admin/categories`) and are the only items
 * that render as real, clickable navigation — every other module listed in
 * the checkpoint's target sidebar (Organization, Menu Builder, Map
 * Preview, POIs/Spots, Media, Pages, Announcements, Analytics, Users,
 * Settings) is `kind: 'future'`: visible for product direction, never a
 * link to a nonexistent page (§12 — "must not lead users into fake
 * functionality").
 *
 * "Menu Builder" and "Map Preview" appear under Maps per §11's explicit
 * accommodation instruction, but neither has a real route yet — Map
 * Preview specifically is not a separate page in this checkpoint, it's the
 * live preview embedded inside Map Settings itself (§8), so linking it
 * here would misleadingly imply a second, different screen.
 *
 * "POIs / Spots" became a real `kind: 'link'` route (`/admin/pois`) in
 * checkpoint 1B.3 — its "Soon" badge is removed only now that the route
 * genuinely exists, per that checkpoint's own instruction.
 */

export type NavItem =
  | { readonly kind: 'link'; readonly label: string; readonly href: string; readonly icon: NavIconName }
  | { readonly kind: 'future'; readonly label: string; readonly icon: NavIconName };

export interface NavSection {
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export const ADMIN_NAV_SECTIONS: readonly NavSection[] = [
  { items: [{ kind: 'link', label: 'Dashboard', href: '/admin', icon: 'dashboard' }] },
  { items: [{ kind: 'future', label: 'Organization', icon: 'organization' }] },
  {
    label: 'Maps',
    items: [
      { kind: 'link', label: 'Map Settings', href: '/admin/map', icon: 'map' },
      { kind: 'future', label: 'Menu Builder', icon: 'menu' },
      { kind: 'future', label: 'Map Preview', icon: 'preview' },
    ],
  },
  { items: [{ kind: 'link', label: 'POIs / Spots', href: '/admin/pois', icon: 'pin' }] },
  { items: [{ kind: 'link', label: 'Categories', href: '/admin/categories', icon: 'tag' }] },
  { items: [{ kind: 'future', label: 'Media', icon: 'media' }] },
  { items: [{ kind: 'future', label: 'Pages', icon: 'page' }] },
  { items: [{ kind: 'future', label: 'Announcements', icon: 'announcement' }] },
  { items: [{ kind: 'future', label: 'Analytics', icon: 'analytics' }] },
  { items: [{ kind: 'future', label: 'Users', icon: 'users' }] },
  { items: [{ kind: 'future', label: 'Settings', icon: 'settings' }] },
];
