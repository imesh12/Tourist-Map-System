# Tourist Map Platform — Final System Blueprint v1.0

**Project:** Tourist Map Platform
**Purpose:** Multi-tenant digital tourist map, multilingual voice guide, QR navigation, client CMS, embeddable web map, and Android signage platform.

---

## 1. Product Vision

The Tourist Map Platform provides organizations such as railway companies, hotels, municipalities, tourist information centers, airports, shopping facilities, museums, and other tourism-related organizations with their own configurable digital tourist maps.

A client does not need a separately developed application. The platform provides:

```
One Platform
    +
Client-specific configuration
    +
Client-specific content
    +
Client-specific branding
    =
Independent Tourist Map Service
```

Examples:

```
JR
 └─ Kyoto Station Tourist Map

Hotel A
 └─ Nearby Tourist Guide

City Office B
 └─ City Tourism Map
```

Each can look different while using the same platform.

---

## 2. Three Platform Roles

The complete platform has three user levels.

```
SUPER ADMIN
Our Company
       │
       ▼
CLIENT ADMIN
JR / Hotel / Municipality / Facility
       │
       ▼
END USER
Tourist
```

### Super Admin

Operated by our company. Responsibilities eventually include:

- Customer management
- Platform management
- Widget Store
- Feature Store
- Themes
- Map styles
- Android releases
- Monitoring
- Plans
- Usage
- Platform configuration

Super Admin is a later development stage.

### Client Admin

Operated by the customer. Examples: JR, Hotel, Municipality, Tourist office, Shopping center.

Client Admin can:

- Create maps
- Configure maps
- Add locations
- Import locations
- Add custom places
- Manage categories
- Add multilingual content
- Configure voice guides
- Configure menus
- Configure branding
- Configure map area
- Add events
- Add live cameras
- Install supported widgets
- Preview changes
- Publish changes
- Obtain public URLs
- Obtain website embed code

### Tourist

No account is required. Tourists can:

- Browse the map
- Search places
- Select categories
- Select markers
- Read place information
- Change language
- Listen to voice guides
- Display QR codes
- Scan destinations using their smartphone
- Open navigation to the destination

---

## 3. Final Delivery Strategy

The manager's revised development strategy is:

```
STAGE 1
WEB PLATFORM
       │
       ├─ Client Admin
       ├─ Tourist Web Map
       ├─ Embeddable Tourist Map
       └─ QR Mobile Experience

               ↓

STAGE 2
ANDROID TOURIST MAP
Same content
Same configuration
Same UI/UX concept

               ↓

STAGE 3
SUPER ADMIN PLATFORM
Store / Platform Management
```

The Web Tourist Map is therefore a permanent product, not a temporary prototype.

---

## 4. Core Architecture Principle

The most important architectural rule is:

```
                  CLIENT ADMIN
                       │
                       │ Edit
                       ▼
                   DRAFT DATA
                       │
                       │ Publish
                       ▼
              PUBLISHED MAP CONFIG
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
     WEB MAP       EMBED MAP      ANDROID

          │
          ▼
      MOBILE QR
```

All public experiences consume the same published map definition.

```
Create Once
Configure Once
Publish Once
Use Everywhere
```

---

## 5. Product Channels

A published map can be delivered through four channels.

### Channel A — Standalone Web Map

Example concept: `https://map.ourservice.jp/kyoto-station`

The map occupies the full browser viewport. Suitable for: public links, QR advertisements, tourism websites, PCs, tablets, touch displays.

### Channel B — Client Website Embed

The same map can be embedded into the client's existing website.

```html
<iframe
  src="https://map.ourservice.jp/embed/kyoto-station"
  width="100%"
  height="700"
  style="border:0"
  allow="geolocation">
</iframe>
```

Suitable for clients that already have their own websites. No custom map development is required on their side.

### Channel C — Mobile QR Experience

A QR displayed for a selected location opens a mobile-friendly destination page.

```
Signage/Web Map
      ↓
Select Destination
      ↓
Show QR
      ↓
Smartphone Scan
      ↓
Destination Page
      ↓
Open Directions
      ↓
Google Maps
      ↓
Current Location → Destination
```

### Channel D — Android Tourist Map

Stage 2 delivers the same tourist-map experience as an Android application. It consumes the same published configuration.

---

## 6. System Architecture

```
                        TOURIST MAP CLOUD
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    CLIENT ADMIN WEB                         │
│                           │                                 │
│                           ▼                                 │
│                  Authentication                             │
│                           │                                 │
│                           ▼                                 │
│                     CLIENT CMS                              │
│                           │                                 │
│             ┌─────────────┼──────────────┐                  │
│             ▼             ▼              ▼                  │
│           Maps          Places         Content              │
│             │             │              │                  │
│             └─────────────┼──────────────┘                  │
│                           ▼                                 │
│                       DRAFT DATA                            │
│                           │                                 │
│                     Publish Engine                          │
│                           │                                 │
│                           ▼                                 │
│                Published Map Config                         │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
         Web Tourist     Embed Map      Android
             Map                         Stage 2
              │
              ▼
          QR / Mobile
              │
              ▼
         Navigation
```

---

## 7. Recommended Technology

### Web Applications

- Next.js
- React
- TypeScript

Applications: `admin-web`, `tourist-web`. The mobile QR experience can initially live inside `tourist-web`.

### Authentication

Firebase Authentication. Initial authentication: Email + Password. Future: Google, Microsoft, Enterprise SSO.

### Database

Cloud Firestore.

### Media Storage

Firebase Storage. Used for: client logos, custom place images, marker images, event images, galleries, uploaded audio, theme assets.

### Backend

Start with Firebase Cloud Functions. Use Cloud Run where more complex backend services are required.

### Android

Stage 2: Kotlin, Jetpack Compose.

---

## 8. Multi-Tenant Architecture

The platform must be multi-tenant from the first commit. Every customer receives a `customerId`. Every map receives a `mapId`.

Example: `customerId: cust_jrwest_001`, `mapId: map_kyoto_station_001`.

Never use a company name or username as the primary identifier.

---

## 9. Customer → Map Relationship

One customer can own multiple maps.

```
Customer
│
├── Map A
│
├── Map B
│
└── Map C
```

Example:

```
JR West
│
├── Kyoto Station
├── Osaka Station
└── Kobe Station
```

Even if the initial UI exposes only one map, the data model must support multiple maps.

---

## 10. Client Registration

Client opens `/register`.

Registration form: Company Name, Contact Name, Email, Password, Confirm Password, Client Type.

Client type: Railway, Hotel, Municipality, Tourism Organization, Shopping Facility, Other.

---

## 11. Registration Process

```
Submit Registration
       ↓
Validate
       ↓
Create Firebase User
       ↓
Create customerId
       ↓
Create Customer
       ↓
Create Client User
       ↓
Create Default Map
       ↓
Create mapId
       ↓
Create Default Categories
       ↓
Create Default Settings
       ↓
Client Dashboard
```

Creation should be handled atomically where practical so a failed registration does not leave an unusable tenant.

---

## 12. Client Admin Navigation

Recommended Client Admin structure:

```
Dashboard

Maps
 └─ Map Settings

Content
 ├─ Places
 ├─ Categories
 ├─ Events
 └─ Live Cameras

Design
 ├─ Branding
 ├─ Theme
 ├─ Menu
 └─ Markers

Languages

Voice Guide

Map Area

Integrations
 └─ Website Embed

Preview

Publish

Account
```

Later: Widgets, Analytics, Devices.

---

## 13. Client Dashboard

Dashboard should show:

```
Map Name

Status
Draft / Published

Places
25

Categories
6

Languages
4

Published Version
v18

Last Published
2026-08-19 09:00

Public Map
[Open]

[Preview]

[Publish]
```

---

## 14. Tourist Web UI/UX

The tourist UI follows the interaction concept already selected. The map is the primary interface.

```
┌───────────────────────────────────────────────────────────────┐
│ 🔎 Search                                  EN 日本語 中文 한국어│
│                                                               │
│                                                               │
│                         MAP                                   │
│                                                               │
│      ┌────────┐                    ┌────────┐                  │
│      │ PHOTO  │                    │ PHOTO  │                  │
│      └────────┘                    └────────┘                  │
│      Kyoto Tower                   Yodobashi                  │
│                                                               │
│                 ┌────────┐                                    │
│                 │ PHOTO  │                                    │
│                 └────────┘                                    │
│                 Restaurant                                    │
│                                                               │
│         ┌──────────────────────────────────────────┐          │
│         │ 🏯    🍴    🛍    🎪    🔊    🔎       │          │
│         │ Sight Food Shop Event Audio Search      │          │
│         └──────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
```

---

## 15. Tourist UI Principles

The interface should be: map-first, touch friendly, simple, visual, multilingual, suitable for public users, suitable for large displays, responsive, fast, low-learning-curve.

Avoid: complex navigation, deep page hierarchies, small controls, excessive text, admin-like UI, unnecessary map controls.

---

## 16. Photo Markers

Primary marker design:

```
┌───────────────┐
│  Place Image  │
└───────────────┘
       │
  Place Name
```

Supported marker types: `PHOTO`, `DEFAULT_PIN`, `CUSTOM_IMAGE`, `CATEGORY_ICON`. Default: `PHOTO`.

---

## 17. Marker Selection

When a marker is selected:

```
Tap Marker
     ↓
Set Selected Place
     ↓
Map Camera Moves
     ↓
Selected Marker Highlighted
     ↓
Left Detail Panel Slides In
```

The user does not leave the map.

---

## 18. Place Detail Side Panel

Desktop / large-display target:

```
┌───────────────────────┬───────────────────────────────────────┐
│                       │                                       │
│      PLACE IMAGE      │                                       │
│                   ✕   │                                       │
├───────────────────────┤                                       │
│                       │                                       │
│ Yodobashi Kyoto       │                                       │
│                       │                MAP                    │
│ ★ Rating              │                                       │
│                       │          Selected Marker              │
│ 🔊 Voice Guide        │                                       │
│                       │                                       │
│ ▣ Show QR             │                                       │
│                       │                                       │
│ Description           │                                       │
│                       │                                       │
│ Address               │                                       │
│ Opening Hours         │                                       │
│                       │                                       │
└───────────────────────┴───────────────────────────────────────┘
```

Recommended panel width: 35–40%.

---

## 19. Responsive Place Detail

On smaller screens, do not force the desktop side panel.

```
Large Screen
     ↓
Left Side Panel

Small Screen
     ↓
Bottom Sheet / Full-width Detail Panel
```

The content and actions remain the same.

---

## 20. Place Detail Content

Core fields: Main Image, Place Name, Description, Voice Guide, QR Navigation, Address, Opening Hours.

Optional: Rating, Phone, Website, Gallery.

Client can later control which fields are visible.

---

## 21. Categories

Default: All, Sightseeing, Gourmet, Shopping, Events. Categories must be configurable.

Hotel example: Nearby, Restaurants, Shopping, Transportation, Hospital, ATM.

JR example: Tourism, Station Facilities, Food, Shopping, Hotels, Bus, Taxi.

---

## 22. Bottom Menu

Menu is generated from the client's configuration.

Example: Sightseeing, Gourmet, Shopping, Events, Audio Guide, Search.

Client controls: Enable, Disable, Rename, Icon, Display Order.

Therefore Client A and Client B can have different menus without different application code.

---

## 23. Places

Two methods are supported.

```
ADD PLACE
   │
   ├── Search External Place Provider
   │
   └── Create Custom Place
```

---

## 24. Place Search / Import

Client searches, e.g. "ヨドバシカメラ 京都", and selects a result.

The system can populate supported information such as: Place ID, Name, Address, Coordinates, Photo references, Business information.

Client then adds/customizes tourism-specific content. Provider licensing and storage requirements must be respected when deciding which external fields are persisted.

---

## 25. Custom Place

Required: Name, Category, Latitude, Longitude, Description, Image.

Optional: Address, Phone, Website, Opening Hours, Gallery, Custom Marker, Voice Settings.

The client should be able to select coordinates directly from the admin map.

---

## 26. Multilingual Architecture

Map configuration: Default = English. Enabled = English, Japanese, Simplified Chinese, Korean.

Tourist sees only enabled languages.

---

## 27. Translation Model

Do not create separate place records for each language. Use:

```
translations
│
├── en
│    ├── title
│    ├── shortDescription
│    └── description
│
├── ja
│    ├── title
│    ├── shortDescription
│    └── description
│
├── zh-CN
│
└── ko
```

This pattern also applies to: Categories, Menus, Events, Announcements, Custom UI labels.

---

## 28. Translation Fallback

```
Selected Language
       ↓
Translation Available?
    ┌──┴──┐
   YES    NO
    │      │
    ▼      ▼
Selected  Default
Language  Language
```

The UI must never become empty because one translation is missing.

---

## 29. Voice Guide

Tourist selects a place and presses 🔊 Voice Guide.

```
Selected Place
      ↓
Current Language
      ↓
Translated Description
      ↓
Voice Provider
      ↓
Audio Playback
```

Initial implementation can use browser/device TTS. Create a provider abstraction so future implementations can include: Browser TTS, Android TTS, Google Cloud TTS, AWS Polly, Azure Speech, Uploaded Audio, AI Voice.

---

## 30. QR Navigation

Place panel: [Show QR]. QR should point to our platform.

Recommended structure: `https://map.ourservice.jp/m/{mapSlug}/p/{placeId}`

Do not permanently encode only a Google Maps URL.

---

## 31. QR Architecture

```
Selected Place
      ↓
Our Permanent Destination URL
      ↓
QR Code
      ↓
Tourist Smartphone
      ↓
Our Mobile Destination Page
      ↓
Open Directions
      ↓
Navigation Provider
```

This allows future support for: Google Maps, Apple Maps, Walking directions, Transit, Analytics, Language detection, Destination updates — without changing existing QR codes.

---

## 32. Mobile Destination Page

```
┌────────────────────────────┐
│       [PLACE IMAGE]        │
│                            │
│ Yodobashi Kyoto            │
│                            │
│ Short description          │
│                            │
│ 📍 Destination             │
│                            │
│ [Open Directions]          │
│                            │
│ [Google Maps]              │
└────────────────────────────┘
```

No login required.

---

## 33. Website Embedding

Website embedding is a core Stage 1 feature. Client publishes map. Client Admin generates: Public URL, Embed Code.

```html
<iframe
  src="https://map.ourservice.jp/embed/kyoto-station"
  width="100%"
  height="700"
  style="border:0"
  allow="geolocation">
</iframe>
```

Client copies and pastes this into its website.

---

## 34. Website Integration Screen

```
Website Integration

Public Map
https://map.ourservice.jp/kyoto-station

[Copy URL]


Embed Map

<iframe ...></iframe>

[Copy Embed Code]


Allowed Domains

hotel-example.jp
www.hotel-example.jp

[Add Domain]
```

Our company can also perform this integration for clients.

---

## 35. Embed Security

Maps should support an allowed-domain policy.

```
allowedEmbedDomains:

www.client.jp
tourism.client.jp
```

Use modern browser frame policies such as Content Security Policy `frame-ancestors`. The system should support a deliberate public-embed mode where appropriate.

---

## 36. Embed Responsive Design

The embedded map must adapt to the container. Do not assume 1920×1080. Support: Desktop, Laptop, Tablet, Mobile, Large signage browser.

---

## 37. Embed Configuration

Initial: `/embed/{mapSlug}`

Future optional parameters: `?lang=ja`, `?category=shopping`, `?place=yodobashi`.

This allows clients to embed specific map states.

---

## 38. Map Provider Architecture

Do not couple the platform's business logic directly to one provider. Create `MapProvider`.

Implementations: Google Maps, Mapbox. Future: MapLibre, Other providers.

Common operations: initialize, setCenter, setZoom, setBounds, addMarker, selectMarker, removeMarker, setStyle, moveCamera.

---

## 39. Map Styles

Separate provider from visual style. Examples: ROAD, SATELLITE, HYBRID, TERRAIN, CUSTOM.

Example: Provider = Google, Style = Satellite.

---

## 40. Map Area

Support: BOUNDED, UNBOUNDED.

**Bounded** — useful for: Station area, Hotel neighborhood, Tourism district, Shopping center, Municipality-selected region. Configuration: Center, Default Zoom, North, South, East, West.

**Unbounded** — allows broader map navigation.

---

## 41. Map Interaction

Client-configurable options: Allow Pan, Allow Zoom, Allow Rotation, Allow Tilt.

For public touch signage: Pan = Limited, Zoom = Limited, Rotation = Off, Tilt = Off.

For normal web users, interaction can be less restricted.

---

## 42. Search

Initial search should prioritize client-published content.

Search fields: Place Name, Description, Category, Keywords.

Example: Search "ramen" → Results select existing curated locations. This avoids filling the client's tourism map with uncontrolled external search results.

---

## 43. Events

Events are time-sensitive content.

Fields: eventId, title, description, image, location, startAt, endAt, category, translations, status.

States: DRAFT, SCHEDULED, ACTIVE, EXPIRED. Events can automatically disappear after expiration.

---

## 44. Live Cameras

Client can optionally add: Title, Description, Location, Thumbnail, YouTube URL, Enabled.

If Live Camera is not enabled, no Live Camera menu is displayed. Future providers can include HLS/WebRTC.

---

## 45. Branding

Client configuration: Logo, Map Name, Primary Color, Secondary Color, Surface Style, Menu Style, Marker Style.

Stage 1 should use controlled theme options rather than arbitrary CSS. This protects readability and prevents clients from accidentally breaking the UI.

---

## 46. Draft / Preview / Publish

This is one of the most important platform rules.

```
CLIENT EDITS
     ↓
DRAFT
     ↓
PREVIEW
     ↓
PUBLISH
     ↓
PUBLIC MAP
```

A client changing a place must not immediately modify the live tourist map.

---

## 47. Preview

Preview reads Draft Configuration. It should reproduce the real tourist map closely. Client can test: Markers, Categories, Languages, Side panel, Menu, Branding, Voice, QR — before publishing.

---

## 48. Publish Engine

```
Publish Requested
       ↓
Validate Draft
       ↓
Validate Ownership
       ↓
Validate Map
       ↓
Validate Places
       ↓
Validate Languages
       ↓
Validate Menu
       ↓
Generate Version
       ↓
Create Immutable Snapshot
       ↓
Set Current Published Version
```

---

## 49. Publish Validation

Block publish for critical errors such as: Missing Map Center, No Enabled Language, Disabled Default Language, Invalid Coordinates, Invalid Bounds, Invalid Ownership, Invalid Menu, Broken Required Content.

Warn but allow publish for optional issues such as: Missing optional image, Missing optional translation, Missing opening hours.

---

## 50. Published Map Configuration

Public clients should consume a stable configuration contract.

```
PublishedMapConfig
│
├── map
├── branding
├── theme
├── languages
├── categories
├── menu
├── places
├── events
├── liveCameras
└── featureSettings
```

Web and Android consume the same contract.

---

## 51. Versioning

Example: Current Published Version = 42. Client modifies draft → Publish → Version = 43.

The previous published snapshot should remain available for rollback.

---

## 52. Rollback

Recommended: v41, v42, v43 ← current. If v43 has a problem: Rollback → v42 becomes current.

This is valuable for real commercial deployments.

---

## 53. Firestore Conceptual Structure

```
customers/
  {customerId}

users/
  {uid}

maps/
  {mapId}

maps/{mapId}/places/
  {placeId}

maps/{mapId}/categories/
  {categoryId}

maps/{mapId}/menu/
  {menuItemId}

maps/{mapId}/languages/
  {languageId}

maps/{mapId}/events/
  {eventId}

maps/{mapId}/liveCameras/
  {cameraId}

maps/{mapId}/widgetInstances/
  {widgetInstanceId}

publishedMaps/
  {mapId}

publishedMaps/{mapId}/versions/
  {versionId}

devices/
  {deviceId}
```

Later: `widgetDefinitions/`, `themes/`, `mapStyles/`, `features/`, `plans/`.

---

## 54. Core Ownership Rule

Every tenant-owned resource must be traceable to `customerId`. Map resources additionally use `mapId`.

Security rule concept:

```
Authenticated User.customerId
        ==
Requested Resource.customerId
```

A client must never be able to access another customer's editable information.

---

## 55. Public Data Security

Public users should read only Published Content. They must never receive access to: Draft Content, Client Account Data, Private Settings, Other Customers, Admin Collections, Internal Platform Information.

---

## 56. Media Storage

```
customers/
  {customerId}/branding/

maps/
  {mapId}/places/

maps/
  {mapId}/events/

maps/
  {mapId}/markers/

maps/
  {mapId}/audio/
```

Uploads require authenticated ownership. Published assets can be served according to public-map requirements.

---

## 57. Recommended Repository

```
tourist-map-system/
│
├── apps/
│   ├── admin-web/
│   └── tourist-web/
│
├── packages/
│   ├── shared-types/
│   ├── map-schema/
│   ├── map-core/
│   ├── validation/
│   ├── localization/
│   └── ui-tokens/
│
├── firebase/
│   ├── functions/
│   ├── firestore.rules
│   ├── storage.rules
│   └── firestore.indexes.json
│
├── docs/
│
└── README.md
```

Stage 2 adds: `apps/android-signage/`.

---

## 58. Shared Contract

The most important shared package is `map-schema`. It defines concepts such as: PublishedMapConfig, MapDefinition, Place, Category, Translation, MenuItem, Theme, Event, LiveCamera.

Android should implement compatible models based on the same documented schema. This prevents Web and Android behavior from drifting apart.

---

## 59. Web Performance Strategy

The public tourist map should not query dozens of editable Firestore collections on every load.

```
Client CMS Collections
       ↓
Publish
       ↓
Optimized Published Snapshot
       ↓
Public Delivery
```

This improves: Performance, Reliability, Caching, Security, Versioning, Android compatibility.

---

## 60. Caching

Published configuration should support caching. Static/media assets should use appropriate cache headers and CDN delivery where available.

Public map startup should prioritize:

```
Map Shell
     ↓
Published Config
     ↓
Visible Markers
     ↓
Images / secondary content
```

Avoid blocking the entire map on non-critical data.

---

## 61. Failure Handling

If an external API fails: existing published map continues working. For example, a Google Places administration search failure must not stop already-published locations from displaying.

Likewise: Voice failure ≠ Map failure. Image failure ≠ Place failure. Analytics failure ≠ Tourist map failure.

Features should fail independently wherever possible.

---

## 62. Stage 1 Scope

Client Registration, Client Login, Multi-Tenant Architecture, Client Dashboard, Map Settings, Places, Custom Places, External Place Import, Categories, Multilingual Content, Menu Configuration, Basic Branding, Tourist Web Map, Photo Markers, Marker Filtering, Place Side Panel, Voice Guide, QR Navigation, Mobile Destination Page, Standalone Public Map, Website Embed, Preview, Publish, Versioning, Basic Rollback, Security, Production Deployment.

---

## 63. Stage 1 Development Phases

**Phase 1A — Foundation**: Repository, Next.js applications, Firebase environments, Authentication, Customer model, User model, Map model, Security foundation.

Acceptance: Client registers → customerId created → mapId created → dashboard opens.

**Phase 1B — Map CMS**: Map settings, Map center, Map range, Categories, Basic branding.

**Phase 1C — Places**: Place list, Create custom place, Place editor, Coordinates, Images, External place search/import, Photo marker configuration.

Acceptance: Client can create 10+ valid places.

**Phase 1D — Languages**: Enabled languages, Default language, Translation editor, Translation fallback.

**Phase 1E — Tourist Web Core**: Public map route, Map rendering, Photo markers, Bottom menu, Category filtering, Search, Language selector, Responsive layout. This establishes the main selected UI/UX.

**Phase 1F — Place Detail**: Marker selection, Camera movement, Left detail panel, Responsive mobile panel, Place image, Description, Address, Opening hours.

**Phase 1G — Voice Guide**: TTS abstraction, Play, Stop, Language integration, Place-change handling.

**Phase 1H — QR / Mobile Navigation**: Permanent destination URL, QR generation, Mobile destination page, Open Directions, Google Maps integration.

**Phase 1I — Website Embedding**: `/embed/{mapSlug}`, Responsive embed, Generated iframe code, Allowed domains, Embed configuration, Integration documentation.

Acceptance: Client copies one embed snippet → pastes into own website → published map works.

**Phase 1J — Preview / Publish**: Draft, Preview, Validation, Published snapshot, Versioning, Rollback.

**Phase 1K — Production Hardening**: Security Rules, Error handling, Logging, Caching, Performance, Responsive testing, Cross-browser testing, Accessibility basics, External API failure handling, Deployment.

---

## 64. Stage 1 Definition of Done

Stage 1 is complete when this entire workflow succeeds:

```
Client visits registration
        ↓
Creates account
        ↓
customerId created
        ↓
mapId created
        ↓
Logs into Client Admin
        ↓
Configures map
        ↓
Creates categories
        ↓
Adds external place
        ↓
Adds custom place
        ↓
Uploads images
        ↓
Adds multilingual descriptions
        ↓
Configures menu
        ↓
Configures branding
        ↓
Previews map
        ↓
Publishes
        ↓
Standalone Web Map updates
        ↓
Embedded Web Map updates
        ↓
Tourist selects category
        ↓
Selects photo marker
        ↓
Left detail panel opens
        ↓
Changes language
        ↓
Description changes
        ↓
Voice Guide plays
        ↓
QR displays
        ↓
Phone scans QR
        ↓
Mobile destination page opens
        ↓
Directions open successfully
```

Additionally: Client website → iframe embed → same published tourist map works correctly.

---

## 65. Stage 2 — Android

Stage 2 does not create another tourism platform. It creates another renderer/client for the existing platform.

```
PublishedMapConfig
       │
       ├── Web Renderer
       │
       └── Android Renderer
```

Android reproduces the established Web UI/UX.

---

## 66. Android Requirements

Kotlin, Jetpack Compose. Fullscreen Map, Photo Markers, Bottom Menu, Categories, Languages, Search, Left Detail Panel, Voice Guide, QR, Branding.

Additional Android-specific functionality: Kiosk Mode, Local Cache, Offline Startup, Auto Start, Idle Reset, Network Recovery, Device Registration, Heartbeat.

---

## 67. Web / Android Parity Rule

Given the same customerId, mapId, publishedVersion — Web and Android should display logically equivalent: Places, Categories, Menu, Languages, Descriptions, Branding, Voice content, QR destinations, Events, Features.

Platform data must not be duplicated separately for Web and Android.

---

## 68. Stage 3 — Super Admin

Once Client + Web + Android are stable, implement the platform management system.

```
SUPER ADMIN

Dashboard

Customers
Users
Maps
Devices

Store
 ├─ Widgets
 ├─ Themes
 ├─ Map Styles
 ├─ Components
 └─ Features

Platform
 ├─ API Providers
 ├─ Feature Flags
 ├─ Releases
 ├─ Logs
 └─ Monitoring

Analytics

Plans / Billing
```

---

## 69. Widget Store

Super Admin creates/publishes features.

```
Weather Widget
       ↓
Internal Test
       ↓
Publish to Store
       ↓
Client sees widget
       ↓
Install
       ↓
Configure
       ↓
Place on map
       ↓
Publish
       ↓
Web + Android display it
```

---

## 70. Initial Widget Types

Future: Weather, Temperature, Currency, Clock, Emergency Information, Train Information, Event Banner, News, Advertisement, Live Camera.

---

## 71. Widget Instance Architecture

Store definition: `Weather Widget v1.0`.

Client installation:

```
widgetInstance
│
├── widgetDefinitionId
├── mapId
├── configuration
├── position
├── size
└── enabled
```

Do not copy widget source/configuration definitions into each client.

---

## 72. Widget Layout

Store normalized positions rather than raw pixels.

Example: `x = 0.78`, `y = 0.08`, `width = 0.18`, `height = 0.12`.

This makes layouts more portable between screen sizes.

---

## 73. Analytics Foundation

Future events: MAP_OPENED, PLACE_OPENED, CATEGORY_SELECTED, SEARCH_USED, LANGUAGE_CHANGED, VOICE_PLAYED, QR_OPENED, QR_SCANNED, DIRECTIONS_OPENED.

Useful reports: Most viewed locations, Most scanned destinations, Most used languages, Most used categories, Voice-guide usage, Popular time periods.

This can become valuable to municipalities and tourism organizations.

---

## 74. Privacy Principle

Tourists should remain anonymous by default. Do not require Name, Email, Account, Login for ordinary map usage.

Only collect the minimum analytics required. Do not permanently store precise smartphone location merely because the tourist requested navigation.

---

## 75. Reliability Principles

The following should be architectural rules:

1. Draft data is never public.
2. Public applications consume published snapshots.
3. A bad new publish must be recoverable by rollback.
4. One external feature failing must not break the map.
5. Tenant isolation is enforced server-side.
6. Web and Android share one published content model.
7. Map-provider-specific code stays behind an abstraction.
8. Client customization uses controlled configuration, not arbitrary executable code.

---

## 76. Product Scalability

The architecture should work for 1 Client, 10 Clients, 100 Clients, 1,000+ Maps — without creating `client-a-project`, `client-b-project`, `client-c-project`.

Instead: One Platform → Customer A (Configuration A), Customer B (Configuration B), Customer C (Configuration C).

---

## 77. Example Real Deployment

```
Customer:
JR Example

Map:
Kyoto Station Tourist Guide

Languages:
English
Japanese
Chinese
Korean

Categories:
Sightseeing
Gourmet
Shopping
Hotels
Transport

Places:
Kyoto Tower
Yodobashi Kyoto
Kyoto Station
Hotels
Restaurants
Shopping
Bus Stops
Tourist Attractions
```

Client publishes. The system automatically provides:

1. Standalone Web Map
2. Website Embed Code
3. Place QR Navigation
4. Mobile Destination Pages
5. Stage 2 Android Map

---

## 78. Commercial Product Model

The platform can eventually be offered in packages, conceptually:

Web Tourist Map + Website Embed + Voice Guide + QR Navigation + Android Signage + Premium Widgets + Analytics.

This allows different clients to purchase different levels without maintaining separate software.

---

## 79. What We Should NOT Build First

Do not let these delay the core platform: Full Super Admin, Billing, Advanced AI, Advanced analytics, Complex Widget Store, Advertising platform, Train integrations, Weather integrations, WebRTC camera infrastructure, Advanced MDM, Dozens of map providers.

First prove: Client → Create → Publish → Web Map → Embed → Tourist → Voice / QR / Navigation.

---

## 80. Recommended First Commercial MVP

The first strong MVP should demonstrate:

```
CLIENT ADMIN
       ↓
Create Kyoto Tourist Map
       ↓
Add 10–20 real locations
       ↓
English / Japanese / Chinese
       ↓
Photo Markers
       ↓
Publish
       ↓
WEB TOURIST MAP
       ↓
Embed into sample client website
       ↓
Select Yodobashi
       ↓
Left Detail Panel
       ↓
Voice Guide
       ↓
QR
       ↓
Smartphone
       ↓
Google Maps Directions
```

If that workflow is fast, stable and visually polished, Stage 1 has demonstrated the product's core commercial value.

---

## 81. Final Platform Blueprint

```
                         OUR COMPANY
                              │
                              │ Stage 3
                              ▼
                    ┌───────────────────┐
                    │    SUPER ADMIN    │
                    │ Store / Platform  │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ TOURIST MAP CLOUD │
                    └─────────┬─────────┘
                              │
                  ┌───────────┴───────────┐
                  │                       │
                  ▼                       ▼
          ┌───────────────┐        Firebase / Backend
          │ CLIENT ADMIN  │               │
          └───────┬───────┘               │
                  │                       │
            Edit / Configure              │
                  │                       │
                  ▼                       │
                DRAFT                     │
                  │                       │
                Preview                   │
                  │                       │
                Publish                   │
                  │                       │
                  └───────────┬───────────┘
                              ▼
                    PUBLISHED MAP CONFIG
                              │
              ┌───────────────┼────────────────┐
              │               │                │
              ▼               ▼                ▼
        STANDALONE WEB    WEBSITE EMBED     ANDROID
              │               │              Stage 2
              │               │
              └───────┬───────┘
                      ▼
                    TOURIST
                      │
              Select Destination
                      │
             ┌────────┴────────┐
             ▼                 ▼
       🔊 Voice Guide        QR Code
                               │
                               ▼
                         Smartphone
                               │
                               ▼
                       Mobile Destination
                               │
                               ▼
                         Navigation
```

---

## 82. Final Product Principle

The platform should be built around one sentence:

**Create once, publish once, experience everywhere.**

A client creates and maintains one tourism map. The same published content can power: Standalone Web Map, Client Website Embed, Tourist Smartphone Experience, Android Signage, Future Widgets, Future Integrations — without creating independent versions of the client's tourism data.

That is the architectural foundation of the Tourist Map Platform.
