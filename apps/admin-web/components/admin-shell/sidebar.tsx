'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildAdminNavSections } from './nav-config';
import { NavIcon } from './nav-icon';
import { parseActiveMapId } from '@/lib/tenant/map-route';

/**
 * The reusable admin sidebar — checkpoint 1A.10 §1. A client component
 * specifically so it can read the current route via `usePathname()` and
 * mark the matching item `aria-current="page"` — every other part of the
 * shell stays server-rendered.
 *
 * Checkpoint 1B.6: also derives the ACTIVE `mapId` (if any) from the same
 * `usePathname()` call, via `parseActiveMapId()`
 * (`lib/tenant/map-route.ts`), and passes it to `buildAdminNavSections()` so
 * the Maps section renders map-scoped links (Map Settings/Categories/POIs/
 * Menu Builder, each pointing at THIS `mapId`) only while inside that map's
 * own routes — no server-side prop drilling needed, since the pathname
 * itself already carries the answer.
 *
 * `future` items render as inert, non-focusable text (no `<a>`/`<button>`,
 * no `href`) — there is no route for them to navigate to, so they are
 * structurally incapable of leading a user into fake functionality, not
 * merely styled to look disabled.
 */
export function Sidebar() {
  const pathname = usePathname();
  const activeMapId = parseActiveMapId(pathname);
  const navSections = buildAdminNavSections(activeMapId);

  return (
    <nav className="admin-sidebar" aria-label="Admin">
      {navSections.map((section, index) => (
        <div className="admin-nav-group" key={section.label ?? index}>
          {section.label ? <div className="admin-nav-group-label">{section.label}</div> : null}
          {section.items.map((item) =>
            item.kind === 'link' ? (
              <Link
                key={item.label}
                href={item.href}
                className="admin-nav-item"
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                <NavIcon name={item.icon} className="admin-nav-item-icon" />
                <span>{item.label}</span>
              </Link>
            ) : (
              <div key={item.label} className="admin-nav-item-future" aria-disabled="true">
                <NavIcon name={item.icon} className="admin-nav-item-icon" />
                <span>{item.label}</span>
                <span className="admin-nav-item-soon">Soon</span>
              </div>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
