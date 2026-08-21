import type { ReactNode } from 'react';
import { Header, type AdminHeaderUserInfo } from './header';
import { Sidebar } from './sidebar';

/**
 * The reusable protected-admin application shell — checkpoint 1A.10 §1.
 * Header + sidebar + main content, used by `app/(protected)/admin/layout.tsx`
 * so every current and future page under `/admin/**` gets it automatically,
 * without re-implementing the chrome per page.
 */
interface AdminShellProps {
  readonly userInfo?: AdminHeaderUserInfo;
  readonly children: ReactNode;
}

export function AdminShell({ userInfo, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <Header userInfo={userInfo} />
      <div className="admin-body">
        <Sidebar />
        <main className="admin-main">
          <div className="admin-main-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
