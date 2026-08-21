# Category CMS Architecture — Current State + Future-Ready Model

**Status:** Current implementation is checkpoint 1B.2 (categories), checkpoint 1B.3 (POIs/Spots — client-owned manual map content, §9 below), and checkpoint 1B.4 (Google Places source integration, Restaurant category first, §11 below). This document also records the **approved future architecture** that today's implementation is deliberately shaped to support without blocking it — sections explicitly marked "future" below are not implemented yet.
**Location:** `docs/architecture/CATEGORY_ARCHITECTURE.md`
**Related:** `docs/stages/STAGE_1B_TECHNICAL_PLAN.md` (1B.2's original scope), `docs/architecture/SYSTEM_BLUEPRINT.md` §3/§11 (Stage 3 Super Admin, branding/theme controlled-configuration precedent).

---

## 1. Current state (implemented)

`maps/{mapId}/categories/{categoryId}` — see `packages/shared-types/src/category.ts`. Every category today is created directly by a Client Admin through `/admin/categories`, going through the one trusted mutation boundary (`GET`/`POST /api/map/categories`, `PATCH /api/map/categories/{categoryId}`, all `getCurrentClientContext()`-gated, `CLIENT_ADMIN`-only writes). `sourceType` is stamped `'CLIENT_CUSTOM'` server-side on every create; `platformCategoryId` is never set by any code path today.

## 2. The approved future distinction

Four concepts must not be confused, per the approved future flow:

```
SUPER ADMIN
  → releases approved PLATFORM CATEGORY / FEATURE definitions
CLIENT ADMIN
  → enables/customizes them as a TENANT CATEGORY CONFIG
  → adds CLIENT CUSTOM CONTENT (manual POIs/events) under a category
  → optionally adds categories/features to Menu Builder
END USER MAP
  → sees only client-enabled + published configuration
```

| Concept | Owner | Exists today? |
|---|---|---|
| **Platform category definition** (`PlatformCategoryDefinition`, `packages/shared-types/src/platform-category.ts`) | Super Admin | **No** — types-only, no Firestore collection, no route, no UI. Checkpoint 1B.4 adds a SEPARATE, temporary, developer-owned `PLATFORM_CATEGORY_REGISTRY` (same file) as an interim stand-in — see §11. |
| **Tenant category config** (today's `Category`, `packages/shared-types/src/category.ts`) | Client Admin | **Yes**, `CLIENT_CUSTOM`-sourced only; may now (1B.4) optionally link `platformCategoryId` to a registry entry — see §11. |
| **Client custom content** (POIs/events attached to a category) | Client Admin | **Yes** for POIs (checkpoint 1B.3, manual; checkpoint 1B.4, Google Places-imported) — a future Events checkpoint remains separate. |
| **Menu item** (public navigation entry) | Client Admin, via Menu Builder | **No** — see §5 below. |

## 3. Platform Category Definition (future, types-only)

`PlatformCategoryDefinition` (`packages/shared-types/src/platform-category.ts`): `platformCategoryId`, `key` (one of `PLATFORM_CATEGORY_KEYS` — illustrative: `RESTAURANT`, `EVENT`, `SHOPPING`, `SIGHTSEEING`, `HOTEL`, `PARKING`), `name`, `icon`, `status`, `supportedSources[]`, `supportsManualContent`, `supportsNearbySearch`, `supportsDateFilter`, `canAppearInMenu`, `createdAt`/`updatedAt`. No Firestore writes exist for this yet — build the real collection/route/Super Admin UI only when a Super Admin checkpoint actually requires it.

## 4. Client Category Config (future shape; today's `Category` already covers the `CLIENT_CUSTOM` case)

`ClientCategoryConfig` (same file): `platformCategoryId?`, `sourceType`, `customName?`, `customIcon?`, `enabled`, `menuEnabled`, `order`. Mapping to what exists today:

- `sourceType`, `enabled`, `order` — already on `Category`, implemented, working.
- `platformCategoryId` — already on `Category` as an optional field (checkpoint: Category CMS redesign), always `undefined` today since no platform category can be enabled yet.
- `customName` / `customIcon` — **not** added to `Category` yet. A `CLIENT_CUSTOM` category's `name`/`icon` already ARE its label/icon; a separate "custom" override field is only meaningful once a `PLATFORM` category also carries its OWN default name/icon to override. Add these to `Category` (both optional) when platform categories ship.
- `menuEnabled` — **deliberately deferred** (explicit instruction: "may be deferred if adding it now creates premature coupling"). Menu Builder does not exist yet; adding a menu-visibility field to `Category` now would couple category storage to a concept with no consumer to define its meaning. **Implement this on `Category` (optional, default-false-safe) only when the Menu Builder checkpoint begins** — that checkpoint should read this doc first.

## 5. Client custom content — categories vs. content items

```
CATEGORY  (taxonomy — "what kind of thing is this")
  ↓
CONTENT ITEMS  (POIs, events, ... — "the actual things")
```

A client's own local restaurant, temporary shop, or local attraction is a **content item belonging to an existing category** — never a new category. Do not let "add a custom restaurant" create a new `Category` document; it must reference an existing one (today, a `CLIENT_CUSTOM` category the tenant created themselves — e.g. "Restaurants"; later, potentially a released `RESTAURANT` platform category). POI/event CRUD is out of scope until Phase 1C (Places) / a future Events checkpoint.

### Restaurant category — future source behavior (documented only, not implemented)

```
Restaurant category
Sources: GOOGLE_PLACES, CLIENT_CUSTOM

End User result — "Nearby Restaurants":
├── external Google Places results
├── client custom restaurant
└── client custom local POI
```

No Google Places API call exists anywhere in this codebase yet.

### Event category — future source behavior (documented only, not implemented)

```
Event category
Possible sources: municipal API, tourism API, supported external event provider, CLIENT_CUSTOM_EVENT
```

Google Places is explicitly **not** assumed to be a complete event feed. A future manual event needs: `title`, `location`, `coordinates`, `startAt`, `endAt`, `description`, `images`. No Events CRUD exists anywhere in this codebase yet.

## 6. Menu Builder separation

Categories are content taxonomy. Menu Builder (not implemented) controls public navigation and is a **separate** concept — a menu item may wrap a category, a platform feature, or something else entirely:

```
Categories                Menu Builder
- Restaurant       ←───   Gourmet         → CATEGORY(Restaurant)
- Shopping         ←───   Events          → CATEGORY(Event)
- Sightseeing            Model Course    → FEATURE
- Event                  Audio Guide     → FEATURE
                          Ranking         → FEATURE
                          Search          → FEATURE
```

Menu item types will eventually include `CATEGORY`, `FEATURE`, `PAGE`, `COURSE`, `EXTERNAL_LINK`. **None of this data model is implemented.** The public menu must never be hard-coded into `/admin/categories` or the `Category` type — `menuEnabled`'s deferral (§4) is exactly this boundary held open.

## 7. Super Admin ownership boundary

- **Super Admin** creates/releases platform category definitions and platform feature modules; controls what's available on the platform at all.
- **Client Admin** enables approved categories, customizes label/icon/order, optionally adds them to the public menu later, and adds their own local/manual content.
- **End User** sees only client-enabled + published configuration.

No Super Admin bypass logic exists, or should exist, in the Client Admin UI (`/admin/categories` has no code path that can create or edit a `PlatformCategoryDefinition`).

## 8. Map provider abstraction (unrelated to categories, noted per checkpoint instruction)

The Map Settings provider abstraction (`apps/admin-web/lib/map-preview/`, checkpoint 1B.1-D) is preserved as-is. `MAP_PROVIDER_NAMES` (`packages/shared-types/src/enums.ts`) remains `GOOGLE_MAPS` (implemented) and `MAPBOX` (selectable, not yet live — a pre-existing, already-documented 1B.1-D scope decision). No additional providers (`MAPLIBRE`, `OPENSTREETMAP`, `HERE`) are added in this checkpoint; only actually-implemented providers should ever be selectable. A future provider-cards UI (replacing the current `<select>`) makes sense once 2+ providers are genuinely live — not before.

## 9. POI content — checkpoint 1B.3 (implemented)

`maps/{mapId}/pois/{poiId}` — see `packages/shared-types/src/poi.ts`. This is §5's "content items" half of the CATEGORY → CONTENT ITEMS distinction, now real:

```
CATEGORY               (taxonomy — "what kind of thing is this")
  ↓
POI / SPOT             (content — "the actual thing", geographic + a name)
```

Example, matching the checkpoint's own:

```
Category: Restaurant
  ↓
Sakura Restaurant   (35.6812, 139.7671)
Tokyo Sushi House   (35.6898, 139.7004)
Local Cafe          (35.6702, 139.7016)
```

A POI always references exactly one existing category (`categoryId`) — it never creates one. The server verifies the referenced `maps/{mapId}/categories/{categoryId}` document actually exists under the caller's own authenticated map before writing anything (see `app/api/map/pois/route.ts`'s `POST` handler and `[poiId]/route.ts`'s `PATCH` handler) — a well-formed but nonexistent, or cross-tenant, `categoryId` is rejected, never merely assumed valid because it matches an ID-format regex.

Every POI this checkpoint's UI (`/admin/pois`) can produce has `sourceType: 'CLIENT_CUSTOM'`, stamped exclusively by trusted server code (`app/api/map/pois/route.ts`) — no request body field can ever set it. `PoiSourceType` (`packages/shared-types/src/enums.ts`) also reserves `'GOOGLE_PLACES'` for the future sync §5 already anticipated; no such sync exists anywhere in this codebase. `MUNICIPAL_API`/`TOURISM_API` remain documentation-only (this checkpoint's own future-source list), not yet real enum values, until a concrete integration defines their shape — same "reserve the future value now, don't half-build it" discipline `CategorySourceType`'s `PLATFORM` value already established for categories.

A future merged "Restaurant" result (§5's illustration, still not implemented) becomes concretely: `GET` a category's POIs from `maps/{mapId}/pois` filtered by `categoryId`, unioned with a future Google Places query result keyed by the same category — this checkpoint's `Poi` model stores no raw external payload (only ever a `sourceType` + the same small field set every POI has), so that future union never needs to reconcile two different document shapes, only two different `sourceType` values feeding one render list.

A POI's `status` (`'ENABLED' | 'DISABLED'`) is independent of a category's own `enabled` toggle — disabling a POI hides it without deleting it (soft state, not a delete); no code path here cascades a category's disabled state onto its POIs or vice versa. Deletion of a POI (`DELETE /api/map/pois/{poiId}`) is a hard delete — no soft-delete/archive convention exists yet for any document type in this codebase (categories don't have one either), so this checkpoint does not invent one for POIs alone.

### Referential integrity: categories cannot be deleted out from under their POIs

`PATCH /api/map/categories/{categoryId}` is the only category mutation endpoint that exists — there is no `DELETE /api/map/categories/{categoryId}` route anywhere in this codebase, so a category can never today become a dangling reference for the POIs that name it, and no deletion-conflict check needed to be built to prevent that (per the checkpoint's own instruction: don't invent deletion functionality solely to guard a delete path that doesn't exist). This is a requirement to hold, not a decision to defer quietly: **whenever a category-delete endpoint is eventually added, it must reject deletion while `maps/{mapId}/pois` documents still reference that `categoryId`** (a `map/category-in-use`-shaped 409, naming the POI count, mirroring this checkpoint's own conflict-response conventions) rather than either cascading the delete onto those POIs or silently leaving them pointing at a nonexistent category. Read this section before building that endpoint.

## 10. Event ≠ POI (future, documented boundary only)

An Event is not a POI and never will be represented as one. A POI is a place: `name`, `location`, `categoryId`, no time dimension. An Event is time-bound content that may *reference* a POI/location, never the other way around:

```
Summer Festival   (a future Event: startAt, endAt, description, images)
    ↓ occurs at
Central Park POI  (this checkpoint's Poi: name, location, categoryId — no schedule fields)
```

`packages/shared-types/src/poi.ts`'s `Poi` interface deliberately carries no `startAt`/`endAt`/any event-scheduling field, and never will — that belongs to a future, distinct Event model (§5's "Event category — future source behavior" already anticipated this: `title`, `location`, `coordinates`, `startAt`, `endAt`, `description`, `images`). No Events CRUD exists anywhere in this codebase yet; when it is built, it is a new collection/model that *references* a `poiId` (or carries its own `location`) rather than a variant field set bolted onto `Poi`.

## 11. Google Places source integration — checkpoint 1B.4 (implemented, Restaurant only)

§5's "Restaurant category — future source behavior" illustration is now concretely real for ONE released category. The full flow, end to end:

```
PLATFORM_CATEGORY_REGISTRY            (code-based, checkpoint 1B.4 — see §3 above)
  platcat_restaurant: RESTAURANT, allowedSources: [CLIENT_CUSTOM, GOOGLE_PLACES]
        ↓ Client Admin links via a controlled dropdown (Categories UI)
CLIENT CATEGORY  (Category.platformCategoryId = 'platcat_restaurant')
        ↓ "Discover Places" — POST /api/map/pois/discover
ExternalPoiCandidate[]                (normalized, NOT persisted, NOT the raw Google response)
        ↓ Client Admin clicks Import on one candidate — POST /api/map/pois/import
Poi  (sourceType: 'GOOGLE_PLACES', provider: 'GOOGLE', providerPlaceId: <id>)
```

**Discovery ≠ import ≠ manual content — three deliberately separate concepts:**
- *Discovery* (`POST /api/map/pois/discover`) is READ-ONLY and TEMPORARY — it calls the external provider, returns normalized `ExternalPoiCandidate[]` (`apps/admin-web/lib/pois/external-provider.ts`) straight back to the browser, and writes nothing to Firestore. A discovery result the Client Admin never imports simply vanishes when the drawer closes.
- *Import* (`POST /api/map/pois/import`) is the ONLY thing that persists a `GOOGLE_PLACES` POI. It takes minimal input (`categoryId`, `provider`, `providerPlaceId`) and re-resolves the authoritative name/location/address itself via `provider.getPlaceDetails()` — it never trusts whatever the browser last displayed for that candidate.
- *Manual content* (checkpoint 1B.3's `sourceType: 'CLIENT_CUSTOM'` POIs, `POST /api/map/pois`) is completely untouched by any of this — the same endpoint, the same schema, the same UI flow as before 1B.4 shipped. A tenant with zero Google Places-eligible categories can still create/edit/delete manual POIs exactly as they always could; the "Discover Places" button is simply an ADDITIONAL entry point on the same `/admin/pois` page, never a replacement for manual entry, and the two `sourceType`s coexist in the same `maps/{mapId}/pois` collection and the same table (checkpoint 1B.3's own `Poi` model already reserved `sourceType: 'GOOGLE_PLACES'` — no shape ever had to change, only get a second value that was truly used).

**`PlatformCategoryRegistry` (`packages/shared-types/src/platform-category.ts`)** — a small, developer-owned, code-based catalog (`PLATFORM_CATEGORY_REGISTRY`), explicitly NOT the future `PlatformCategoryDefinition`/Firestore-backed Super Admin model §3 already documents. It exists so this checkpoint can ship a real "released platform category" concept without first building a full Super Admin console (out of scope here). Only `RESTAURANT` (`platformCategoryId: 'platcat_restaurant'`) is released (`status: 'ACTIVE'`) today. See that file's own doc comment for the full reasoning, including the migration-safety design choice: `platformCategoryId` values are fixed, hand-chosen strings, not randomly generated — when a real Super-Admin-managed `platformCategories` collection eventually replaces this registry, it only needs to be seeded with documents whose IDs match these same strings; no tenant `Category.platformCategoryId` or `Poi` document ever needs to be rewritten.

**Category linking (`/admin/categories`)** — a Client Admin optionally links their own, still-`CLIENT_CUSTOM`-sourced category to a released registry entry via a closed `<select>` ("Custom category" vs "Released category: Restaurant") — never a free-text `platformCategoryId` input, enforced both in the UI (`category-form-drawer.tsx`) and server-side (`categoryPlatformCategoryIdSchema`, a `z.enum` over `RELEASED_PLATFORM_CATEGORY_IDS`). Linking does NOT change `Category.sourceType` — the category is still authored by the Client Admin; linking only unlocks an additional content-SOURCE capability for POIs filed under it. The Categories table shows a "Capabilities" column (`✓ Client custom content · ✓ Google Places` for a linked category, `Client custom only` otherwise) so this is always visible, never implicit.

**`ExternalPoiProvider` (`apps/admin-web/lib/pois/external-provider.ts`)** — the server-side adapter abstraction both new routes program against, never a concrete provider class directly. `GooglePlacesProvider` (`google-places-provider.ts`) is the real Places API (New) adapter; `FakeGooglePlacesProvider` (`fake-external-provider.ts`) is a deterministic, in-process hermetic test double. `lib/pois/provider-registry.ts`'s `getExternalPoiProvider()` is the ONLY place that decides which one a request actually gets — a real `GOOGLE_PLACES_API_KEY` always wins; failing that, the E2E-only `E2E_FAKE_EXTERNAL_POI_PROVIDER=true` flag (never set outside `e2e/constants.ts`) selects the fake; otherwise discovery/import are simply unavailable (a safe `503`), which is the correct default for any environment that hasn't configured Google Places yet.

**Credentials** — `GOOGLE_PLACES_API_KEY` is server-only (never `NEXT_PUBLIC_`), read exactly once by `provider-registry.ts`, never logged, and structurally distinct from the existing browser-rendering `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (which only ever draws map tiles/markers and has a completely different risk profile as a result).

**Duplicate-import protection** is enforced server-side inside a Firestore transaction, keyed on `provider + providerPlaceId` within the tenant's own `maps/{mapId}/pois` collection (a pure-equality compound query — no composite index needed) — a 409 `map/duplicate-import`, never a silently-disabled UI button as the only defense.

**Editing an imported POI** — only `status` (enable/disable) is client-editable via `PATCH /api/map/pois/{poiId}` once a POI's stored `sourceType` is `GOOGLE_PLACES`; any other field in the same request is rejected (`400 map/external-poi-immutable-fields`), enforced by the route itself (not merely the edit drawer, which additionally renders those fields read-only as a matching UX signal). `name`/`categoryId`/`location`/`address`/`description` stay owned by the external source, re-resolved only by re-importing.

**No new Firestore path.** Both new routes read/write exclusively through the existing `maps/{mapId}/categories/*` and `maps/{mapId}/pois/*` paths — `firestore.rules` was not changed for this checkpoint, and `firebase/functions/test/security-rules/firestore.rules.test.ts`'s existing POI describe block was extended (not replaced) with one more assertion proving a document carrying `provider`/`providerPlaceId` fields is still denied by the same deny-by-default fallback that already covers every other POI field.

**Explicitly NOT this checkpoint:** discovery/import results never render on any public/End User surface (no live public map exists yet at all — Phase 1B is still entirely the admin CMS); Google Places is never treated as an Events source (§5's "Event category" future behavior remains its own, separate, unbuilt concern — Google Places only ever backs `RESTAURANT` `Poi` content here); no scheduled/background sync job re-fetches or refreshes imported places — an import is a one-time snapshot, re-imported only by deleting and importing again; no Google review/photo/detail UI; no other Places-like provider (Mapbox, HERE) is added alongside Google in this checkpoint.

**Future Super Admin migration path:** when a real Super-Admin-managed `platformCategories` Firestore collection ships, it should be seeded with a `RESTAURANT` document whose ID equals `platcat_restaurant` (matching `PLATFORM_CATEGORY_REGISTRY`'s existing value) so every tenant `Category.platformCategoryId` and every already-imported `Poi.provider`/`providerPlaceId` needs zero rewriting. At that point, `getPlatformCategoryRegistryEntry()`/`listActivePlatformCategories()` (`packages/shared-types/src/platform-category.ts`) should be re-pointed at the real collection instead of the in-code map — their call sites (`lib/tenant/category-capabilities.ts`, the discover/import routes, the Categories UI) do not need to change, only their implementation.
