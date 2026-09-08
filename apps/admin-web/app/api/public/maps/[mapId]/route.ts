import { NextResponse, type NextRequest } from 'next/server';
import type { PublicMapSnapshot } from 'shared-types';
import { loadCurrentPublication } from '@/lib/tenant/load-current-publication';

/**
 * `GET /api/public/maps/{mapId}` — checkpoint 1B.8 §16, the minimal public
 * read boundary for a future public tourist-facing consumer. See
 * docs/architecture/PUBLISHING_ARCHITECTURE.md's "Public Read Boundary"
 * section — this checkpoint explicitly does NOT build the End User map UI
 * itself (§25); this route only proves the data can be safely read.
 *
 * Deliberately unauthenticated — no `isTrustedOrigin`/session check. This is
 * the one route in this codebase meant to be readable from any origin: a
 * public tourist map by definition has no signed-in caller, and a plain GET
 * mutates nothing, so the CSRF concern every other route's `isTrustedOrigin`
 * check exists for does not apply here.
 *
 * `mapId` currently doubles as the public identifier — a `mapId` is already
 * treated as a non-secret, opaque identifier everywhere else in this
 * codebase (it appears directly in every `/admin/maps/{mapId}/**` browser
 * URL). §16 explicitly permits this ("If using mapId publicly is
 * undesirable, add a deliberate publicId/slug architecture") — a separate
 * slug is a deliberately deferred enhancement, documented but not built
 * this checkpoint, per §25's "do not overbuild" instruction.
 *
 * Returns ONLY the latest PUBLISHED snapshot — never draft `maps/{mapId}`
 * content, and never a map that has never been published. "Never published"
 * and "does not exist" are deliberately collapsed into the exact same 404 —
 * the same anti-enumeration principle `getOwnedMapContext()` already applies
 * to authenticated tenant access (see that module's own doc comment),
 * extended here to an unauthenticated caller: a public visitor must never be
 * able to distinguish "this map doesn't exist" from "this map exists in
 * someone's dashboard but was never published."
 *
 * `customerId`/`publishedByUid` are never included in the response — built
 * via an explicit field-by-field pick (not a destructure-and-discard), the
 * same lint-clean convention this codebase already established (checkpoint
 * 1B.7's repair round: an underscore-prefixed discarded destructured
 * binding still trips `no-unused-vars` without a project-wide rule change,
 * which is out of scope here just like it was there).
 *
 * Photo Experience Prototype checkpoint: the map/publication lookup itself
 * moved into `loadCurrentPublication()` (lib/tenant/load-current-publication.ts)
 * — a pure refactor, same behavior, now shared with the new public photo
 * endpoints (`app/api/public/maps/[mapId]/pois/[poiId]/photo{,-meta}/route.ts`)
 * so the anti-enumeration lookup can never silently diverge between them.
 * `photoProviderRefs` (present on the FULL snapshot `loadCurrentPublication()`
 * returns) is still deliberately NOT added to `publicSnapshot` below — see
 * shared-types' `PublishedPoiPhotoProviderRef` doc comment for why that
 * field must never reach this response.
 */

interface RouteParams {
  readonly params: Promise<{ readonly mapId: string }>;
}

const NOT_FOUND_RESPONSE = { code: 'public-map/not-found', message: 'This map is not available.' } as const;

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const { mapId } = await params;

  const snapshot = await loadCurrentPublication(mapId);
  if (!snapshot) {
    return NextResponse.json(NOT_FOUND_RESPONSE, { status: 404 });
  }

  const publicSnapshot: PublicMapSnapshot = {
    schemaVersion: snapshot.schemaVersion,
    publicationId: snapshot.publicationId,
    mapId: snapshot.mapId,
    version: snapshot.version,
    publishedAt: snapshot.publishedAt,
    map: snapshot.map,
    // checkpoint 1B.17A — this route builds its response via an explicit
    // field-by-field pick (see this file's own header comment), never a
    // destructure-and-discard, which means every new field added to
    // `MapPublicationSnapshot`/`mapPublicationSnapshotSchema` must ALSO be
    // added here by hand — it is not automatically carried through just
    // because the parsed `snapshot` object already has it (bug found:
    // `defaultLanguage`/`supportedLanguages` were normalized correctly by
    // `mapPublicationSnapshotSchema.safeParse()` above, on both a real
    // multilingual publish and a legacy pre-1B.17A publication, but were
    // never copied into this hand-built object, so every public response
    // silently dropped them regardless of what the stored/parsed document
    // actually held). `photoProviderRefs` is DELIBERATELY never added here
    // — see this file's own header comment.
    defaultLanguage: snapshot.defaultLanguage,
    supportedLanguages: snapshot.supportedLanguages,
    menu: snapshot.menu,
    categories: snapshot.categories,
    pois: snapshot.pois,
    pages: snapshot.pages,
  };

  return NextResponse.json(publicSnapshot);
}
