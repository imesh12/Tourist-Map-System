import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth/verify-session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Register — Tourist Map System',
};

export default async function RegisterPage() {
  // checkpoint 1A.9, mirroring /login (checkpoint 1A.7 §7/§16): an
  // already-authenticated visit to this public route redirects straight to
  // /admin rather than showing the form again.
  const { session } = await verifySession();
  if (session) {
    redirect('/admin');
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: 420, margin: '0 auto' }}>
      <h1>Register your organization</h1>
      <RegisterForm />
      <p style={{ marginTop: '1.5rem' }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
