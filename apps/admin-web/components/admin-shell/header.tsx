import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';

/**
 * The reusable admin top header — checkpoint 1A.10 §2.
 *
 * Server-rendered, receives already-resolved tenant/user data as plain
 * props rather than loading anything itself — `app/(protected)/admin/layout.tsx`
 * is the one place that calls `getCurrentClientContext()` for this
 * purpose, reusing the exact same trusted tenant-resolution path every
 * other page already uses (no duplicated auth/authorization logic here).
 *
 * `userInfo` is `undefined` for a denied context (missing/incomplete
 * provisioning, any consistency failure) — the header still renders, with
 * just branding and `SignOutButton`, so a user in that state is never
 * trapped without a way to sign out (the same guarantee `/admin`'s own
 * denial branch already gives, extended to every page under the shell).
 *
 * Deliberately shows only display name + company here, not `role` — §2
 * asks for "role OR an account affordance", and the existing `/admin`
 * dashboard and `/admin/account` pages already display the role value as
 * their own page content; repeating it in a header shown on every page
 * would make `getByText('CLIENT_ADMIN')` (an existing, unchanged assertion
 * in e2e/dashboard.spec.ts) match two elements instead of one. The
 * "Account" link below is this header's account affordance instead.
 */
export interface AdminHeaderUserInfo {
  readonly displayName: string;
  readonly companyName: string;
  readonly role: string;
}

interface HeaderProps {
  readonly userInfo?: AdminHeaderUserInfo;
}

export function Header({ userInfo }: HeaderProps) {
  return (
    <header className="admin-header">
      <Link href="/admin" className="admin-header-brand">
        Tourist Map System
      </Link>

      <div className="admin-header-user">
        {userInfo ? (
          <div className="admin-header-user-info">
            <div className="admin-header-user-name">{userInfo.displayName}</div>
            <div className="admin-header-user-meta">{userInfo.companyName}</div>
          </div>
        ) : null}
        <Link href="/admin/account" className="btn btn-ghost">
          Account
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
