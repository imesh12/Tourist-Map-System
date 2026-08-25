# Map Theme Architecture — Provider-Neutral Model + Google Maps "Tourist Clean" Styling

**Status:** Current implementation is checkpoint 1B.7. Builds directly on checkpoint 1B.6's multi-map foundation (`docs/architecture/CATEGORY_ARCHITECTURE.md` §13) — every `MapTheme` below is scoped to exactly one `maps/{mapId}` document, never a tenant-wide or global setting.
**Location:** `docs/architecture/MAP_THEME_ARCHITECTURE.md`
**Related:** `docs/stages/STAGE_1B_TECHNICAL_PLAN.md` (map settings/branding precedent), `docs/architecture/SYSTEM_BLUEPRINT.md` §11 (controlled theme options, not arbitrary CSS/JSON), `docs/architecture/CATEGORY_ARCHITECTURE.md` (the sibling "Category CMS" domain-model document this one deliberately mirrors in structure).

---

## 1. Why a provider-neutral model at all

`mapProvider.provider` (checkpoint 1B.1) already lets a tenant choose `GOOGLE_MAPS` or `MAPBOX`. A theme is a visual preference of the **tenant**, not of whichever map SDK happens to render it today — a Client Admin should never have to re-configure their "clean, tourist-friendly look" from scratch if the platform later adds a live Mapbox/MapLibre renderer. So `MapTheme` (`packages/shared-types/src/map.ts`) is deliberately:

- **Never raw provider style JSON.** No `google.maps.MapTypeStyle[]`, no Mapbox style spec fragment, ever reaches a Client Admin's browser or gets stored on the map document.
- **A small, closed, `.strict()`-validated value object** — `preset` + `visibility` (7 booleans) + `colors` (5 optional hex fields) + `markerStyle` (style + size) — the same "controlled configuration, not arbitrary CSS" precedent `MapBranding` already established in checkpoint 1B.1 (see SYSTEM_BLUEPRINT.md §11).
- **Translated to a real provider format by exactly one adapter function per provider**, never generated ad hoc by UI code.

```
MapTheme (provider-neutral, stored on maps/{mapId}.theme)
    │
    ▼
MapThemeAdapter (a plain function: MapTheme -> <provider's own format>)
    │
    ├── mapThemeToGoogleMapsStyles(theme) -> readonly GoogleMapStyleElement[]   (IMPLEMENTED, this checkpoint)
    │     apps/admin-web/lib/map-preview/google-theme-adapter.ts
    │
    └── mapThemeToMapboxStyle(theme) -> <Mapbox style expression>              (NOT IMPLEMENTED — future)
          would live alongside google-theme-adapter.ts as a sibling module
          with the identical MapTheme -> <format> signature.
```

`google-theme-adapter.ts`'s own doc comment states this explicitly: it is the **only** place in the codebase allowed to produce a Google Maps `styles` array. `map-settings-form.tsx` (the Theme UI) never imports it, never sees a `GoogleMapStyleElement`, and only ever reads/writes plain `MapTheme` values — see §6.

## 2. `MapThemePreset` — deliberately NOT `MapStyle`

`MAP_STYLES` (`ROAD`/`SATELLITE`/`HYBRID`/`TERRAIN`/`CUSTOM`, `packages/shared-types/src/enums.ts`, checkpoint 1B.1) selects the provider's base map **type**. `MAP_THEME_PRESETS` (`STANDARD`/`TOURIST_CLEAN`/`LIGHT`/`MINIMAL`, same file, checkpoint 1B.7) is an unrelated axis: which bundle of `visibility`/`colors`/`markerStyle` defaults to start from. A map can be `style: 'SATELLITE'` and `theme.preset: 'TOURIST_CLEAN'` at once — the two never collide, and the naming is deliberately distinct to keep them from ever being confused in code review or in the UI.

- `STANDARD` — closest to the provider's own defaults; every visibility flag on, no color overrides.
- `TOURIST_CLEAN` — this checkpoint's main goal: hides default business/school/hospital/government/place-of-worship/attraction POI clutter while keeping roads, transit, parks, and geography — so a tenant's OWN categories/POIs (rendered by a separate, existing system — see §10) are visually dominant against a calmer basemap.
- `LIGHT` — a lighter, more neutral palette variant with transit labels also suppressed.
- `MINIMAL` — the strongest suppression: transit itself, all default POI categories, and both label types off.

### No `CUSTOM` preset — decision, not a gap

The checkpoint spec explicitly allowed skipping `CUSTOM` if it added unnecessary complexity. It does, for no real benefit: **selecting a preset only ever POPULATES `visibility`/`colors`/`markerStyle` from `MAP_THEME_PRESET_DEFAULTS`; it never locks them.** A Client Admin can hand-edit any individual field afterward and the `preset` name simply stays exactly as selected — there is no "this theme is now dirty, relabel it CUSTOM" state machine to build, test, or get wrong. `MapTheme` stays a plain, always-valid value object. This is documented at the source in three places: `MapThemePreset`'s own doc comment (`shared-types/src/enums.ts`), `MAP_THEME_PRESET_DEFAULTS`'s doc comment (`shared-types/src/map-theme-presets.ts`), and `map-settings-form.tsx`'s own Theme-section doc comment.

## 3. Storage — map-scoped, never global, never client-authoritative for ownership

`theme?: MapTheme` lives directly on the existing `maps/{mapId}` document (`packages/shared-types/src/map.ts`), exactly beside `branding?: MapBranding`. There is no `themes` collection, no `mapStyles` collection, no per-tenant global theme default. A theme cannot carry `customerId`/`mapId`/`mapProvider`/any other ownership or system field — `mapThemeSchema`'s `.strict()` mode (`packages/validation/src/map-theme.ts`) rejects any such field outright at parse time, the identical mechanism `mapSettingsUpdateSchema` already uses to protect every other field on this route. Ownership itself is decided exclusively by `getOwnedMapContext(mapId)` resolving the caller's own authenticated session against the map named in the URL — never by anything in the request body, theme included.

## 4. Backward compatibility — no migration required

Every `maps/{mapId}` document written before checkpoint 1B.7 has no `theme` field at all. `theme` is optional on both `TouristMap` (shared-types) and `mapSchema` (validation) for exactly this reason — the identical pattern `branding` already established in checkpoint 1B.1. Rather than a Firestore migration, a **read-side default fallback** is substituted at the point of use:

```ts
// packages/shared-types/src/map-theme-presets.ts
export const DEFAULT_MAP_THEME_PRESET: MapThemePreset = 'STANDARD';
export const DEFAULT_MAP_THEME: MapTheme = MAP_THEME_PRESET_DEFAULTS[DEFAULT_MAP_THEME_PRESET];
```

`map-settings-form.tsx` does `const initialTheme = initialMap.theme ?? DEFAULT_MAP_THEME;` once, at the top of the component, and every piece of `useState`/`handleDiscard` initialization reads from that. The Google adapter (`google-maps-preview.tsx`) only ever receives a `theme` prop the form already resolved this way, so it never has to reason about "no theme" itself. No new-map provisioning code (`POST /api/maps`, `registerClient`) was changed to write a default `theme` — this mirrors `branding`'s identical "absent until first explicitly saved" precedent, and keeps this checkpoint from touching the provisioning path at all.

## 5. API — extended, not duplicated

`PATCH /api/maps/{mapId}/settings` (checkpoint 1B.6) gained one more optional field on its existing validated payload:

```ts
// packages/validation/src/map-settings.ts
theme: mapThemeSchema.optional(),
```

and the route (`apps/admin-web/app/api/maps/[mapId]/settings/route.ts`) writes it with the same "only if present" partial-update `branding` already uses:

```ts
if (parsed.data.theme !== undefined) {
  update.theme = parsed.data.theme;
}
```

No new route, no duplicated `isTrustedOrigin` → `getOwnedMapContext` → `CLIENT_ADMIN` → validate → write pipeline. The trusted mutation boundary is unchanged from 1B.1/1B.6: trusted origin, authenticated tenant, `getOwnedMapContext(mapId)`, `CLIENT_ADMIN` role check, `.strict()` schema validation, then a single Admin SDK `mapRef.update(...)`. Browser Firestore rules remain deny-by-default for `maps/*` — no theme field is ever browser-writable.

## 6. Google Maps adapter design

`apps/admin-web/lib/map-preview/google-theme-adapter.ts` exports one pure function:

```ts
function mapThemeToGoogleMapsStyles(theme: MapTheme): readonly GoogleMapStyleElement[]
```

- **Pure and deterministic** — same input always produces the same output array, in the same order, no mutation of the input. Proven by `google-theme-adapter.test.ts`.
- **No SDK dependency** — `GoogleMapStyler`/`GoogleMapStyleElement` are plain local interfaces shaped like `google.maps.MapTypeStyle`, not an import of the real Google type, so the module (and its unit tests) load with no `google` global present.
- **Visibility → suppression, colors → overrides**, in that order. `poi` (the umbrella feature type) is never turned off wholesale — `poi.park` has its own independent flag and must survive a `businessPois: false` setting. `transit`/`roadLabels`/`transitLabels` distinguish "hide the whole feature" (`visibility: 'off'` on the bare feature type) from "keep the feature, hide only its text" (`elementType: 'labels'`) — this is what lets `LIGHT` keep transit lines/stations visible while hiding their labels.
- **Compliance:** a `styles` array can only affect the basemap's own rendering (roads, land, water, POI/label visibility and color). It has no way to touch, hide, or otherwise alter the Google logo or the legal/attribution control the Maps JS API renders on top of the map — nothing in this adapter attempts to, and nothing could even if it tried, since that UI is not part of the `styles` option's surface area at all.

`google-maps-preview.tsx` is the adapter's only consumer: it calls `mapThemeToGoogleMapsStyles(theme)` once to seed the initial `Map` constructor's `styles` option, and again inside a dedicated `useEffect` (keyed on `JSON.stringify(theme)`, since `MapTheme` is a compound object rather than a primitive — the same reasoning `center`'s `lat`/`lng` primitives already establish for this file) that calls `map.setOptions({ styles: ... })` whenever the form's theme state changes, with no remount.

## 7. Map Settings UI — Theme section

A fifth card, "Theme," was added to `map-settings-form.tsx` (`apps/admin-web/app/(protected)/admin/maps/[mapId]/settings/`), positioned after Branding: a Preset dropdown; 7 visibility checkboxes (Business POIs, Transit, Schools, Hospitals, Parks, Road labels, Transit labels); 4 color inputs with live swatches (Background, Roads, Water, Labels — mirroring `.color-field`/`.color-swatch`/`.color-swatch-fill`, the exact classes Branding's own color fields already use); and Marker style / Marker size dropdowns. No second CSS or component framework was introduced — every control reuses `.field`/`.field-label`/`.field-hint`/`.input`/`.select`/`.field-row`/`.color-field` verbatim. One new class, `.checkbox-field`, was added to `globals.css` (styled via native `accent-color`, matching `.slider`'s own approach) since no checkbox styling convention existed anywhere in the codebase before this checkpoint.

`colors.land` is validated by `mapThemeColorsSchema` and typed on `MapThemeColors`, but is intentionally **not** exposed as a 5th color input — the checkpoint's own mockup calls for 4, and no preset in `MAP_THEME_PRESET_DEFAULTS` sets it either. The form simply never emits it; a future UI iteration can add the field without any schema change.

## 8. Live preview — no Save required, then Save persists

`previewTheme` (a `useMemo` in `map-settings-form.tsx`, built from all 13 theme-related `useState` values) is the single source of truth fed to **both**:

- `<MapPreview theme={previewTheme} .../>` — updates the live map's `styles` immediately (§6), and
- `buildPayload()`'s `theme: previewTheme` field — persisted only once "Save" is clicked.

Because this suite's E2E tests deliberately run with no `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (see `e2e/map-preview.spec.ts`'s own header comment — no real, billed Google credential is ever configured for hermetic/CI tests), the live map's actual rendered `styles` are never themselves inspectable from a test. `MapPreviewInfo` (checkpoint 1A.10's existing "Current Center / Current Zoom / Bounds" always-visible area, independent of whether the live map or the no-API-key fallback is showing) gained a fourth "Current Theme" row for exactly this reason — the same role it already plays for center/zoom/bounds, and what makes "theme changes update the preview immediately" a provable semantic/state assertion (`e2e/map-theme.spec.ts`) rather than a screenshot.

Theme changes only ever affect the `mapId` named in the currently-open Settings page's URL — there is no shared/global preview state, and no code path derives which map's theme to show from anything other than that URL's `getOwnedMapContext(mapId)` resolution.

## 9. Preset behavior — see §2 above

Covered in full under "No `CUSTOM` preset — decision, not a gap."

## 10. Own POI markers — foundation only, no renderer yet

`MapThemeMarkerStyle` (`style: 'PIN' | 'DOT'`, `size: 'SMALL' | 'MEDIUM' | 'LARGE'`) is stored and editable via the Theme section's two dropdowns, and round-trips through Save/reload like every other theme field. **No code path renders an actual tenant POI marker on the admin map preview today** — the existing preview architecture (`lib/map-preview/`) draws the map itself, an optional bounds rectangle, and (in the separate `LocationPicker` component) a single POI's own pick-a-location marker, but never the full list of a map's saved POIs. Per the checkpoint's own explicit instruction, this checkpoint does not invent a POI-preview subsystem to give `markerStyle`/`markerSize` an immediate visual consumer — the values exist so the theme model has a settled shape once a POI-rendering preview (or the future public End User map) is built, without a breaking schema change at that point. This is a deliberately deferred piece, not an oversight — tracked in the completion report's "risks/deferred items."

## 11. Multi-map isolation

Every mutation continues to go through `getOwnedMapContext(mapId)` (§5) — a theme is just one more field on the same map document that boundary already protects. `e2e/map-theme.spec.ts` proves this directly: saving Map A's theme (a hand-picked `TOURIST_CLEAN` with a custom water color) never changes Map B's independently-saved theme for the same tenant, a forged `mapId` targeting another tenant's map is denied with the same anti-enumeration 404 every other cross-tenant map mutation already returns, and navigating between two owned maps' Settings pages shows each map's own persisted theme, never a leaked value from whichever map was open previously (each page load re-derives `initialTheme` fresh from that specific `mapId`'s own Firestore document — there is no cross-request or cross-map client-side cache to leak from).

## 12. Explicitly not implemented in this checkpoint

- The full public End User map — no `theme` consumer exists outside the admin Settings preview.
- Any Preview/Draft/Publish workflow beyond the existing live admin preview — `maps/{mapId}.theme` is still a draft-only field, same as every other map-settings value.
- Map versioning, Super Admin, Events, Live Camera, Android, custom domains, hotel bulk map creation, map cloning/templates.
- `MapboxThemeAdapter` — reserved as a documented future sibling module (§1), not implemented; selecting `MAPBOX` as `mapProvider.provider` still falls back to `map-preview.tsx`'s pre-existing "not yet implemented" summary, unchanged by this checkpoint.
- MapLibre / OpenStreetMap as a provider — not part of `MAP_PROVIDER_NAMES` today.
- A rendered POI-marker preview — see §10.
