import { NextResponse } from 'next/server';

// Trivial health-check route so the build/deploy pipeline has a real route to
// exercise for tourist-web in Phase 1A, ahead of any real functionality.
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
