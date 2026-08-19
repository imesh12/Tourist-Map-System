'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';

/**
 * Minimal logout trigger — checkpoint 1A.4 §8.
 *
 * Order matches the checkpoint spec exactly: client `signOut()` first, then
 * the trusted logout endpoint, then redirect. Both steps are best-effort
 * independently of each other — a network hiccup on either one must not
 * trap the user on the protected page; the server-side cookie clear is what
 * actually matters for access control, and `router.refresh()` after the
 * redirect ensures Server Components (the `(protected)` layout) re-verify
 * against the now-cleared cookie rather than serving a cached render.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    if (isSigningOut) {
      return;
    }
    setIsSigningOut(true);

    try {
      await getFirebaseAuth().signOut();
    } catch {
      // Best-effort — proceed regardless.
    }

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Best-effort — the client is signed out either way; proceed to
      // redirect rather than trapping the user here.
    }

    router.push('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
