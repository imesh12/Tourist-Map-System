# Publishing Architecture — Draft/Preview/Publish Foundation

**Status:** Current implementation is checkpoint 1B.8 ("Preview + Publish Foundation + Map Settings UX Repair"). This is a **foundation** checkpoint: it establishes the Draft → Saved Draft → Publish → Immutable Snapshot → Public Read model and a minimal, real public read endpoint, but it deliberately does **not** build the final tourist-facing End User map UI (marker cards, audio guide, QR routing, events, live cameras, ranking, model courses) — see §8 ("What this checkpoint does not build") and the checkpoint's own "do not overbuild" instruction.
**Location:** `docs/architecture/PUBLISHING_ARCHITECTURE.md`
**Related:** `docs/architecture/CATEGORY_ARCHITECTURE.md` (categories/POIs/menu items this checkpoint publishes), `docs/architecture/MAP_THEME_ARCHITECTURE.md` (the `MapTheme` this checkpoint's snapshot always carries fully resolved), `docs/architecture/SYSTEM_BLUEPRINT.md` §10/§12 (the longer-term, richer `PublishedMapConfig` contract this checkpoint is a deliberately narrower first step toward — see §7 below for how the two relate).

---

## 1. The core distinction: Draft vs Published

Every piece of CMS content in this codebase — a map's settings, its categories, its POIs, its menu items, its theme, its branding — lives in exactly one place until this checkpoint: the live, mutable **draft** (`maps/{mapId}` and its `categories`/`pois`/`menuItems` subcollections). Saving a form in `/admin/maps/{mapId}/...` always writes to the draft, and only the draft. This was already true before 1B.8 and remains unchanged.

What 1B.8 adds is a second, distinct place content can live: an immutable **publication snapshot** (`maps/{mapId}/publications/{publicationId}`), created only by an explicit, deliberate **Publish** action. A future public tourist-facing consumer (Web, Embed, and eventually Android) reads *only* from a publication snapshot — never from the draft collections directly.

**"Save != Publish" is the single most important invariant this checkpoint establishes.** Editing and saving a map's settings, categories, POIs, menu, branding, or theme must never, by itself, change what a tourist sees on an already-published map. The only thing that changes a publication is a Publish.

## 2. The five distinct states

| State | What it is | Where it lives | Who/what produces it |
|---|---|---|---|
| **Unsaved local state** | Whatever is currently typed/selected in the Map Settings form's own React state, not yet sent to the server | Browser memory only | Every keystroke/selection in the editor |
| **Saved Draft** | The last state a Save actually persisted | `maps/{mapId}` + its subcollections | `PATCH /api/maps/{mapId}/settings` (and the equivalent category/POI/menu-item routes) |
| **Live Editor Preview** | The map preview rendered inline in the Map Settings page, to the right of the form | Never persisted — a pure rendering of current unsaved local state | `MapPreview`/`google-maps-preview.tsx`, fed `previewTheme`/`previewBranding` computed from live form state |
| **Draft Tourist Preview** | The large modal opened by the Preview button, showing what a tourist-facing preview of the *current unsaved browser state* would look like | Never persisted — same unsaved local state, rendered larger, in a `role="dialog"` | `DraftPreviewModal` (`components/draft-preview-modal.tsx`) |
| **Publication Snapshot** | The immutable, versioned, server-built public content | `maps/{mapId}/publications/{publicationId}` | `POST /api/maps/{mapId}/publish` only |

A sixth, implicit state — **Current Publication** — is not separate storage; it is a *pointer*: `maps/{mapId}.publication.currentPublicationId`, naming which publication document is the one a public reader should currently see (§4).

## 3. Data flow per action

**Live editing (no network call):** every field change updates React state → `previewTheme`/`previewBranding` (derived, memoized) → the inline `MapPreview` re-renders immediately. Nothing is sent to the server. This is what checkpoint 1B.8 §5 requires ("live editing preview... must update immediately for unsaved changes").

**Preview button:** opens `DraftPreviewModal`, fed the *exact same* `previewTheme`/`previewBranding`/current form values the inline preview already computes — not a second, independent preview construction, and not a fetch to any endpoint. The modal is explicitly labeled "Draft Preview" and states "This is not the published public map" (checkpoint 1B.8 §6/§17), so nobody mistakes it for real tourist-facing output. Closing it (Close button or Escape) discards nothing — it was never persisted in the first place.

**Save:** `handleSubmit` in `map-settings-form.tsx` validates the current form state with `mapSettingsUpdateSchema` and sends it to `PATCH /api/maps/{mapId}/settings`. On success, the "last known saved" snapshot (`savedPayloadJson`) is updated, which clears the "Unsaved Map Settings" indicator. This writes the Saved Draft. It never touches `maps/{mapId}/publications/*` or the `publication` pointer.

**Publish:** `handlePublish` calls `POST /api/maps/{mapId}/publish` with **no request body at all**. The server:
1. Verifies the caller via `isTrustedOrigin` → `getOwnedMapContext(mapId)` → `role === 'CLIENT_ADMIN'`.
2. Loads the map's own authoritative Firestore draft — the map document itself, plus `loadTenantCategories`/`loadTenantPois`/`loadTenantMenuItems` (the same trusted, tenant-scoped loaders every other route already uses).
3. Derives exactly what should be published via `buildPublicationContent()` (a pure function, §5 below).
4. Inside a single Firestore transaction: re-reads and re-verifies the map document, computes the next version number, writes the new immutable publication document, and updates the map's own `publication` pointer — atomically (§6).

The browser never constructs, sends, or otherwise controls a single byte of the resulting snapshot. It can only *ask* the server to publish the map's current saved draft.

**Public read:** `GET /api/public/maps/{mapId}` reads `maps/{mapId}.publication.currentPublicationId`, then reads that one publication document, and returns a narrowed projection of it (`PublicMapSnapshot` — customerId/publishedByUid stripped). It never reads `maps/{mapId}`'s own draft fields (name, area, branding, theme, etc.) for its response — only the pointer field, to know *which* publication to serve.

## 4. Firestore shape

```
maps/{mapId}                              (existing, unchanged shape + one new optional field)
  publication?: {
    currentPublicationId: string          # which publications/* doc is "live"
    version: number
    publishedAt: Timestamp
    publishedByUid: string
  }

maps/{mapId}/publications/{publicationId} (new, checkpoint 1B.8)
  schemaVersion: 1
  publicationId: string
  mapId: string
  customerId: string                      # server-audit only, stripped from public reads
  version: number                         # 1, 2, 3, ... monotonically increasing per map
  publishedAt: Timestamp
  publishedByUid: string                  # server-audit only, stripped from public reads
  map: { name, mapProvider, area, branding?, theme }   # theme always fully resolved
  menu: PublicationMenuItem[]             # buildPublicMenuProjection() output, verbatim
  categories: PublishedCategory[]         # enabled categories only
  pois: PublishedPoi[]                    # enabled POIs under an included category only
```

`maps/{mapId}/publications/{publicationId}` was chosen over the longer-term `publishedMaps/{mapId}/versions/{versionId}` top-level collection SYSTEM_BLUEPRINT.md documents for a future Phase 1J Publish Engine, because it mirrors every other map-owned collection already in this codebase (`categories`, `pois`, `menuItems` are all `maps/{mapId}/{collection}/{id}`) rather than introducing a second, differently-shaped top-level collection for one more piece of map-owned data. SYSTEM_BLUEPRINT's design remains the aspirational long-term target; nothing here forecloses migrating to it later (§7).

## 5. Content-selection rules (what gets published)

Implemented once, as a pure function — `buildPublicationContent()` (`apps/admin-web/lib/tenant/build-publication-snapshot.ts`), unit-tested directly in `build-publication-snapshot.test.ts` — not inline in the route handler:

- **Categories:** only `enabled: true` categories are included. A disabled category is completely absent from the snapshot (not merely hidden).
- **Menu:** delegated entirely to the existing, already-heavily-tested `buildPublicMenuProjection()` (checkpoint 1B.5) — never reimplemented. Its own rules (disabled menu item excluded, broken/disabled category reference excluded, unreleased feature key excluded) apply unchanged.
- **POIs:** only `status === 'ENABLED'` POIs whose `categoryId` resolves to one of the already-selected enabled categories. A POI referencing a disabled or nonexistent category is silently excluded — never published with a dangling reference.
- **Google Places Discover candidates:** never published, by construction rather than by an extra check — a Discover candidate is never written to `maps/{mapId}/pois/*` at all (`POST /api/maps/{mapId}/pois/discover` only ever returns ephemeral results; nothing is persisted until a separate, explicit `.../pois/import` call), so it can never appear in `buildPublicationContent()`'s own input to begin with. Only already-imported (persisted) Google Places POIs are ever eligible.
- **Theme:** always fully resolved — `map.theme ?? DEFAULT_MAP_THEME` — so a future public consumer never has to reimplement that fallback itself.

All of this is **fail-closed**: a broken reference is excluded, never thrown as an error that would block the whole publish.

## 6. Immutability and versioning

A publication document, once written, is never updated or deleted by any code path in this codebase. Publishing again always creates a **new** document (`version` = previous `+ 1`) and moves the `maps/{mapId}.publication` pointer to it — it never mutates the previous version. This is enforced structurally (no route or function anywhere calls `.update()`/`.set()` a second time against an existing `publications/{publicationId}` document), and proven by `map-publishing.spec.ts`'s "a second Publish creates version 2, version 1 remains byte-for-byte unchanged" test.

Both writes — the new publication document, and the map's own pointer update — happen inside one Firestore transaction, which also re-reads the map document to compute the correct next version. This guarantees the pair is atomic: either both writes land, or neither does. There is no window where a partial publish (a new publication document exists but the pointer wasn't updated, or vice versa) is observable.

## 7. Relationship to the future `PublishedMapConfig` contract

SYSTEM_BLUEPRINT.md's documented Phase 1J Publish Engine describes a richer `PublishedMapConfig` — languages, events, live cameras, feature settings, a `publishedMaps/{mapId}/versions/{versionId}` top-level collection. This checkpoint's `MapPublicationSnapshot` (`schemaVersion: 1`) is a deliberately narrower **first step** toward that eventual contract, not a competing design: it already carries a `schemaVersion` tag specifically so a future, richer shape can be introduced (`schemaVersion: 2`, etc.) without breaking already-published `schemaVersion: 1` documents, and the map-scoped subcollection location can be migrated later without changing the publish/version/pointer *semantics* established here.

## 8. What this checkpoint does not build

Per the checkpoint's own explicit scope: the final tourist-facing End User map UI (marker cards, audio guide UI, QR routing UI), Events, Live Cameras, Android, Super Admin, custom domains, templates/clone-map, and bulk hotel creation are all out of scope. `GET /api/public/maps/{mapId}` exists only to prove the public read boundary works correctly (returns the latest published snapshot, never draft data, never customerId/publishedByUid) — it is a foundation for a future public renderer, not the renderer itself.

## 9. Security model

- **Publish is CLIENT_ADMIN-only**, enforced server-side (`result.context.identity.role !== 'CLIENT_ADMIN'` → 403), matching every other privileged map-scoped write in this codebase.
- **`POST /api/maps/{mapId}/publish` accepts no request body.** There is nothing for a forged payload to smuggle — the entire snapshot is derived server-side from the caller's own already-verified draft. A request body, even one carrying a fabricated `mapId`/`customerId`/`version`/full snapshot, is never read at all.
- **Cross-tenant publish is denied** the same anti-enumeration way every other map-scoped route already denies it (`getOwnedMapContext(mapId)` collapses "doesn't exist" and "exists but isn't yours" into the same generic `map/not-found` 404).
- **Signed-out publish is denied** (401) before any Firestore read happens at all.
- **`GET /api/public/maps/{mapId}` is deliberately unauthenticated** (no `isTrustedOrigin` check) — it is the one route meant to be readable from any origin, since a plain `GET` mutates nothing and a public tourist map by definition has no signed-in caller. "Map exists but was never published" and "map does not exist at all" are collapsed into the identical `public-map/not-found` 404, the same anti-enumeration principle applied to an unauthenticated caller.
- **Firestore rules require no change.** The existing deny-by-default fallback (`match /{document=**} { allow read, write: if false; }`, unchanged since checkpoint 1A.6) already denies every client read/write to `maps/{mapId}/publications/*` — exactly as it already does for `categories`/`pois`/`menuItems`. New tests in `firebase/functions/test/security-rules/firestore.rules.test.ts`'s "maps/{mapId}/publications subcollection" block prove this holds, including for the map's own admin (not merely an unrelated tenant) and for the map document's own `publication` pointer field specifically.

## 10. Multi-map independence

Publishing is entirely map-scoped: `maps/{mapId}/publications/*` and `maps/{mapId}.publication` are both keyed off one specific `mapId`. Publishing map A never reads, writes, or otherwise touches map B's documents, even when both maps belong to the same tenant/customer. Proven directly by `map-publishing.spec.ts`'s "publishing one map never affects a second map under the same tenant" test.

## 11. Backward compatibility

Every map created before checkpoint 1B.8 has no `publication` field at all. `mapSchema` keeps `publication` optional (mirroring how `branding`/`theme` were made optional in their own checkpoints), so every such map continues to parse and render normally. `/admin/maps/{mapId}/settings` renders "Never published" for any map with no `publication` field, and `GET /api/public/maps/{mapId}` correctly reports `public-map/not-found` for it (not an error) — an old map is simply an unpublished map, not a broken one. No destructive migration was needed or performed.

## 12. Unsaved-vs-Publish guard

Publish always republishes the **saved** draft — the server has no notion of "unsaved browser state" at all, by design (it never receives one). The Map Settings form additionally disables the Publish button, with the hint "Save changes before publishing.", whenever local unsaved changes exist (`hasUnsavedMapSettingsChanges`, a local `useState`-snapshot comparison — see that field's own doc comment in `map-settings-form.tsx` for why this is explicitly scoped as browser-local UI polish, not a server-backed whole-map dirty-state system). This is defense-in-depth on top of the structural guarantee above, not the only thing preventing an unsaved value from ever reaching a publication.

**A note on what "Unsaved Map Settings" does and does not track:** the local dirty-flag above only covers the Map Settings form's own fields (name/provider/style/area/branding/theme). It does not yet track whether categories, POIs, or menu items have draft changes relative to the last publication — building a reliable, server-backed, whole-map "does the current draft differ from what's published" indicator (comparing every collection, not just Map Settings) is intentionally deferred past this checkpoint, per §15 of the checkpoint spec ("if a reliable whole-map dirty state is too large for 1B.8, implement conservatively... document future whole-map draft revision tracking rather than lying"). The publication status UI instead shows exactly what it can reliably know: Never published / Published — version N / Last published \<time\>, plus the separate, explicitly-scoped "Unsaved Map Settings" badge.
