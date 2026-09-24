import { NextResponse, type NextRequest } from 'next/server';
import { mapIdSchema, poiIdSchema } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';
import { GoogleCloudTranslationProvider, generatePoiTranslationsForPoi, PoiTranslationServiceError } from 'translation-server';

interface RouteParams { readonly params: Promise<{ readonly mapId: string; readonly poiId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) return NextResponse.json({ code: 'translation/forbidden', message: 'Request not allowed.' }, { status: 403 });
  const { mapId, poiId } = await params;
  if (!mapIdSchema.safeParse(mapId).success || !poiIdSchema.safeParse(poiId).success) return NextResponse.json({ code: 'translation/invalid-request', message: 'Invalid translation request.' }, { status: 400 });
  const context = await getOwnedMapContext(mapId);
  if (!context.ok) {
    if (isIdentityDenialReason(context.reason)) return NextResponse.json({ code: 'translation/unauthorized', message: 'Your Admin session has expired. Please sign in again.' }, { status: 401 });
    return NextResponse.json({ code: 'translation/not-found', message: 'Map not found.' }, { status: 404 });
  }
  if (context.context.identity.role !== 'CLIENT_ADMIN') return NextResponse.json({ code: 'translation/forbidden', message: 'You are not authorized to generate translations.' }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})) as { name?: unknown; address?: unknown; description?: unknown };
    const sourceOverrides = {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.address === 'string' ? { address: body.address } : {}),
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
    };
    const result = await generatePoiTranslationsForPoi({ mapId: context.context.map.mapId, poiId, sourceOverrides }, { firestore: getFirebaseAdminFirestore(), provider: new GoogleCloudTranslationProvider() });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PoiTranslationServiceError) {
      const status = error.code.includes('not-found') ? 404 : error.code.includes('concurrent') ? 409 : error.code.includes('configuration') ? 503 : 400;
      return NextResponse.json({ code: error.code, message: error.message }, { status });
    }
    return NextResponse.json({ code: 'translation/provider-failure', message: 'Translation could not be generated.' }, { status: 503 });
  }
}
