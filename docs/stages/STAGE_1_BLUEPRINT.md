# Stage 1 Blueprint — Web Platform

**Status:** Approved / Canonical
**Location:** `docs/stages/STAGE_1_BLUEPRINT.md`
**Parent document:** [`docs/architecture/SYSTEM_BLUEPRINT.md`](../architecture/SYSTEM_BLUEPRINT.md) — this file expands Stage 1 only; the system-wide architecture, stage boundaries, and rules defined there apply here and take precedence in case of any apparent conflict.

Stage 1 is the **Web Platform**. It is a permanent product, not a temporary prototype, and it is complete in itself: Client Admin, Tourist Web Map, Embeddable Tourist Web Map, and the Mobile QR/navigation experience. Android (Stage 2) and Super Admin (Stage 3) are explicitly out of scope for Stage 1 and must not be started unless the user explicitly requests it.

---

## 1. Stage 1 Scope

- Client Registration
- Client Login
- Multi-Tenant Architecture (`customerId`, `mapId`)
- Client Dashboard
- Map Settings
- Places (custom + external import)
- Categories
- Multilingual Content
- Menu Configuration
- Basic Branding
- Tourist Web Map (standalone)
- Photo Markers
- Marker Filtering
- Place Side Panel
- Voice Guide
- QR Navigation
- Mobile Destination Page
- **Website Embed** — core Stage 1 deliverable, not a later add-on
- Preview
- Publish
- Versioning
- Basic Rollback
- Security
- Production Deployment

---

## 2. Stage 1 Definition of Done

Stage 1 is complete only when this entire workflow succeeds end-to-end:

```
Client visits registration
        ↓
Creates account → customerId created → mapId created
        ↓
Logs into Client Admin
        ↓
Configures map, creates categories
        ↓
Adds an external place + a custom place, uploads images
        ↓
Adds multilingual descriptions
        ↓
Configures menu and branding
        ↓
Previews the map
        ↓
Publishes
        ↓
Standalone Web Map updates AND Embedded Web Map updates
        ↓
Tourist selects a category, selects a photo marker
        ↓
Left detail panel opens
        ↓
Tourist changes language → description changes
        ↓
Voice Guide plays
        ↓
QR displays → phone scans QR
        ↓
Mobile destination page opens → Directions open successfully
```

Additionally, independently: a client website with the generated `<iframe>` embed must show the same published tourist map working correctly.

---

## 3. Development Phases (1A–1K)

### Phase 1A — Foundation

Repository, Next.js applications (`admin-web`, `tourist-web`), Firebase environments, Authentication, Customer model, User model, Map model, security foundation.

**Acceptance:** Client registers → `customerId` created → `mapId` created → dashboard opens.

### Phase 1B — Map CMS

Map settings, map center, map range (bounded/unbounded), categories, basic branding.

### Phase 1C — Places

Place list, create custom place, place editor, coordinates (selectable from admin map), images, external place search/import, photo marker configuration.

**Acceptance:** Client can create 10+ valid places.

### Phase 1D — Languages

Enabled languages, default language, translation editor, translation fallback (never render empty on a missing translation).

### Phase 1E — Tourist Web Core

Public map route, map rendering, photo markers, bottom menu, category filtering, search, language selector, responsive layout. This establishes the main selected UI/UX (map-first, touch-friendly, low-learning-curve — see the `tourist-map-ui` skill and the Platinumaps UI/UX reference note in the system blueprint, §15).

### Phase 1F — Place Detail

Marker selection, camera movement, left detail panel (desktop, ~35–40% width), responsive mobile panel (bottom sheet / full-width on small screens, same content and actions), place image, description, address, opening hours.

### Phase 1G — Voice Guide

TTS abstraction (`VoiceGuideProvider`), play, stop, language integration, place-change handling.

### Phase 1H — QR / Mobile Navigation

Permanent destination URL (`https://map.ourservice.jp/m/{mapSlug}/p/{placeId}` — never a raw Google Maps URL), QR generation, mobile destination page (no login), Open Directions, Google Maps integration.

### Phase 1I — Website Embedding

`/embed/{mapSlug}` route, responsive embed (adapts to container, not a fixed resolution), generated `<iframe>` code, allowed-domain policy (`allowedEmbedDomains`, CSP `frame-ancestors`), embed configuration, integration documentation for clients.

**Acceptance:** Client copies one embed snippet → pastes into their own website → published map works there.

### Phase 1J — Preview / Publish

Draft, Preview (reproduces the real tourist map closely), publish validation (blocking vs. warning rules per the system blueprint §4), published immutable snapshot, versioning, basic rollback.

### Phase 1K — Production Hardening

Security rules, error handling, logging, caching, performance, responsive testing, cross-browser testing, accessibility basics, external API failure handling (failures isolated per system blueprint §13), deployment.

---

## 4. Explicitly Out of Scope for Stage 1

- Android application of any kind (`apps/android-signage/`) — Stage 2.
- Kiosk mode, offline caching, device registration/heartbeat — Stage 2 (Android-specific).
- Super Admin dashboard, Widget Store, Feature Store, themes/map-styles marketplace, plans/billing, platform-wide monitoring — Stage 3.
- Advanced analytics, advertising platform, train/weather integrations, WebRTC live-camera infrastructure, MDM, and support for many map providers beyond the initial `MapProvider` abstraction target.

These are not forgotten — the system blueprint's provider abstractions, ownership model, and versioning are designed so none of them are blocked later — they are simply sequenced after Stage 1 is stable.
