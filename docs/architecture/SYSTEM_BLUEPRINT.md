# Tourist Map Platform — System Blueprint

**Status:** Approved / Canonical
**Location:** `docs/architecture/SYSTEM_BLUEPRINT.md`
**Supersedes:** `Tourist Map System.pdf` / `Untitled 1.odt` ("Full System Blueprint") and `Tourist Map System — Stage 1 Blueprint.odt/pdf`, both of which described an earlier, now-abandoned Android-first delivery order. Those files are retained in the project folder for historical reference only — see [Superseded Documents](#12-superseded-documents).

This document consolidates the approved current system architecture from the project's governing instructions and the approved "Final System Blueprint v1.0". It is the single source of truth for engineering decisions on the Tourist Map Platform. Where any other document (Markdown, ODT, PDF, chat message) disagrees with this file, this file wins unless a human explicitly revises it.

---

## 1. Product Vision

The Tourist Map Platform is a multi-tenant digital tourism platform for organizations such as JR/railway operators, hotels, municipalities/city offices, tourist information centers, airports, shopping facilities, museums, and other tourism organizations.

A client does not need a separately developed application. One platform, plus client-specific configuration, content, and branding, produces an independent-feeling tourist map service per client.

The guiding product principle:

```
CREATE ONCE → PUBLISH ONCE → EXPERIENCE EVERYWHERE
```

A single client map configuration must ultimately support: Standalone Web Tourist Map, Embeddable Tourist Map on client websites, QR/mobile destination experience, Android Tourist Map (Stage 2), and future widgets/integrations. The platform must never create separate content databases per channel (Web vs. Android, etc.) — all public experiences consume the same published map definition.

---

## 2. Three Platform Roles

```
SUPER ADMIN (our company) → CLIENT ADMIN (JR / hotel / municipality / facility) → TOURIST (public, no login)
```

- **Super Admin** — our company. Customer management, Widget Store, Feature Store, themes, map styles, platform monitoring, plans/billing, Android release management, analytics, platform administration. **Stage 3.** Do not prematurely implement Stage 3 features, but Stage 1 architecture must not block them.
- **Client Admin** — the customer (JR, hotel, municipality, tourist office, shopping center, etc.). Creates and manages maps, places, categories, multilingual content, voice guides, menus, branding, map area, events, live cameras, widgets; previews, publishes, and obtains public URLs and embed code.
- **Tourist / End User** — the public. No login required. Browses the map, searches, filters by category, selects markers, reads place info, changes language, plays voice guides, displays/scans QR codes, opens navigation.

---

## 3. Stage Boundaries (Authoritative)

This is the single most important correction versus older project documents: **Stage 1 is Web, not Android.**

| Stage | Scope | Status |
|---|---|---|
| **Stage 1** | **Web Tourist Map platform**: Client Admin Web, Tourist Web Map, **Embeddable Tourist Web Map (core Stage 1 requirement)**, Mobile QR destination/navigation experience. | Current priority |
| **Stage 2** | **Android Tourist Map** — Kotlin, Jetpack Compose. Consumes the **same published map configuration** and reproduces the **same content and UI/UX concept** as the Web product, plus kiosk/offline/device-specific functionality. | Do not start unless explicitly requested, and only after Stage 1 is stable |
| **Stage 3** | **Super Admin** — customer management, Widget Store, Feature Store, themes, map styles, platform monitoring, plans/billing, Android release management, analytics. | Do not build prematurely; Stage 1 must not block it |

Rules that follow from this:

- Website embedding is not a "nice to have" — it is a core Stage 1 deliverable alongside the standalone web map, on equal footing.
- Android must not be started during Stage 1 unless the user explicitly asks for it.
- Android (Stage 2) is a second **renderer** for the existing platform, not a second platform. It must not duplicate or diverge from the Web content model.
- Super Admin (Stage 3) work should not be pulled forward into Stage 1, but nothing in Stage 1 may be built in a way that blocks it later (e.g., ownership fields, versioning, and provider abstractions must already be in place).

---

## 4. Core Architecture Principle — Draft → Preview → Publish

This is the platform's central architectural rule and must not be bypassed by any feature:

```
CLIENT ADMIN
     │ Edit
     ▼
 DRAFT DATA
     │ Publish
     ▼
PUBLISHED MAP CONFIG
     │
 ┌───┼────────────┐
 ▼   ▼            ▼
WEB EMBED       ANDROID (Stage 2)
 │
 ▼
MOBILE QR
```

- A client editing a place must **never** immediately change the live tourist map.
- **Draft** — the Client Admin's working state (Maps, Places, Content).
- **Preview** — reads draft configuration and reproduces the real tourist map closely, so the client can test markers, categories, languages, side panel, menu, branding, voice, and QR before publishing.
- **Publish Engine** — validates draft → ownership → map → places → languages → menu, then generates a new version, creates an **immutable snapshot**, and sets it as the current published version.
  - Blocks publish on critical errors: missing map center, no enabled language, disabled default language, invalid coordinates/bounds, invalid ownership, invalid menu, broken required content.
  - Warns but allows publish for optional issues: missing optional image/translation/opening hours.
- **PublishedMapConfig** — the stable, versioned contract that every public channel (Web standalone, Web embed, and later Android) consumes. It contains: `map`, `branding`, `theme`, `languages`, `categories`, `menu`, `places`, `events`, `liveCameras`, `featureSettings`.
- **Versioning & Rollback** — each publish increments a version number (e.g., v42 → v43); prior snapshots remain available so a bad publish can be rolled back (e.g., v43 → v42 becomes current) without touching draft data.

---

## 5. Multi-Tenant Architecture

The platform is multi-tenant from the first commit.

- Every customer receives a `customerId` (e.g., `cust_jrwest_001`). Never use a company name or username as the primary identifier.
- Every map receives a `mapId` (e.g., `map_kyoto_station_001`).
- One customer can own multiple maps (e.g., JR West → Kyoto Station, Osaka Station, Kobe Station). Even if the initial UI exposes only one map per client, the data model must support multiple maps per customer.
- **Ownership rule:** every tenant-owned resource must be traceable to `customerId`; map resources additionally use `mapId`. Server-side enforcement concept: `authenticatedUser.customerId == resource.customerId`. A client must never read or write another customer's editable data.
- **Public data security:** public (tourist-facing) users may read only **published** content. They must never receive access to draft content, client account data, private settings, other customers' data, admin collections, or internal platform information.

The architecture must scale from 1 client to 1,000+ maps as **one platform** with per-customer configuration — never as separate per-client codebases or projects.

---

## 6. Product Channels

One published map, delivered through:

- **Channel A — Standalone Web Map**: full-viewport public map (e.g. `https://map.ourservice.jp/kyoto-station`). For public links, QR advertisements, tourism websites, PCs, tablets, touch displays.
- **Channel B — Client Website Embed** *(core Stage 1 requirement, equal priority to standalone web)*: the same published map embedded via `<iframe src="https://map.ourservice.jp/embed/{mapSlug}" ...>` into the client's existing website. No custom map development required client-side. Must support an allowed-domain policy (`allowedEmbedDomains`) and modern frame policies (e.g., CSP `frame-ancestors`); must be responsive to its container, not a fixed resolution.
- **Channel C — Mobile QR Experience**: a QR shown for a selected location opens a mobile-friendly destination page on our domain, which then opens navigation (e.g., Google Maps) from the tourist's current location.
- **Channel D — Android Tourist Map** *(Stage 2)*: same published configuration, same content, same UI/UX concept as Web, plus kiosk/offline/device-specific behavior.

---

## 7. QR / Destination Architecture

- QR codes must point to **our** permanent destination URL, never a raw, hard-coded Google Maps link: `https://map.ourservice.jp/m/{mapSlug}/p/{placeId}`.
- Flow: Selected Place → our permanent destination URL → QR code → tourist's smartphone → our mobile destination page (no login) → Open Directions → navigation provider (e.g., Google Maps), from current location to destination.
- This indirection is what allows future support for multiple navigation providers, walking/transit directions, analytics, language detection, and destination updates without reprinting or reissuing QR codes.

---

## 8. Technology

| Area | Choice |
|---|---|
| Web | Next.js, React, TypeScript |
| Package manager | pnpm |
| Auth | Firebase Authentication (email/password initially; Google/Microsoft/SSO later) |
| Database | Cloud Firestore |
| Media | Firebase Storage |
| Backend | Firebase Cloud Functions initially; Cloud Run when more complex services are needed |
| Maps | `MapProvider` abstraction — initial implementation Google Maps; architecture must allow Mapbox/MapLibre later, without coupling business logic to one provider |
| Places | Google Places API or a provider abstraction, respecting provider licensing/storage requirements for which fields are persisted |
| Voice | `VoiceGuideProvider` abstraction — initial implementation browser/device TTS; future: Android TTS, Google Cloud TTS, AWS Polly, Azure Speech, uploaded audio, AI voice |
| QR | Self-generated stable destination URLs (see §7) — never permanently encode only a raw Google Maps URL |
| Android (Stage 2) | Kotlin, Jetpack Compose |

**Map styles** are separate from map provider (e.g., Provider = Google, Style = Satellite). Supported styles: ROAD, SATELLITE, HYBRID, TERRAIN, CUSTOM.

**Map area** supports BOUNDED (center, default zoom, N/S/E/W bounds — useful for a station area, hotel neighborhood, district) and UNBOUNDED. Interaction (pan/zoom/rotate/tilt) is client-configurable, typically more restricted for public touch signage than for normal web users.

---

## 9. Monorepo Target

```
tourist-map-system/
├── apps/
│   ├── admin-web/
│   └── tourist-web/        (mobile QR/destination experience lives inside tourist-web)
├── packages/
│   ├── shared-types/
│   ├── map-schema/         ← most important shared package (see §10)
│   ├── map-core/
│   ├── validation/
│   ├── localization/
│   └── ui-tokens/
├── firebase/
│   ├── functions/
│   ├── firestore.rules
│   ├── storage.rules
│   └── firestore.indexes.json
├── docs/
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

Stage 2 later adds `apps/android-signage/`. Do not create the Android app during Stage 1 unless explicitly requested.

---

## 10. Shared Contract

The `map-schema` package defines `PublishedMapConfig`, `MapDefinition`, `Place`, `Category`, `Translation`, `MenuItem`, `Theme`, `Event`, `LiveCamera`. Android (Stage 2) implements compatible models based on this same documented schema so Web and Android behavior cannot drift apart — **platform data must never be duplicated separately for Web and Android.**

---

## 11. Content Model Essentials

- **Translations**: never separate place records per language. Each content object (`Place`, `Category`, `Menu`, `Event`, announcement, custom UI label) carries a `translations` map keyed by language (`en`, `ja`, `zh-CN`, `ko`, ...) with fields like `title`, `shortDescription`, `description`. Fallback: if the selected language's translation is missing, fall back to the default language — the UI must never render empty because one translation is missing.
- **Places**: added via external place-provider search/import (place ID, name, address, coordinates, photo references, business info — subject to provider licensing) or as a fully custom place (required: name, category, lat/lng, description, image; optional: address, phone, website, hours, gallery, custom marker, voice settings). Coordinates should be selectable directly from the admin map.
- **Categories & Menu**: fully client-configurable (enable/disable, rename, icon, order) — different clients can have different menus without different application code.
- **Events**: time-boxed content with `startAt`/`endAt` and status DRAFT/SCHEDULED/ACTIVE/EXPIRED; can auto-expire.
- **Live Cameras**: optional per map; the Live Camera menu entry only appears if enabled. Initial implementation can be a YouTube URL; HLS/WebRTC are future providers.
- **Branding**: controlled theme options (logo, map name, primary/secondary color, surface/menu/marker style) — not arbitrary CSS, to protect readability and prevent clients from breaking the UI.
- **Search**: prioritizes client-published content (name, description, category, keywords) rather than open-ended external search results, to keep the map curated.

---

## 12. Firestore Conceptual Structure

```
customers/{customerId}
users/{uid}
maps/{mapId}
maps/{mapId}/places/{placeId}
maps/{mapId}/categories/{categoryId}
maps/{mapId}/menu/{menuItemId}
maps/{mapId}/languages/{languageId}
maps/{mapId}/events/{eventId}
maps/{mapId}/liveCameras/{cameraId}
maps/{mapId}/widgetInstances/{widgetInstanceId}
publishedMaps/{mapId}
publishedMaps/{mapId}/versions/{versionId}
devices/{deviceId}
```

Later (Stage 3): `widgetDefinitions/`, `themes/`, `mapStyles/`, `features/`, `plans/`.

Media storage follows a parallel tenant/map-scoped layout under `customers/{customerId}/branding/`, `maps/{mapId}/places/`, `maps/{mapId}/events/`, `maps/{mapId}/markers/`, `maps/{mapId}/audio/`. Uploads require authenticated ownership; published assets are served per public-map requirements.

---

## 13. Performance & Reliability Principles

- The public tourist map must not query dozens of editable Firestore collections on every load — it reads the **optimized published snapshot**, not live CMS collections. Startup priority: Map Shell → Published Config → Visible Markers → Images/secondary content.
- Static/media assets should use appropriate cache headers and CDN delivery where available.
- **Failure isolation**: an external API failure (e.g., Places search) must not take down already-published content. Voice failure ≠ map failure. Image failure ≠ place failure. Analytics failure ≠ tourist-map failure.

### Architectural Rules (non-negotiable)

1. Draft data is never public.
2. Public applications consume published snapshots only.
3. A bad new publish must be recoverable by rollback.
4. One external feature failing must not break the map.
5. Tenant isolation is enforced server-side.
6. Web and Android share one published content model.
7. Map-provider-specific code stays behind an abstraction.
8. Client customization uses controlled configuration, not arbitrary executable code.

---

## 14. Privacy

Tourists remain anonymous by default — no name, email, account, or login required for ordinary map usage. Collect only the minimum analytics required. Do not permanently store precise smartphone location merely because the tourist requested navigation.

---

## 15. UI/UX Reference Note — Platinumaps Explorer Map

**Platinumaps Explorer Map is a UI/UX reference only.** It may be used to inform interaction concepts (map-first layout, photo markers, bottom menu, side/bottom-sheet place detail, etc.), but:

- Do **not** copy Platinumaps' proprietary code, assets, or branded design elements.
- Do **not** reproduce their asset files, icon sets, or any content that is not our own.
- Treat any resemblance as inspiration for interaction patterns (documented independently in `docs/` and in the `tourist-map-ui` skill), not as a source to port from.

---

## 16. Superseded Documents

The following files, present in the project folder, describe an **earlier, no-longer-approved** architecture in which Stage 1 was Android-signage-first (Client Admin + Android Tourist Signage + Mobile QR, with Stage 2 as "Advanced Client Features" and no website-embed product). They are kept for historical/archival reference only and must not be used as a source of truth for implementation:

- `Tourist Map System.pdf` ("Full System Blueprint")
- `Untitled 1.odt` (same "Full System Blueprint" content, ODT source)
- `Tourist Map System — Stage 1 Blueprint.pdf`
- `Tourist Map System — Stage 1 Blueprint.odt` (same content, ODT source)

See the [companion conflict summary](#) delivered alongside this document for the specific points where they diverge from this blueprint.

This document (`docs/architecture/SYSTEM_BLUEPRINT.md`) and `docs/stages/STAGE_1_BLUEPRINT.md` are the authoritative engineering source of truth going forward.
