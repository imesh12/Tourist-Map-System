import { SignOutButton } from '@/components/sign-out-button';

// Checkpoint 1A.4 scope: prove the protected-route foundation works (a
// verified session reaches this page; an unverified one never does). The
// real proof-of-provisioning dashboard (company/map details, account
// status) is implemented in checkpoint 1A.8 per
// docs/stages/STAGE_1A_TECHNICAL_PLAN.md §17/§23 — intentionally not built
// here.
export default function AdminPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
      <h1>Client Admin</h1>
      <p>You are signed in. The account/map dashboard is implemented in a later checkpoint (1A.8).</p>
      <SignOutButton />
    </main>
  );
}
