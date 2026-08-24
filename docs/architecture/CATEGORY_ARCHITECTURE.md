# Category CMS Architecture — Current State + Future-Ready Model

**Status:** Current implementation is checkpoint 1B.2 (categories), checkpoint 1B.3 (POIs/Spots — client-owned manual map content, §9 below), checkpoint 1B.4 (Google Places source integration, Restaurant category first, §11 below), checkpoint 1B.5 (Menu Builder + public navigation configuration, §12 below), and checkpoint 1B.6 (Multi-Map Tenant Foundation — every category/POI/menu item below is now explicitly scoped to ONE of a tenant's possibly-several `maps/{mapId}` documents, never an implicit single map, §13 below). This document also records the **approved future architecture** that today's implementation is deliberately shaped to support without blocking it — sections explicitly marked "future" below are not implemented yet.
**Read this first if the phrase "the tenant's map" appears anywhere below or in your own assumptions:** as of checkpoint 1B.6, a customer/tenant owns zero or more `maps/{mapId}` documents, not exactly one — every route example in §1/§9/§11/§12 below that shows `/admin/maps/{mapId}/...` or `/api/maps/{mapId}/...` means literally that: the specific map named in the URL, verified against the caller's own tenant via `getOwnedMapContext(mapId)`, never "whichever map this tenant happens to have." See §13 for the full model.
**Location:** `docs/architecture/CATEGORY_ARCHITECTURE.md`
**Related:** `docs/stages/STAGE_1B_TECHNICAL_PLAN.md` (1B.2's original scope), `docs/architecture/SYSTEM_BLUEPRINT.md` §3/§11 (Stage 3 Super Admin, branding/theme controlled-configuration precedent).

---

## 1. Current state (implemented)

`maps/{mapId}/categories/{categoryId}` — see `packages/shared-types/src/category.ts`. Every category today is created directly by a Client Admin through `/admin/maps/{mapId}/categories`, going through the one trusted mutation boundary (`GET`/`POST /api/maps/{mapId}/categories`, `PATCH /api/maps/{mapId}/categories/{categoryId}`, all `getOwnedMapContext(mapId)`-gated, `CLIENT_ADMIN`-only writes). `sourceType` is stamped `'CLIENT_CUSTOM'` server-side on every create; `platformCategoryId` is never set by any code path today.

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
| **Menu item** (public navigation entry) | Client Admin, via Menu Builder | **Yes** — checkpoint 1B.5, `MenuItem` (`packages/shared-types/src/menu-item.ts`), `maps/{mapId}/menuItems/*` — see §12. |

## 3. Platform Category Definition (future, types-only)

`PlatformCategoryDefinition` (`packages/shared-types/src/platform-category.ts`): `platformCategoryId`, `key` (one of `PLATFORM_CATEGORY_KEYS` — illustrative: `RESTAURANT`, `EVENT`, `SHOPPING`, `SIGHTSEEING`, `HOTEL`, `PARKING`), `name`, `icon`, `status`, `supportedSources[]`, `supportsManualContent`, `supportsNearbySearch`, `supportsDateFilter`, `canAppearInMenu`, `createdAt`/`updatedAt`. No Firestore writes exist for this yet — build the real collection/route/Super Admin UI only when a Super Admin checkpoint actually requires it.

## 4. Client Category Config (future shape; today's `Category` already covers the `CLIENT_CUSTOM` case)

`ClientCategoryConfig` (same file): `platformCategoryId?`, `sourceType`, `customName?`, `customIcon?`, `enabled`, `menuEnabled`, `order`. Mapping to what exists today:

- `sourceType`, `enabled`, `order` — already on `Category`, implemented, working.
- `platformCategoryId` — already on `Category` as an optional field (checkpoint: Category CMS redesign), always `undefined` today since no platform category can be enabled yet.
- `customName` / `customIcon` — **not** added to `Category` yet. A `CLIENT_CUSTOM` category's `name`/`icon` already ARE its label/icon; a separate "custom" override field is only meaningful once a `PLATFORM` category also carries its OWN default name/icon to override. Add these to `Category` (both optional) when platform categories ship.
- `menuEnabled` — **still never added to `Category`, now by a settled decision rather than a deferral.** Checkpoint 1B.5 (Menu Builder, §12) shipped WITHOUT this field: whether a category appears in the public menu is derived entirely from whether a `MenuItem` document references it AND that `MenuItem`'s own `status` is `ENABLED` — never a second, independently-settable boolean on `Category` itself, which could otherwise drift out of sync with the actual menu (e.g. a category flagged `menuEnabled: true` with no corresponding `MenuItem`, or vice versa). `ClientCategoryConfig.menuEnabled` above remains a types-only, no-consumer future shape; the real implementation intentionally diverged from it for this reason. See §12 for the full design.

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

Menu item types will eventually include `CATEGORY`, `FEATURE`, `PAGE`, `COURSE`, `EXTERNAL_LINK`. **None of this data model is implemented.** The public menu must never be hard-coded into `/admin/maps/{mapId}/categories` or the `Category` type — `menuEnabled`'s deferral (§4) is exactly this boundary held open.

## 7. Super Admin ownership boundary

- **Super Admin** creates/releases platform category definitions and platform feature modules; controls what's available on the platform at all.
- **Client Admin** enables approved categories, customizes label/icon/order, optionally adds them to the public menu later, and adds their own local/manual content.
- **End User** sees only client-enabled + published configuration.

No Super Admin bypass logic exists, or should exist, in the Client Admin UI (`/admin/maps/{mapId}/categories` has no code path that can create or edit a `PlatformCategoryDefinition`).

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

A POI always references exactly one existing category (`categoryId`) — it never creates one. The server verifies the referenced `maps/{mapId}/categories/{categoryId}` document actually exists under the caller's own authenticated map before writing anything (see `app/api/maps/[mapId]/pois/route.ts`'s `POST` handler and `[poiId]/route.ts`'s `PATCH` handler) — a well-formed but nonexistent, or cross-tenant, `categoryId` is rejected, never merely assumed valid because it matches an ID-format regex.

Every POI this checkpoint's UI (`/admin/maps/{mapId}/pois`) can produce has `sourceType: 'CLIENT_CUSTOM'`, stamped exclusively by trusted server code (`app/api/maps/[mapId]/pois/route.ts`) — no request body field can ever set it. `PoiSourceType` (`packages/shared-types/src/enums.ts`) also reserves `'GOOGLE_PLACES'` for the future sync §5 already anticipated; no such sync exists anywhere in this codebase. `MUNICIPAL_API`/`TOURISM_API` remain documentation-only (this checkpoint's own future-source list), not yet real enum values, until a concrete integration defines their shape — same "reserve the future value now, don't half-build it" discipline `CategorySourceType`'s `PLATFORM` value already established for categories.

A future merged "Restaurant" result (§5's illustration, still not implemented) becomes concretely: `GET` a category's POIs from `maps/{mapId}/pois` filtered by `categoryId`, unioned with a future Google Places query result keyed by the same category — this checkpoint's `Poi` model stores no raw external payload (only ever a `sourceType` + the same small field set every POI has), so that future union never needs to reconcile two different document shapes, only two different `sourceType` values feeding one render list.

A POI's `status` (`'ENABLED' | 'DISABLED'`) is independent of a category's own `enabled` toggle — disabling a POI hides it without deleting it (soft state, not a delete); no code path here cascades a category's disabled state onto its POIs or vice versa. Deletion of a POI (`DELETE /api/maps/{mapId}/pois/{poiId}`) is a hard delete — no soft-delete/archive convention exists yet for any document type in this codebase (categories don't have one either), so this checkpoint does not invent one for POIs alone.

### Referential integrity: categories cannot be deleted out from under their POIs

`PATCH /api/maps/{mapId}/categories/{categoryId}` is the only category mutation endpoint that exists — there is no `DELETE /api/maps/{mapId}/categories/{categoryId}` route anywhere in this codebase, so a category can never today become a dangling reference for the POIs that name it, and no deletion-conflict check needed to be built to prevent that (per the checkpoint's own instruction: don't invent deletion functionality solely to guard a delete path that doesn't exist). This is a requirement to hold, not a decision to defer quietly: **whenever a category-delete endpoint is eventually added, it must reject deletion while `maps/{mapId}/pois` documents still reference that `categoryId`** (a `map/category-in-use`-shaped 409, naming the POI count, mirroring this checkpoint's own conflict-response conventions) rather than either cascading the delete onto those POIs or silently leaving them pointing at a nonexistent category. Read this section before building that endpoint.

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
        ↓ "Discover Places" — POST /api/maps/{mapId}/pois/discover
ExternalPoiCandidate[]                (normalized, NOT persisted, NOT the raw Google response)
        ↓ Client Admin clicks Import on one candidate — POST /api/maps/{mapId}/pois/import
Poi  (sourceType: 'GOOGLE_PLACES', provider: 'GOOGLE', providerPlaceId: <id>)
```

**Discovery ≠ import ≠ manual content — three deliberately separate concepts:**
- *Discovery* (`POST /api/maps/{mapId}/pois/discover`) is READ-ONLY and TEMPORARY — it calls the external provider, returns normalized `ExternalPoiCandidate[]` (`apps/admin-web/lib/pois/external-provider.ts`) straight back to the browser, and writes nothing to Firestore. A discovery result the Client Admin never imports simply vanishes when the drawer closes.
- *Import* (`POST /api/maps/{mapId}/pois/import`) is the ONLY thing that persists a `GOOGLE_PLACES` POI. It takes minimal input (`categoryId`, `provider`, `providerPlaceId`) and re-resolves the authoritative name/location/address itself via `provider.getPlaceDetails()` — it never trusts whatever the browser last displayed for that candidate.
- *Manual content* (checkpoint 1B.3's `sourceType: 'CLIENT_CUSTOM'` POIs, `POST /api/maps/{mapId}/pois`) is completely untouched by any of this — the same endpoint, the same schema, the same UI flow as before 1B.4 shipped. A tenant with zero Google Places-eligible categories can still create/edit/delete manual POIs exactly as they always could; the "Discover Places" button is simply an ADDITIONAL entry point on the same `/admin/maps/{mapId}/pois` page, never a replacement for manual entry, and the two `sourceType`s coexist in the same `maps/{mapId}/pois` collection and the same table (checkpoint 1B.3's own `Poi` model already reserved `sourceType: 'GOOGLE_PLACES'` — no shape ever had to change, only get a second value that was truly used).

**`PlatformCategoryRegistry` (`packages/shared-types/src/platform-category.ts`)** — a small, developer-owned, code-based catalog (`PLATFORM_CATEGORY_REGISTRY`), explicitly NOT the future `PlatformCategoryDefinition`/Firestore-backed Super Admin model §3 already documents. It exists so this checkpoint can ship a real "released platform category" concept without first building a full Super Admin console (out of scope here). Only `RESTAURANT` (`platformCategoryId: 'platcat_restaurant'`) is released (`status: 'ACTIVE'`) today. See that file's own doc comment for the full reasoning, including the migration-safety design choice: `platformCategoryId` values are fixed, hand-chosen strings, not randomly generated — when a real Super-Admin-managed `platformCategories` collection eventually replaces this registry, it only needs to be seeded with documents whose IDs match these same strings; no tenant `Category.platformCategoryId` or `Poi` document ever needs to be rewritten.

**Category linking (`/admin/maps/{mapId}/categories`)** — a Client Admin optionally links their own, still-`CLIENT_CUSTOM`-sourced category to a released registry entry via a closed `<select>` ("Custom category" vs "Released category: Restaurant") — never a free-text `platformCategoryId` input, enforced both in the UI (`category-form-drawer.tsx`) and server-side (`categoryPlatformCategoryIdSchema`, a `z.enum` over `RELEASED_PLATFORM_CATEGORY_IDS`). Linking does NOT change `Category.sourceType` — the category is still authored by the Client Admin; linking only unlocks an additional content-SOURCE capability for POIs filed under it. The Categories table shows a "Capabilities" column (`✓ Client custom content · ✓ Google Places` for a linked category, `Client custom only` otherwise) so this is always visible, never implicit.

**`ExternalPoiProvider` (`apps/admin-web/lib/pois/external-provider.ts`)** — the server-side adapter abstraction both new routes program against, never a concrete provider class directly. `GooglePlacesProvider` (`google-places-provider.ts`) is the real Places API (New) adapter; `FakeGooglePlacesProvider` (`fake-external-provider.ts`) is a deterministic, in-process hermetic test double. `lib/pois/provider-registry.ts`'s `getExternalPoiProvider()` is the ONLY place that decides which one a request actually gets — a real `GOOGLE_PLACES_API_KEY` always wins; failing that, the E2E-only `E2E_FAKE_EXTERNAL_POI_PROVIDER=true` flag (never set outside `e2e/constants.ts`) selects the fake; otherwise discovery/import are simply unavailable (a safe `503`), which is the correct default for any environment that hasn't configured Google Places yet.

**Credentials** — `GOOGLE_PLACES_API_KEY` is server-only (never `NEXT_PUBLIC_`), read exactly once by `provider-registry.ts`, never logged, and structurally distinct from the existing browser-rendering `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (which only ever draws map tiles/markers and has a completely different risk profile as a result).

**Duplicate-import protection** is enforced server-side inside a Firestore transaction, keyed on `provider + providerPlaceId` within the tenant's own `maps/{mapId}/pois` collection (a pure-equality compound query — no composite index needed) — a 409 `map/duplicate-import`, never a silently-disabled UI button as the only defense.

**Editing an imported POI** — only `status` (enable/disable) is client-editable via `PATCH /api/maps/{mapId}/pois/{poiId}` once a POI's stored `sourceType` is `GOOGLE_PLACES`; any other field in the same request is rejected (`400 map/external-poi-immutable-fields`), enforced by the route itself (not merely the edit drawer, which additionally renders those fields read-only as a matching UX signal). `name`/`categoryId`/`location`/`address`/`description` stay owned by the external source, re-resolved only by re-importing.

**No new Firestore path.** Both new routes read/write exclusively through the existing `maps/{mapId}/categories/*` and `maps/{mapId}/pois/*` paths — `firestore.rules` was not changed for this checkpoint, and `firebase/functions/test/security-rules/firestore.rules.test.ts`'s existing POI describe block was extended (not replaced) with one more assertion proving a document carrying `provider`/`providerPlaceId` fields is still denied by the same deny-by-default fallback that already covers every other POI field.

**Explicitly NOT this checkpoint:** discovery/import results never render on any public/End User surface (no live public map exists yet at all — Phase 1B is still entirely the admin CMS); Google Places is never treated as an Events source (§5's "Event category" future behavior remains its own, separate, unbuilt concern — Google Places only ever backs `RESTAURANT` `Poi` content here); no scheduled/background sync job re-fetches or refreshes imported places — an import is a one-time snapshot, re-imported only by deleting and importing again; no Google review/photo/detail UI; no other Places-like provider (Mapbox, HERE) is added alongside Google in this checkpoint.

**Future Super Admin migration path:** when a real Super-Admin-managed `platformCategories` Firestore collection ships, it should be seeded with a `RESTAURANT` document whose ID equals `platcat_restaurant` (matching `PLATFORM_CATEGORY_REGISTRY`'s existing value) so every tenant `Category.platformCategoryId` and every already-imported `Poi.provider`/`providerPlaceId` needs zero rewriting. At that point, `getPlatformCategoryRegistryEntry()`/`listActivePlatformCategories()` (`packages/shared-types/src/platform-category.ts`) should be re-pointed at the real collection instead of the in-code map — their call sites (`lib/tenant/category-capabilities.ts`, the discover/import routes, the Categories UI) do not need to change, only their implementation.

## 12. Menu Builder + public navigation configuration — checkpoint 1B.5 (implemented)

CATEGORY != MENU ITEM. A `Category` is taxonomy a Client Admin defines (§1); a `MenuItem` is a SEPARATE decision about which of those categories — plus which platform FEATUREs — actually appear in the public tourist map's navigation, under what custom label, in what order. The full chain, end to end, up to (but not past) the point this checkpoint stops:

```
PLATFORM_CATEGORY_REGISTRY / PUBLIC_FEATURE_REGISTRY   (code-based, §11 / this section)
        ↓ Client Admin links a category (§11) — unrelated to Menu Builder itself
CLIENT CATEGORY   (Category.enabled, Category.name — §1)
        ↓ Client Admin adds it to Menu Builder — POST /api/maps/{mapId}/menu-items
MENU ITEM         (MenuItem.label, .order, .status — this section)
        ↓ buildPublicMenuProjection(menuItems, categories) — pure, in-memory
PUBLIC MENU PROJECTION   (enabled + ordered + fail-closed on broken/disabled refs)
        ↓ NOT BUILT YET — no public route reads this
PUBLIC MAP UI     (future checkpoint)
```

**`MenuItem` (`packages/shared-types/src/menu-item.ts`)** — `maps/{mapId}/menuItems/{menuItemId}`, nested under its owning map exactly like `Category`/`Poi`, never a top-level collection. A REAL discriminated union on `type`: `MenuItemCategory` always carries `categoryId` and never `featureKey`; `MenuItemFeature` always carries `featureKey` and never `categoryId` — enforced at both the TypeScript level (shared-types) and the runtime/API boundary (`menuItemSchema`/`menuItemCreateInputSchema`, `packages/validation/src/menu-item.ts`, both `z.discriminatedUnion('type', ...)`). Creating or editing a `MenuItem` never renames or mutates the `Category`/feature it references — `MenuItem.label` is the menu's own public-facing text, completely independent of `Category.name`.

**`PUBLIC_FEATURE_REGISTRY` (`packages/shared-types/src/public-feature.ts`)** — mirrors `PLATFORM_CATEGORY_REGISTRY`'s (§11) exact shape and reasoning: a small, developer-owned, code-based catalog standing in for a future Super-Admin-managed feature-release mechanism, explicitly NOT full Super Admin feature management. Only `SEARCH` and `MY_LOCATION` are released today. `menuItemFeatureKeySchema` is a closed `z.enum` over `RELEASED_FEATURE_KEYS`, so "only released feature keys are selectable" is a server-enforced invariant, never a UI convention alone — an unreleased key (`MODEL_COURSE`, `AUDIO_GUIDE`, `RANKING`, `FAVORITES`, `LANGUAGE`, `WEATHER`) is rejected at the schema boundary, not merely absent from the dropdown.

**Trusted API (`GET`/`POST /api/maps/{mapId}/menu-items`, `PATCH`/`DELETE /api/maps/{mapId}/menu-items/{menuItemId}`)** — the exact same trusted-mutation shape every prior route in this document established: origin check → `getOwnedMapContext(mapId)` → `CLIENT_ADMIN` role → `.strict()` Zod validation → ownership/reference verification → Admin SDK write. A `CATEGORY` menu item's `categoryId` is verified to reference a category that actually exists under the caller's own authenticated map (mirrors POIs' identical check), and — a Menu-Builder-specific rule — a disabled category can never be newly linked as an ENABLED menu item (`400 map/category-disabled`); adding it as `DISABLED` is still allowed. Duplicate linkage (the same category, or the same feature key, appearing twice in one map's menu) is rejected with `409 map/duplicate-menu-item`, enforced inside a Firestore transaction with a pure-equality compound query — the same "no composite index needed" pattern §11's duplicate-import check already established.

**Immutability after creation.** `type`/`categoryId`/`featureKey` can never be changed via `PATCH` — `menuItemUpdateInputSchema` has no such fields at all, by construction. Removing the link means deleting the menu item and adding a new one, not editing in place. This keeps the create-time uniqueness and category-eligibility checks permanently a create-time-only concern, with nothing to re-verify on every edit. `icon` (meaningful only for a `CATEGORY` item — a `FEATURE` item's icon is always its registry entry's own, never client-chosen, and `MenuItemFeature` has no `icon` field to begin with) is the one exception: it may be set, or cleared back to "inherit the linked category's icon" via explicit `null`, mirroring `Category.platformCategoryId`'s identical link/unlink shape.

**Delete semantics (§13).** `DELETE /api/maps/{mapId}/menu-items/{menuItemId}` is a hard delete of the `MenuItem` document ONLY — its Firestore access is scoped entirely to the `menuItems` subcollection, so it is structurally incapable of reaching `maps/{mapId}/categories/*` or `maps/{mapId}/pois/*`, not merely documented as not touching them. The UI's confirmation dialog (`delete-menu-item-dialog.tsx`) says so explicitly before the user confirms.

**Ordering/status.** `order` (numeric, authoritative) and `status` (`ENABLED`/`DISABLED`) mirror `Category`'s own fields exactly — reordering in the UI is the same "swap two `order` values via two `PATCH` calls" pattern `categories-manager.tsx` already established for categories, and `DISABLED` means "stored, but excluded from the public projection", never a delete.

**`buildPublicMenuProjection()` (`apps/admin-web/lib/tenant/menu-projection.ts`)** — a PURE function (no Firestore, no Next.js, no network) that takes an already-loaded `menuItems`/`categories` pair and derives the future public tourist map's navigation config entirely in memory. Rules: only `status: 'ENABLED'` items are included; ordered by `order` ascending (`menuItemId` as a tie-break); a `CATEGORY` item whose `categoryId` doesn't resolve, or whose resolved category is itself disabled, is silently excluded (fail closed, never a thrown error, and the `MenuItem` document itself is left completely untouched — this is the concrete mechanism behind "existing menu items referencing a later-disabled category fail safe, they are never silently deleted"); a `FEATURE` item whose `featureKey` doesn't resolve to a currently-`released` registry entry is excluded the same way, so retiring a feature in a future deploy stops it from appearing with zero data migration — the exact same "re-check the live registry on every call" design `resolveCategoryCapability` (§11) already established for platform categories. This function is heavily unit-tested (`menu-projection.test.ts`) but is **not exposed publicly yet** — no public/unauthenticated route calls it; it exists so the shape is settled and proven the moment a real public-map checkpoint needs it.

**No new Firestore rules path.** `maps/{mapId}/menuItems/*` is read/written exclusively through the trusted `/api/maps/{mapId}/menu-items` Route Handlers (Admin SDK, which bypasses rules by design) — `firestore.rules` was not changed for this checkpoint; the existing deny-by-default `match /{document=**}` fallback already covers it, and `firebase/functions/test/security-rules/firestore.rules.test.ts` gained a new `maps/{mapId}/menuItems subcollection` describe block proving that directly, the same way the categories/POIs blocks already do for their own subcollections.

**Explicitly NOT this checkpoint:** the public tourist map UI itself; any public-facing POI/category/search/geolocation rendering (`SEARCH`/`MY_LOCATION` are menu-identity-only reservations — see `PublicFeatureRegistryEntry.futureBehaviorContract` for the documented, unbuilt future behavior each implies); a publishing workflow (Menu Builder edits draft configuration, exactly like categories/POIs, with no version/publish step yet); Super Admin (`PUBLIC_FEATURE_REGISTRY` remains code-owned, the same interim-registry pattern §11 already established for platform categories, with the identical future migration path: seed a real Super-Admin-managed collection with matching keys, re-point the registry accessor functions, leave every call site and every tenant `MenuItem` document untouched).

## 13. Multi-Map Tenant Foundation — checkpoint 1B.6 (implemented)

Every section above (§1, §9, §11, §12) describes categories/POIs/menu items as belonging to "the map." That phrasing predates this checkpoint and is now **CUSTOMER 1 → N MAPS**, permanently: a `customers/{customerId}` document may own zero, one, or several `maps/{mapId}` documents (`map.customerId` is the only ownership link — maps stay a top-level collection, never nested under `customers/{customerId}/maps/*`), and every category/POI/menu item/Google Places discovery-and-import concept described in §1–§12 is scoped to exactly ONE specific `mapId`, never to "the tenant" as a stand-in for a single implicit map. Two maps belonging to the same tenant are as fully isolated from each other as two different tenants are from one another — same-tenant map isolation is a first-class guarantee, not an afterthought of cross-tenant isolation. See `apps/admin-web/e2e/maps.spec.ts` for the isolation proofs (settings, categories, manual POIs, imported POIs, menu items, and Google Places discovery geography all independently verified not to leak between two maps owned by the same tenant).

**Why this doesn't require re-litigating §1–§12's data model.** Every collection this document describes was already written as `maps/{mapId}/<subcollection>/*` — categories, POIs, and menu items were never stored anywhere that assumed a single map per tenant; they were always keyed by `mapId` already. The single-map assumption lived entirely in the APPLICATION layer (how `mapId` got resolved), not the data model: pre-1B.6, `getCurrentClientContext()` silently queried `maps` for "the one document with this `customerId`" and handed callers a resolved map alongside tenant identity, with no way to ask for a DIFFERENT one. That implicit resolution is what checkpoint 1B.6 removes.

**GLOBAL vs CUSTOMER-SCOPED vs MAP-SCOPED — the taxonomy every concept in this document now falls into:**

- **GLOBAL** — exists once for the whole platform, independent of any tenant or map. `PLATFORM_CATEGORY_REGISTRY` (§11), `PUBLIC_FEATURE_REGISTRY` (§12), and `lib/tenant/category-capabilities.ts`'s capability-resolution logic are all GLOBAL: whether a category CAN be linked to Google Places, and which feature keys are released, never varies by tenant or by map. A Client Admin's choice to actually LINK a category, or actually ADD a feature to their menu, is a separate, map-scoped decision layered on top of this global catalog.
- **CUSTOMER-SCOPED** — exists once per tenant, independent of which map is selected. `customers/{customerId}` itself, `users/{uid}` (a person is a member of a customer, not of a specific map), and the list of maps a tenant owns (`listOwnedMaps(customerId)`) are CUSTOMER-SCOPED. `getCurrentTenantIdentity()` (`apps/admin-web/lib/tenant/tenant-identity.ts`) resolves exactly this tier — uid/role/user/customer, deliberately with no map resolution at all, which is what makes it safe to call from `/admin/maps` (the dashboard that LISTS every map) without circularity.
- **MAP-SCOPED** — exists once per `mapId`, independent of how many other maps the same tenant owns. `maps/{mapId}` itself (name, provider, area/geography, branding), and everything nested under it — `categories/*`, `pois/*`, `menuItems/*` — are MAP-SCOPED. `getOwnedMapContext(mapId)` (`apps/admin-web/lib/tenant/map-context.ts`) resolves this tier, and is the one function every map-scoped page/Route Handler calls before touching any of these subcollections (§14 below).

A category LINK to a platform category (§11) is a good example of how these tiers interact without collapsing into each other: the platform category definition itself is GLOBAL, but a specific `Category.platformCategoryId` link lives on a specific `maps/{mapId}/categories/{categoryId}` document — MAP-SCOPED. The same tenant could, in principle, link "Restaurants" to the Restaurant platform category on one map and leave it unlinked on another; nothing in this architecture prevents that, because the link is stored per-map, not per-tenant.

**Ownership model (§2 of the checkpoint spec).** `maps/{mapId}` stays a top-level collection; `map.customerId` is the authenticated tenant's `customerId`, stamped exclusively by trusted server code (`POST /api/maps`, or `provisionClient()` for a tenant's first map — see `firebase/functions/src/provisioning/provision-client.ts`) — never client-suppliable, never inferred from a URL segment. A customer with two maps has two independent `maps/{mapId}` documents sharing one `customerId` value; there is no parent/child relationship between the maps themselves.

**Routing.** Every map-scoped admin page now takes an explicit `mapId` URL segment: `/admin/maps` (the dashboard — CUSTOMER-SCOPED, lists every owned map), `/admin/maps/{mapId}` (a specific map's overview), `/admin/maps/{mapId}/settings`, `/admin/maps/{mapId}/categories`, `/admin/maps/{mapId}/pois`, `/admin/maps/{mapId}/menu` — matching every `/api/maps/{mapId}/...` Route Handler path referenced throughout §1–§12 above. The pre-1B.6 flat URLs (`/admin/map`, `/admin/categories`, `/admin/pois`, `/admin/menu`) still work — each now renders `<LegacyMapRedirect>` (`apps/admin-web/components/admin-shell/legacy-map-redirect.tsx`), which resolves the caller's OLDEST owned map (`resolveFirstOwnedMapId()`, `createdAt` ascending) and redirects there. This is a real, working redirect for every pre-1B.6 tenant (all of whom have exactly one map today), not a resurrection of the single-map assumption: a tenant with two or more maps is still redirected somewhere real and usable, with an immediate link to `/admin/maps` to disambiguate further. Old API paths (`/api/map/*`, singular) were NOT kept as compatibility shims — only browser-rendered page URLs need backward compatibility; every client-side `fetch()` call in this codebase was migrated directly to the new `/api/maps/{mapId}/...` paths.

**§14 — `mapId` is an identifier, never authorization.** This is the single most important invariant this checkpoint adds, and it governs every Route Handler this document describes. For every map-scoped operation: resolve the authenticated tenant's identity (`getCurrentTenantIdentity()`) → read the requested `mapId`'s own `maps/{mapId}` document → compare `map.customerId` against the authenticated tenant's `customerId` → ALLOW only on an exact match, DENY (fail closed) otherwise. `getOwnedMapContext(mapId)` (`apps/admin-web/lib/tenant/map-context.ts`) is this check, written once and reused by every map-scoped page and Route Handler — never reimplemented per route. Critically, it collapses FOUR distinct internal failure modes — a malformed `mapId`, a well-formed but nonexistent `mapId`, a `mapId` belonging to a different tenant, and a stored map document that fails schema validation — into ONE external-facing reason (`'map_not_found'`, rendered as "Map not found. This map does not exist, or you do not have access to it.") so a forged/cross-tenant `mapId` and a genuinely nonexistent one are indistinguishable from the outside. This mirrors the precedent `PATCH /api/maps/{mapId}/categories/{categoryId}` already established pre-1B.6 for a cross-tenant `categoryId` 404, now applied one level up, at the map itself.

**Google Places discovery/import (§9 of the checkpoint spec — extending §11 above).** The GLOBAL provider/category-capability logic (`lib/tenant/category-capabilities.ts`) is completely unchanged by this checkpoint. What changed is geography: `POST /api/maps/{mapId}/pois/discover` resolves its search center from the EXPLICITLY REQUESTED map's own `area.center` — never a different map's, never client-supplied — so discovering places for two maps of the same tenant with different configured areas correctly searches around each map's own location. Duplicate-import protection (§11) remains scoped to `maps/{mapId}/pois` — the same real-world Google place CAN legitimately be imported into two different maps belonging to the same tenant; this was already implied by categories/POIs being MAP-SCOPED, and this checkpoint makes it an explicitly tested, intentional behavior rather than an untested implication.

**Registration/provisioning (§12 of the checkpoint spec).** `provisionClient()` (`firebase/functions/src/provisioning/provision-client.ts`) required no logic changes: its existing `maps.where('customerId','==',existingCustomerId).limit(1)` lookup was already scoped to idempotency-by-email retry-resume (does an interrupted PRIOR attempt for this SAME email already have a map to reuse), never a general "at most one map" constraint — see that file's own updated doc comment. A tenant's first map, created at registration, is now correctly understood as their FIRST map, not a permanently unique one; nothing about registration prevents `POST /api/maps` from being called afterward to create additional ones.

**Firestore rules — no changes required.** `match /maps/{mapId}` (`firebase/firestore.rules`) already evaluated ownership per-document (`resource.data.customerId == request.auth.token.customerId`), with no assumption baked in anywhere that a tenant owns at most one such document — this checkpoint is the first to actually PROVE that, rather than merely relying on the rule text reading correctly, via the `multi-map tenant foundation — checkpoint 1B.6` describe block added to `firebase/functions/test/security-rules/firestore.rules.test.ts` (a second map fixture, `MAP_A2`, owned by the same tenant as the existing `MAP_A` fixture, proving both are readable by their owner, neither is readable by a different tenant, and client writes remain denied for the second map exactly like the first).

**Explicitly NOT this checkpoint:** Map Theme, the Preview workflow (beyond the pre-existing 1B.1-D form-preview), the Publish workflow, the public End User map, Events, Live Cameras, Super Admin, Android, map templates/clone-map, bulk hotel creation, and custom domains. `Category.menuEnabled` is still not introduced (§4/§12's settled decision stands, untouched by multi-map). No destructive Firestore migration was needed or performed — every category/POI/menu item document that existed before this checkpoint already carried the correct `mapId` on itself; the change was entirely in how that `mapId` is looked up and verified, not in the documents themselves.
