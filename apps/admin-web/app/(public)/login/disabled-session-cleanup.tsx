'use client';

import { useEffect } from 'react';
import { getFirebaseAuth } from '@/lib/firebase/client';

/**
 * checkpoint 1A.7 §5 "forced sign-out". The server has already denied
 * access (the httpOnly session cookie is the authoritative reason `/admin`
 * was unreachable — nothing here affects access control). What this
 * reconciles is the BROWSER's own client-side Firebase Auth SDK state
 * (`firebase.auth().currentUser`, persisted in IndexedDB independently of
 * the httpOnly cookie): without this, a user whose account was disabled
 * after they signed in could land back on `/login` while the client SDK
 * still believes it holds a signed-in user, which is exactly the
 * inconsistent state `lib/auth/complete-login.ts` already guards against on
 * the *login* path (§4A) — this closes the same gap for the *disabled*
 * path. Best-effort only: if `signOut()` fails, the user is still on
 * `/login` and cannot reach `/admin` either way.
 */
export function DisabledSessionCleanup() {
  useEffect(() => {
    getFirebaseAuth()
      .signOut()
      .catch(() => {
        // Best-effort — server-side denial is what actually matters for
        // access control.
      });
  }, []);

  return null;
}
