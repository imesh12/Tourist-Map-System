import type { PageStatus } from './enums.js';
import type { CustomerId, MapId, PageId } from './ids.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/**
 * `maps/{mapId}/pages/{pageId}` — checkpoint 1B.11, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md's "categories vs. content
 * items" distinction, extended here to a second, independent content kind.
 * Nested under its owning map, exactly like `Category`/`Poi`/`MenuItem` —
 * not a top-level collection (§3 of the checkpoint: "Do NOT introduce
 * top-level tenant-global pages").
 *
 * A Page is reusable INFORMATIONAL content, deliberately NOT a POI: a POI
 * answers "where is this place?" (it always carries a `location` and always
 * belongs to a `Category`); a Page answers "what should the tourist read?"
 * — it has no location, no category, and creates no map marker
 * (`buildPublicationContent()`, apps/admin-web/lib/tenant/
 * build-publication-snapshot.ts, never derives a `PublishedPoi` from a
 * `Page`).
 *
 * `customerId`/`mapId` are stored explicitly (not merely implied by the
 * Firestore path), the same defense-in-depth pattern `Category`/`Poi`/
 * `MenuItem` already establish — both are written exclusively by trusted
 * backend code and are never derived from, or overwritable by, client
 * input.
 *
 * `content` is plain text — checkpoint 1B.11 §4 is explicit: no arbitrary
 * HTML storage/rendering this checkpoint. Line breaks are preserved by safe
 * CSS (`white-space: pre-wrap`) wherever a Page is rendered
 * (`apps/tourist-web/components/public-map/page-overlay.tsx`), never by
 * storing/interpreting markup, and no consumer of this field ever uses
 * `dangerouslySetInnerHTML`.
 *
 * Deliberately the SMALLEST robust model the checkpoint asks for — no
 * `order` (a Page has no independent list position of its own; where it
 * appears in public navigation, and in what order, is a `MenuItem`'s
 * concern, exactly like `Category` vs. `MenuItemCategory`), no media/image
 * gallery, no audio, no translations, no SEO fields, no template selection,
 * no block editor, no arbitrary HTML — every one of those is explicitly out
 * of scope for this checkpoint (§3) and deliberately deferred to a later,
 * dedicated checkpoint rather than spec'd speculatively here.
 */
export interface Page {
  readonly pageId: PageId;
  readonly customerId: CustomerId;
  readonly mapId: MapId;
  readonly title: string;
  readonly content: string;
  readonly status: PageStatus;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}
