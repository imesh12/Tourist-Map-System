import { NextResponse, type NextRequest } from 'next/server';
import { liveCameraIdSchema, liveCameraSchema, mapIdSchema } from 'validation';
import { generateFieldTranslations, GoogleCloudTranslationProvider, type GeneratedFieldTranslations } from 'translation-server';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

interface RouteParams { readonly params: Promise<{ readonly mapId: string; readonly cameraId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) return NextResponse.json({ code: 'translation/forbidden', message: 'Request not allowed.' }, { status: 403 });
  const { mapId, cameraId } = await params;
  if (!mapIdSchema.safeParse(mapId).success || !liveCameraIdSchema.safeParse(cameraId).success) return NextResponse.json({ code: 'translation/invalid-request', message: 'Invalid translation request.' }, { status: 400 });
  const context = await getOwnedMapContext(mapId);
  if (!context.ok) return NextResponse.json({ code: isIdentityDenialReason(context.reason) ? 'translation/unauthorized' : 'translation/not-found', message: isIdentityDenialReason(context.reason) ? 'Your Admin session has expired. Please sign in again.' : 'Map not found.' }, { status: isIdentityDenialReason(context.reason) ? 401 : 404 });
  if (context.context.identity.role !== 'CLIENT_ADMIN') return NextResponse.json({ code: 'translation/forbidden', message: 'You are not authorized to generate translations.' }, { status: 403 });
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
    const firestore = getFirebaseAdminFirestore();
    const snapshot = await firestore.doc(`maps/${context.context.map.mapId}/liveCameras/${cameraId}`).get();
    const parsed = liveCameraSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success || parsed.data.mapId !== context.context.map.mapId || parsed.data.customerId !== context.context.map.customerId) return NextResponse.json({ code: 'translation/not-found', message: 'Camera not found.' }, { status: 404 });
    const name = typeof body.name === 'string' ? body.name : parsed.data.name;
    if (!name.trim()) return NextResponse.json({ code: 'translation/no-source-content', message: 'Camera name has no source content.' }, { status: 400 });
    const description = typeof body.description === 'string' ? body.description : parsed.data.description ?? '';
    const targets = context.context.map.enabledLanguages.filter((language) => language !== context.context.map.defaultLanguage);
    if (targets.length === 0) return NextResponse.json({ code: 'translation/no-target-languages', message: 'No target languages are enabled.' }, { status: 400 });
    const result = await generateFieldTranslations({
      name: { source: name, translations: parsed.data.translations?.name, metadata: parsed.data.translationMetadata },
      description: { source: description, translations: parsed.data.translations?.description, metadata: parsed.data.translationMetadata },
    }, context.context.map.defaultLanguage, targets, new GoogleCloudTranslationProvider());
    const fields = result.fields as Readonly<Record<string, GeneratedFieldTranslations>>;
    return NextResponse.json({ translations: { name: fields.name?.translations, description: fields.description?.translations }, translationMetadata: { name: fields.name?.translationMetadata.name ?? {}, description: fields.description?.translationMetadata.description ?? {} }, generatedLanguages: result.generatedLanguages });
  } catch (error) {
    const message = error instanceof Error && error.message.includes('configuration') ? 'Translation is not configured on the server.' : 'Translation could not be generated.';
    return NextResponse.json({ code: message.includes('configured') ? 'translation/configuration' : 'translation/provider-failure', message }, { status: message.includes('configured') ? 503 : 503 });
  }
}
