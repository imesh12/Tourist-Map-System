import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse, type NextRequest } from 'next/server';
import { mapSchema, type PoiParsed } from 'validation';
import { isTrustedOrigin } from '@/lib/auth/origin-check';
import { getFirebaseAdminFirestore } from '@/lib/firebase/admin';
import type { ExternalPoiLocalizedDetails, ExternalPoiPlaceMetadata } from '@/lib/pois/external-provider';
import type { PoiProviderLocalization, PublicContentLanguage } from 'shared-types';
import { getExternalPoiProvider } from '@/lib/pois/provider-registry';
import { buildPublicationContent } from '@/lib/tenant/build-publication-snapshot';
import { generatePublicationId } from '@/lib/tenant/generate-publication-id';
import { loadTenantCategories } from '@/lib/tenant/load-categories';
import { loadTenantLiveCameras } from '@/lib/tenant/load-live-cameras';
import { loadTenantMenuItems } from '@/lib/tenant/load-menu-items';
import { loadTenantPages } from '@/lib/tenant/load-pages';
import { loadTenantPois } from '@/lib/tenant/load-pois';
import { getOwnedMapContext, isIdentityDenialReason } from '@/lib/tenant/map-context';

/**
 * Photo Experience Prototype checkpoint (rich-detail expansion) — resolves
 * the public-safe Google place metadata to FREEZE onto this publication's
 * `PublishedPoi.place` (§4: "snapshot stable public-safe place metadata at
 * Publish so draft changes remain invisible until Publish").
 *
 * One live Place Details call per `GOOGLE_PLACES` POI (bounded by a realistic
 * map's POI count; a Client-Admin action, not a hot path). Fails SOFT: no
 * provider configured, or a per-POI lookup that throws / returns nothing,
 * simply omits `place` for that POI — a publish is never blocked by Google.
 *
 * SKU: `PLACE_METADATA_FIELD_MASK` (google-places-provider.ts) includes
 * Enterprise + Atmosphere Place Details fields, so each of these calls bills
 * at that tier.
 */
async function resolvePlaceMetadata(pois: readonly PoiParsed[]): Promise<Map<string, ExternalPoiPlaceMetadata>> {
  const result = new Map<string, ExternalPoiPlaceMetadata>();
  const provider = getExternalPoiProvider();
  if (!provider) {
    return result;
  }
  const googlePois = pois.filter(
    (poi): poi is PoiParsed & { providerPlaceId: string } =>
      poi.sourceType === 'GOOGLE_PLACES' && Boolean(poi.provider) && Boolean(poi.providerPlaceId),
  );
  const resolved = await Promise.all(
    googlePois.map(async (poi) => {
      try {
        return [poi.poiId, await provider.getPlaceMetadata(poi.providerPlaceId)] as const;
      } catch {
        return [poi.poiId, undefined] as const;
      }
    }),
  );
  for (const [poiId, metadata] of resolved) {
    if (metadata) {
      result.set(poiId, metadata);
    }
  }
  return result;
}

async function resolveProviderLocalization(pois: readonly PoiParsed[], languages: readonly PublicContentLanguage[], firestore: ReturnType<typeof getFirebaseAdminFirestore>, mapId: string): Promise<Map<string, PoiProviderLocalization>> {
  const result = new Map<string, PoiProviderLocalization>();
  const provider = getExternalPoiProvider();
  if (!provider) return result;
  const targets = pois.filter((poi): poi is PoiParsed & { providerPlaceId: string } => poi.sourceType === 'GOOGLE_PLACES' && Boolean(poi.providerPlaceId));
  await Promise.all(targets.map(async (poi) => {
    const existing = poi.providerLocalization;
    const values: Record<string, ExternalPoiLocalizedDetails> = {};
    for (const language of languages) {
      if (existing?.name?.[language] && existing?.address?.[language] && existing?.primaryTypeDisplayName?.[language] && existing?.weekdayDescriptions?.[language]) continue;
      const cacheRef = firestore.doc(`maps/${mapId}/providerLocalizations/GOOGLE_PLACES_${encodeURIComponent(poi.providerPlaceId)}_${language}`);
      const cacheSnap = await cacheRef.get();
      const cached = cacheSnap.exists ? cacheSnap.data() as Partial<CachedPlaceLocalization> : undefined;
      const fetchedAt = typeof cached?.fetchedAt === 'string' ? Date.parse(cached.fetchedAt) : NaN;
      const cachedValue = isCachedLocalizedDetails(cached?.value) ? cached.value : undefined;
      if (cached?.provider === 'GOOGLE_PLACES' && cached.providerPlaceId === poi.providerPlaceId && cached.language === language && Number.isFinite(fetchedAt) && Date.now() - fetchedAt < LOCALIZED_CACHE_TTL_MS) { if (cachedValue) values[language] = cachedValue; continue; }
      try { const localized = await provider.getPlaceLocalizedDetails(poi.providerPlaceId, language); await cacheRef.set({ provider: 'GOOGLE_PLACES', providerPlaceId: poi.providerPlaceId, language, fetchedAt: new Date().toISOString(), ...(localized ? { value: localized } : {}) }); if (localized) values[language] = localized; } catch { if (cachedValue) values[language] = cachedValue; }
    }
    const names = { ...(existing?.name ?? {}) }; const addresses = { ...(existing?.address ?? {}) }; const types = { ...(existing?.primaryTypeDisplayName ?? {}) }; const weekdays: Partial<Record<PublicContentLanguage, readonly string[]>> = { ...(existing?.weekdayDescriptions ?? {}) };
    for (const [language, value] of Object.entries(values)) { if (value.name) names[language as PublicContentLanguage] = value.name; if (value.address) addresses[language as PublicContentLanguage] = value.address; if (value.primaryTypeDisplayName) types[language as PublicContentLanguage] = value.primaryTypeDisplayName; if (value.weekdayDescriptions) weekdays[language as PublicContentLanguage] = value.weekdayDescriptions; }
    const merged: PoiProviderLocalization = { provider: 'GOOGLE_PLACES', name: names, address: addresses, primaryTypeDisplayName: types, weekdayDescriptions: weekdays };
    if (Object.keys(merged.name ?? {}).length || Object.keys(merged.address ?? {}).length || Object.keys(merged.primaryTypeDisplayName ?? {}).length || Object.keys(merged.weekdayDescriptions ?? {}).length) result.set(poi.poiId, merged);
  }));
  return result;
}

/**
 * `POST /api/maps/{mapId}/publish` — checkpoint 1B.8 §11/§12, see
 * docs/architecture/PUBLISHING_ARCHITECTURE.md.
 *
 * The ONLY place a `maps/{mapId}/publications/{publicationId}` document is
 * ever created, and the ONLY place `maps/{mapId}.publication` is ever
 * written — never client-writable directly (Firestore rules deny every
 * client write to both paths; see firebase/functions/test/security-rules/
 * firestore.rules.test.ts's "publications subcollection" block). Same
 * trusted-mutation boundary every other map-scoped write route already
 * uses: `isTrustedOrigin` → `getOwnedMapContext(mapId)` → CLIENT_ADMIN role
 * check → authoritative Firestore reads → write. The browser sends no body
 * at all — it only ever ASKS the server to publish; every byte of the
 * resulting snapshot is derived server-side from the map's own already-
 * verified draft content, never from anything the request supplies (§11:
 * "never accept an arbitrary publication snapshot from browser").
 *
 * Publishes the SAVED Firestore draft only — never unsaved browser state
 * (§14/§17: that distinction is what the live editor preview / draft
 * tourist preview modal are for). `loadTenantCategories`/`loadTenantPois`/
 * `loadTenantMenuItems` are the exact same trusted, already-tenant-scoped
 * loaders every other route already uses; `buildPublicationContent()`
 * (lib/tenant/build-publication-snapshot.ts) applies every "fail closed,
 * only enabled/valid content" rule §13 specifies, reusing
 * `buildPublicMenuProjection()` verbatim rather than recreating menu logic.
 *
 * Atomicity (§12): the map document is re-read and re-validated INSIDE a
 * Firestore transaction, which is also where the next `version` number is
 * computed and both writes (the new immutable publication document, and the
 * map's own `publication` pointer update) are committed together — either
 * both happen or neither does. Categories/POIs/menu items are read just
 * before the transaction (not inside it): a rare edit landing in the
 * fraction of a second between that read and the transaction's commit would
 * at most make one publish reflect content that is a moment stale, which is
 * an acceptable tradeoff for this checkpoint's scope (§12's own atomicity
 * requirement is specifically about the publication-document-plus-pointer
 * WRITE pair never landing only half-done, which this transaction
 * guarantees regardless).
 *
 * Checkpoint 1B.8 repair round — real bug fixed here: `buildPublicationContent()`
 * MUST be called with the map data read FRESH, from inside the transaction
 * (`mapParsed.data` below), never with the earlier `result.context.map` from
 * `getOwnedMapContext()` at the top of this handler. The transaction already
 * re-reads and re-validates the map document for exactly the reason stated
 * above ("never trusts an ownership check that is even a few reads old for a
 * write this consequential") — the previous version of this file re-read
 * the map fresh inside the transaction ONLY to check `customerId`, then
 * discarded that fresh read and built the publication's `map` content from
 * the older, pre-transaction `result.context.map` anyway. That is precisely
 * the bug behind "publication version 2 uses the OLD map name": if the map's
 * `name` (or any other field) changed between `getOwnedMapContext()` being
 * called at the top of this request and the transaction committing, the
 * published snapshot would silently carry the stale value even though the
 * transaction had already proven a fresher one existed. Categories/POIs/menu
 * items keep the documented "read just before the transaction" tradeoff
 * above — only the MAP document itself needs this fix, because it is the
 * one piece of content this function was already re-reading fresh for an
 * unrelated reason (ownership) and then not using.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

class PublishMapGoneError extends Error {}
const LOCALIZED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
interface CachedPlaceLocalization { readonly provider: 'GOOGLE_PLACES'; readonly providerPlaceId: string; readonly language: PublicContentLanguage; readonly fetchedAt: string; readonly value?: ExternalPoiLocalizedDetails; }

function isCachedLocalizedDetails(value: unknown): value is ExternalPoiLocalizedDetails {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.language !== 'string') return false;
  if (candidate.name !== undefined && typeof candidate.name !== 'string') return false;
  if (candidate.address !== undefined && typeof candidate.address !== 'string') return false;
  if (candidate.primaryTypeDisplayName !== undefined && typeof candidate.primaryTypeDisplayName !== 'string') return false;
  if (candidate.weekdayDescriptions !== undefined && (!Array.isArray(candidate.weekdayDescriptions) || candidate.weekdayDescriptions.some((line) => typeof line !== 'string'))) return false;
  return true;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ code: 'map/unauthorized', message: 'Request not allowed.' }, { status: 403 });
  }

  const { mapId } = await params;
  const result = await getOwnedMapContext(mapId);
  if (!result.ok) {
    if (isIdentityDenialReason(result.reason)) {
      return NextResponse.json({ code: 'map/unauthorized', message: 'You must be signed in with a fully set-up account.' }, { status: 401 });
    }
    return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
  }

  if (result.context.identity.role !== 'CLIENT_ADMIN') {
    return NextResponse.json({ code: 'map/forbidden', message: 'Only a Client Admin can publish a map.' }, { status: 403 });
  }

  const resolvedMapId = result.context.map.mapId;
  const resolvedCustomerId = result.context.identity.customer.customerId;
  const publishedByUid = result.context.identity.uid;

  const [categories, pois, menuItems, pages, liveCameras] = await Promise.all([
    loadTenantCategories(resolvedMapId),
    loadTenantPois(resolvedMapId),
    loadTenantMenuItems(resolvedMapId),
    loadTenantPages(resolvedMapId),
    loadTenantLiveCameras(resolvedMapId),
  ]);

  // Rich-detail expansion — resolved just before the transaction, alongside
  // the content loads (same "a rare edit landing in the fraction of a second
  // before commit is at most a moment stale" tradeoff the file header
  // already documents for categories/pois).
  const placeMetadataByPoiId = await resolvePlaceMetadata(pois);
  const firestore = getFirebaseAdminFirestore();
  const providerLocalizationByPoiId = await resolveProviderLocalization(pois, result.context.map.enabledLanguages, firestore, resolvedMapId);

  const publicationId = generatePublicationId();

  try {
    const outcome = await firestore.runTransaction(async (transaction) => {
      const mapRef = firestore.doc(`maps/${resolvedMapId}`);
      const mapSnap = await transaction.get(mapRef);
      if (!mapSnap.exists) {
        throw new PublishMapGoneError();
      }
      const mapParsed = mapSchema.safeParse(mapSnap.data());
      // Re-verified against the freshest read, not merely trusted from the
      // earlier `getOwnedMapContext()` resolution — this never trusts an
      // ownership check that is even a few reads old for a write this
      // consequential, even though `customerId` never actually changes
      // after creation.
      if (!mapParsed.success || mapParsed.data.customerId !== resolvedCustomerId) {
        throw new PublishMapGoneError();
      }

      // §14/§17 + this repair round's fix: the published `map` content is
      // built from THIS freshly re-read `mapParsed.data`, not from the
      // `result.context.map` resolved at the top of the request — see the
      // file header comment for exactly why that distinction is the fix for
      // "publication version 2 uses the old map name".
      const content = buildPublicationContent(mapParsed.data, categories, pois, menuItems, pages, placeMetadataByPoiId, liveCameras, providerLocalizationByPoiId);

      const nextVersion = (mapParsed.data.publication?.version ?? 0) + 1;
      const publishedAt = FieldValue.serverTimestamp();
      const publicationRef = firestore.doc(`maps/${resolvedMapId}/publications/${publicationId}`);

      transaction.set(publicationRef, {
        schemaVersion: 1,
        publicationId,
        mapId: resolvedMapId,
        customerId: resolvedCustomerId,
        version: nextVersion,
        publishedAt,
        publishedByUid,
        map: content.map,
        // checkpoint 1B.17A — captured onto the published snapshot itself;
        // see `PublicationContent.defaultLanguage`'s own doc comment
        // (lib/tenant/build-publication-snapshot.ts) for why this is a copy
        // taken at publish time, not a live reference to the map document.
        defaultLanguage: content.defaultLanguage,
        supportedLanguages: content.supportedLanguages,
        menu: content.menu,
        categories: content.categories,
        pois: content.pois,
        pages: content.pages,
        // LIVE CAMERAS FOUNDATION checkpoint — unconditional, like `pages`/
        // `pois`/`categories` (never conditionally like `photoProviderRefs`):
        // `content.liveCameras` is always a real array (possibly `[]`), and
        // `mapPublicationSnapshotSchema.liveCameras` is a required,
        // `.default([])` field on read, so writing the key unconditionally
        // keeps every future read simple.
        liveCameras: content.liveCameras,
        ...(Object.keys(content.photoProviderRefs).length > 0 ? { photoProviderRefs: content.photoProviderRefs } : {}),
      });

      transaction.update(mapRef, {
        publication: {
          currentPublicationId: publicationId,
          version: nextVersion,
          publishedAt,
          publishedByUid,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { version: nextVersion };
    });

    return NextResponse.json({ ok: true, publicationId, version: outcome.version }, { status: 201 });
  } catch (error) {
    if (error instanceof PublishMapGoneError) {
      return NextResponse.json({ code: 'map/not-found', message: 'Map not found.' }, { status: 404 });
    }
    throw error;
  }
}
