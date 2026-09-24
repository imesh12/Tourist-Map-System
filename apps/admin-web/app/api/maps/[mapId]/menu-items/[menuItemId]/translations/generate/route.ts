import { NextResponse, type NextRequest } from 'next/server';
import { mapIdSchema, menuItemIdSchema, menuItemSchema } from 'validation';
import { generateFieldTranslations, GoogleCloudTranslationProvider } from 'translation-server';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

interface RouteParams { readonly params: Promise<{ readonly mapId: string; readonly menuItemId: string }> }

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) return NextResponse.json({ code: 'translation/forbidden', message: 'Request not allowed.' }, { status: 403 });
  const { mapId, menuItemId } = await params;
  if (!mapIdSchema.safeParse(mapId).success || !menuItemIdSchema.safeParse(menuItemId).success) return NextResponse.json({ code: 'translation/invalid-request', message: 'Invalid translation request.' }, { status: 400 });
  const context = await getOwnedMapContext(mapId);
  if (!context.ok) return NextResponse.json({ code: isIdentityDenialReason(context.reason) ? 'translation/unauthorized' : 'translation/not-found', message: isIdentityDenialReason(context.reason) ? 'Your Admin session has expired. Please sign in again.' : 'Map not found.' }, { status: isIdentityDenialReason(context.reason) ? 401 : 404 });
  if (context.context.identity.role !== 'CLIENT_ADMIN') return NextResponse.json({ code: 'translation/forbidden', message: 'You are not authorized to generate translations.' }, { status: 403 });
  try {
    const body = (await request.json().catch(() => ({}))) as { label?: unknown };
    const firestore = getFirebaseAdminFirestore();
    const snapshot = await firestore.doc(`maps/${context.context.map.mapId}/menuItems/${menuItemId}`).get();
    const parsed = menuItemSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success || parsed.data.mapId !== context.context.map.mapId || parsed.data.customerId !== context.context.map.customerId) return NextResponse.json({ code: 'translation/not-found', message: 'Menu item not found.' }, { status: 404 });
    const label = typeof body.label === 'string' ? body.label : parsed.data.label;
    if (!label.trim()) return NextResponse.json({ code: 'translation/no-source-content', message: 'Menu label has no source content.' }, { status: 400 });
    const targets = context.context.map.enabledLanguages.filter((language) => language !== context.context.map.defaultLanguage);
    if (targets.length === 0) return NextResponse.json({ code: 'translation/no-target-languages', message: 'No target languages are enabled.' }, { status: 400 });
    const result = await generateFieldTranslations({ label: { source: label, translations: parsed.data.translations?.label, metadata: parsed.data.translationMetadata } }, context.context.map.defaultLanguage, targets, new GoogleCloudTranslationProvider());
    const field = result.fields.label;
    return NextResponse.json({ translations: { label: field?.translations ?? {} }, translationMetadata: field?.translationMetadata ?? {}, generatedLanguages: result.generatedLanguages });
  } catch {
    return NextResponse.json({ code: 'translation/provider-failure', message: 'Translation could not be generated.' }, { status: 503 });
  }
}
