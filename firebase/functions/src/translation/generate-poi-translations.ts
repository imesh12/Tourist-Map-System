import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { mapIdSchema, mapSchema, poiIdSchema } from 'validation';
import { getAdminAuth, getAdminFirestore } from '../firebase-admin.js';
import { GoogleCloudTranslationProvider, generatePoiTranslationsForPoi, hasClientAdminClaims, resolvePoiSourceText, type GeneratePoiTranslationsInput } from 'translation-server';

export { generatePoiTranslationsForPoi, hasClientAdminClaims, resolvePoiSourceText } from 'translation-server';
export type { GeneratePoiTranslationsInput, GeneratePoiTranslationsResult, GeneratePoiTranslationsDependencies } from 'translation-server';

export const generatePoiTranslations = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'You must be signed in as a Client Admin.', { code: 'translation/unauthorized' });
  const user = await getAdminAuth().getUser(request.auth.uid);
  const claims = user.customClaims ?? {};
  if (!hasClientAdminClaims(claims)) throw new HttpsError('permission-denied', 'You must be signed in as a Client Admin.', { code: 'translation/forbidden' });
  const input = request.data as Partial<GeneratePoiTranslationsInput>;
  if (typeof input.mapId !== 'string' || !mapIdSchema.safeParse(input.mapId).success || typeof input.poiId !== 'string' || !poiIdSchema.safeParse(input.poiId).success) throw new HttpsError('invalid-argument', 'Invalid translation request.', { code: 'translation/invalid-input' });
  const firestore = getAdminFirestore();
  const mapSnap = await firestore.doc(`maps/${input.mapId}`).get();
  const map = mapSchema.safeParse(mapSnap.data());
  if (!mapSnap.exists || !map.success || map.data.customerId !== claims.customerId) throw new HttpsError('not-found', 'Map not found.', { code: 'translation/map-not-found' });
  try {
    return await generatePoiTranslationsForPoi({ mapId: input.mapId, poiId: input.poiId }, { firestore, provider: new GoogleCloudTranslationProvider() });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Translation could not be generated.', { code: 'translation/provider-failure' });
  }
});
