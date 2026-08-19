# Phase 1A Technical Plan — Foundation

**Status:** Approved for implementation, with three amendments (see [Amendments](#amendments-approved) below). Implementation proceeds checkpoint by checkpoint per §23; this document is updated in place as amendments are approved rather than superseded by a separate changelog file.
**Location:** `docs/stages/STAGE_1A_TECHNICAL_PLAN.md`
**Authoritative parents:** [`docs/architecture/SYSTEM_BLUEPRINT.md`](../architecture/SYSTEM_BLUEPRINT.md), [`docs/stages/STAGE_1_BLUEPRINT.md`](STAGE_1_BLUEPRINT.md), and the current project instructions. Where this document appears to conflict with either, those documents win and this plan should be corrected. The historical `.odt`/`.pdf` files in the project root are reference-only and were **not** used as a source for any decision below.

This plan covers **Phase 1A only**: Foundation (workspace/toolchain, Firebase environments, authentication, tenant provisioning, security rules, protected routes, and a proof-of-provisioning dashboard). It intentionally does **not** cover Map Settings, Places, Languages, Branding, the Tourist Web UI, Voice Guide, QR, Embedding, Publishing, Android, or Super Admin — those are later phases/stages per `STAGE_1_BLUEPRINT.md` and `SYSTEM_BLUEPRINT.md` §3.

---

## Amendments (Approved)

Three amendments were made when this plan was approved. They are recorded here and reflected inline at the relevant sections below (§3, §6/§24, §10/§20/§23).

1. **TypeScript** — confirmed: TypeScript 6.x for Phase 1A. TypeScript 7 is explicitly not introduced during Phase 1A; it may be evaluated later once it is stable and ecosystem compatibility is demonstrated. (This matches what this plan already recommended in §3 — the amendment makes it a firm constraint rather than a recommendation.)
2. **Reconciliation** — the hourly scheduled reconciliation Cloud Function described in §10 is **deferred**, not implemented, in the initial Phase 1A build. `registerClient`'s idempotency, deterministic provisioning states, compensation-on-thrown-error, and detectable partial-provisioning states are implemented as planned; the scheduled job is not. The design is kept in this document (not deleted) and should only be built if testing or real operational experience shows it's actually needed.
3. **Session lifetime** — the 14-day session-cookie lifetime proposed in §6 is used as the initial value, but it is explicitly **not** a LOCK NOW decision (§24 already reflected this) and must be read from centralized server configuration/environment (`SESSION_COOKIE_MAX_AGE_SECONDS`, see `apps/admin-web/.env.example`), never hardcoded at each call site. The session-cookie *architecture* itself (§6) remains LOCK NOW — only the numeric lifetime is adjustable.

---

## 0. Repository State Discovered (pre-planning inspection)

The connected project folder (`TouristMap-System`) was inspected before writing this plan. Current contents:

```
TouristMap-System/
├── docs/
│   ├── architecture/SYSTEM_BLUEPRINT.md
│   └── stages/STAGE_1_BLUEPRINT.md
├── Tourist Map System — Final System Blueprint v1.0.md
├── Tourist Map System — Stage 1 Blueprint.odt   (historical, reference-only)
├── Tourist Map System — Stage 1 Blueprint.pdf   (historical, reference-only)
├── Tourist Map System.pdf                       (historical, reference-only)
└── Untitled 1.odt                                (historical, reference-only)
```

**There is no monorepo yet.** No `apps/`, `packages/`, or `firebase/` directories exist. No `package.json`, `pnpm-workspace.yaml`, `.git` repository, `tsconfig.json`, `.env*`, lockfile, or any source code was found anywhere in the folder. This is a documentation-only workspace at this point.

Consequence for this plan: everything described below is a **greenfield proposal**. Nothing here assumes pre-existing code, and nothing here should be read as "already built." Phase 1A implementation (a later, separate step) will genuinely start from an empty repository.

---

## 1. Phase 1A Objective

### In scope

The exact required end-to-end workflow, as specified:

```
Client opens registration
  → creates account
  → Firebase Authentication user created
  → customerId created
  → customer record created
  → CLIENT_ADMIN membership/user record created
  → first mapId created
  → initial map created
  → default configuration created
  → client session established
  → dashboard opens
```

Plus: login, logout, session persistence across reloads, and protected admin route access (with correct redirect behavior for unauthenticated, disabled, and incompletely-provisioned users).

Phase 1A delivers the **foundation only**:

- Monorepo workspace and toolchain
- Firebase project/environment strategy (dev/staging/prod) and local emulator workflow
- Authentication (email + password) with a real server-verifiable session
- Multi-tenant identity model (`customerId`, `mapId`, `uid`) and ID generation strategy
- Minimal Firestore data model: `customers/{customerId}`, `users/{uid}`, `maps/{mapId}` only
- Tenant provisioning as a single trusted backend operation, with idempotency and failure recovery
- Firestore security rules enforcing tenant isolation and role integrity
- Storage rules baseline (deny-by-default; no uploads implemented yet)
- A minimal `admin-web` route set: `/register`, `/login`, `/admin`, `/admin/account`
- A proof-of-provisioning dashboard (not the real CMS dashboard from `STAGE_1_BLUEPRINT.md` §1)
- A minimal `tourist-web` scaffold — foundation only, no map UI

### Explicitly out of scope for Phase 1A

- Map Settings, Map Area configuration UI, Categories, Places (custom or imported), Events, Live Cameras, Menu configuration, Branding/Theme editing (Phase 1B/1C+)
- Multilingual **content** and the translation editor (Phase 1D) — Phase 1A only stores `defaultLanguage`/`enabledLanguages` as scalar/array fields with safe defaults
- The real Tourist Web Map UI: photo markers, side panel, search, voice guide, QR (Phase 1E–1H)
- Website embedding (Phase 1I)
- Draft/Preview/Publish engine and `PublishedMapConfig` generation/versioning/rollback (Phase 1J) — `maps/{mapId}.status` exists as a field in 1A but nothing in 1A ever transitions it away from `DRAFT`
- Any Android code or Android-specific tooling (Stage 2 — not to be started)
- Any Super Admin functionality (Stage 3 — not to be started)
- CI pipeline configuration (scripts are structured to be CI-ready per §22, but no CI YAML is created)
- Actual `pnpm install`, actual Firebase project creation, or any real credentials — this document is a plan only

---

## 2. Monorepo Structure

### Proposed initial tree

```
tourist-map-system/
├── apps/
│   ├── admin-web/                # Full Phase 1A functionality lives here
│   │   ├── app/
│   │   ├── proxy.ts                # renamed from `middleware.ts` in Next.js 16 — see note below
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── tourist-web/               # Foundation-only scaffold, no map UI yet
│       ├── app/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared-types/               # Created in 1A
│   └── validation/                 # Created in 1A
├── firebase/
│   ├── functions/                  # provisionTenant + session-support code
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   ├── storage.rules
│   └── firebase.json
├── docs/                            # existing, unchanged structurally
├── .nvmrc
├── .editorconfig
├── .gitignore
├── .env.example
├── eslint.config.js
├── .prettierrc
├── package.json                     # workspace root, private
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

`packages/map-schema/`, `packages/localization/`, and `packages/ui-tokens/` from the blueprint's target structure are **not** created in Phase 1A. See below for why, per-package.

### Why `tourist-web` exists in Phase 1A even though it does almost nothing yet

`STAGE_1_BLUEPRINT.md` explicitly allows `tourist-web` to contain only "the foundation required for later phases" in Phase 1A. It's included now (rather than deferred entirely to Phase 1E) so that: the pnpm workspace, shared TS config, and shared lint/test tooling are validated against **two** apps from day one instead of one, and so the build/lint/typecheck/test scripts described in §22 are meaningful across the whole workspace immediately rather than needing a workspace-config change later when Phase 1E starts. Its Phase 1A content is intentionally minimal: a working Next.js app shell (`app/layout.tsx`, a placeholder `app/page.tsx`), no map dependencies, no Firebase client wiring beyond what's needed to prove the build passes.

### Package-by-package rationale

**`packages/shared-types`** — created now.
- **Owns:** plain TypeScript types/enums with zero runtime code and zero dependencies — `Customer`, `User`, `Map` (the Phase 1A subset only), and the enums in §8 (`ClientType`, `CustomerStatus`, `ProvisioningStatus`, `Role`, `UserStatus`, `MapStatus`, `Language`, `MapProviderName`, `MapStyle`, `MapAreaType`). Also owns the branded ID types (`CustomerId`, `MapId`, `Uid` as string aliases) so IDs aren't accidentally interchanged with arbitrary strings in application code.
- **Must not own:** UI components, runtime validation logic, business/provisioning logic, or any Phase 1B+ domain concept (`Place`, `Category`, `Translation`, `Event`, `LiveCamera`, `Theme`, `PublishedMapConfig`) — those don't exist yet and adding placeholder shapes for them now would be speculative and likely wrong once Phase 1B actually designs them.
- **Why now:** `admin-web`, `firebase/functions`, and (eventually) `tourist-web` all need to agree on the exact shape of `Customer`/`User`/`Map` and the enums. Without this package, those shapes would be defined twice (once in the Next.js app, once in Cloud Functions) and drift silently — exactly the duplication the project instructions ask to avoid.

**`packages/validation`** — created now.
- **Owns:** Zod schemas for anything that crosses a trust boundary in Phase 1A: the registration input shape, the login input shape, and schemas mirroring the Firestore document shapes (`customers/*`, `users/*`, `maps/*`) used by the provisioning Cloud Function to validate before writing.
- **Must not own:** UI form components, business workflow/orchestration logic (that belongs in `firebase/functions`), or anything about *how* a value is persisted — only *what shape* is valid.
- **Why a separate package from `shared-types` rather than merged in:** `shared-types` must stay dependency-free (importable anywhere, including into Edge-runtime code, with no bundle-size or dependency-version concerns). `validation` intentionally depends on `zod` and on `shared-types`. Keeping the dependency-free layer separate from the runtime-validation layer is a small, well-justified split — not fragmentation for its own sake.

**`packages/map-schema`** — **not created in Phase 1A.** Per `SYSTEM_BLUEPRINT.md` §10, this package's job is `PublishedMapConfig`, `MapDefinition`, `Place`, `Category`, `Translation`, `MenuItem`, `Theme`, `Event`, `LiveCamera` — none of which exist as real features until Phase 1B (Places/Categories) and Phase 1J (Publish Engine / `PublishedMapConfig`). Creating this package now would mean populating it with speculative types nobody uses yet. Defer until Phase 1B needs its first real type from this list.

**`packages/localization`** — **not created in Phase 1A.** Phase 1A's `defaultLanguage`/`enabledLanguages` are simple enum-constrained fields on the `Map` document, not a translation system. The real localization concern (per-field `translations` maps, fallback resolution logic, the translation editor) starts in Phase 1D. Defer.

**`packages/ui-tokens`** — **not created in Phase 1A.** No branding/theme work exists yet (`SYSTEM_BLUEPRINT.md` §11 Branding is Phase 1B+). The Phase 1A admin UI (registration form, login form, a small proof-of-provisioning dashboard) can use ordinary Tailwind/CSS without a shared design-token package. Defer until Design/Branding work needs a shared visual language across `admin-web`, `tourist-web`, and the future embed surface.

This keeps Phase 1A at exactly two shared packages, each with a concrete, immediate consumer, rather than pre-creating the blueprint's full package list.

---

## 3. Toolchain

Recommendations below were checked against current stable releases (August 2026) rather than assumed from training data, since "current stable version" is a fact that changes over time.

| Tool | Recommendation | Notes |
|---|---|---|
| Node.js | **24.x (Maintenance LTS)**, e.g. 24.19.0, pinned via `.nvmrc` (`24`) and root `package.json` `engines.node` | Node 24 is the current LTS as of Aug 2026 (security support into April 2028). Node 26 became "Current" in May 2026 and is scheduled to become the next Active LTS around October 2026 — **CAN EVOLVE LATER**: revisit once Node 26 is Active LTS rather than adopting it while still new. Do not use Node 22 for a new project (its active-support phase already ended). |
| pnpm | **11.x**, pinned via Corepack (`"packageManager": "pnpm@11.22.0"` in root `package.json`, exact patch to be confirmed at implementation time) | pnpm 11 is current stable as of Aug 2026. |
| TypeScript | **6.0.3** (confirmed exact latest 6.x patch, pinned workspace-wide), `strict: true` | Amendment 1 (approved): TypeScript 7 (Go-native compiler) is explicitly not used during Phase 1A, regardless of ecosystem maturity — 6.x only. Re-evaluate 7.x in a later phase, not opportunistically. Toolchain major-version choice is **CAN EVOLVE LATER** in general (§24), but the "not yet" half of this specific decision is now firm per the amendment, not merely a recommendation. |
| Next.js | **16.x**, App Router only (no Pages Router) | Next.js 16 is the current LTS major as of Aug 2026 (latest observed 16.3.1). |
| React | **19.2.x** (Next.js 16's App Router runs on React 19.2 per Next's own upgrade docs) | Exact patch to be confirmed at install time. |
| ESLint | **9.x, flat config** (`eslint.config.js`) with `eslint-config-next`, `@typescript-eslint`, and `eslint-plugin-import` (or equivalent) for workspace import hygiene | Flat config is standard for ESLint 9 and pairs cleanly with a pnpm workspace. |
| Formatting | **Prettier**, applied via `eslint-config-prettier` to disable conflicting stylistic ESLint rules (not `eslint-plugin-prettier`, to keep lint and format as separate, fast, independently-runnable steps) | Root `.prettierrc`; `pnpm format` / `pnpm format:check` scripts. |
| Build orchestration | **Plain pnpm workspace recursive scripts** (`pnpm -r run <script>`), *not* Turborepo/Nx, for Phase 1A | With two apps and two packages, a task runner adds tooling surface without a proven need yet. **CAN EVOLVE LATER** if/when build times or task-graph complexity justify it (tracked as a risk in §24, not a blocker). |
| Test framework | **Vitest** for unit tests (fast, ESM-native, shares `tsconfig` cleanly across the workspace); **Playwright** for auth/integration flows against the Firebase Emulator Suite; **`@firebase/rules-unit-testing`** for Firestore security rules tests | See §20 for the full breakdown. |

Workspace scripts (root `package.json`, illustrative — not yet created):

```jsonc
{
  "scripts": {
    "lint": "pnpm -r run lint",
    "typecheck": "pnpm -r run typecheck",
    "test": "pnpm -r run test",
    "test:rules": "firebase emulators:exec --only firestore,auth \"pnpm --filter firebase-functions run test:rules\"",
    "test:e2e": "firebase emulators:exec --only auth,firestore,functions \"pnpm --filter admin-web run test:e2e\"",
    "build": "pnpm -r run build",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

No dependencies are installed as part of this plan — the table above is a recommendation to be executed in a later implementation step.

---

## 4. Next.js Architecture

### `admin-web` route structure (App Router)

```
app/
├── (public)/
│   ├── register/page.tsx
│   └── login/page.tsx
├── (protected)/
│   ├── layout.tsx            # server component: verifies session cookie, loads claims, redirects if invalid
│   ├── admin/
│   │   ├── page.tsx          # dashboard (§17)
│   │   └── account/page.tsx  # read-only account/tenant info (§16, §17)
├── api/
│   └── auth/
│       └── session/route.ts  # POST creates session cookie, DELETE clears it (§6)
├── layout.tsx                  # root layout
├── error.tsx                   # root error boundary
└── global-error.tsx
```

- **Server/client boundary:** the `(protected)` layout, the session verification logic, and the initial data fetch for the dashboard (`customers/{customerId}`, `maps/{mapId}` reads via Admin SDK) are Server Components — they run with the verified session and never trust client-submitted identity. The registration and login **forms** are Client Components (they call the Firebase client SDK directly for `createUserWithEmailAndPassword`/`signInWithEmailAndPassword`, then call `/api/auth/session` and the `registerClient` Callable Function). This mirrors the recommended Next.js + Firebase pattern: client SDK for interactive auth actions, server-verified session for everything that gates access to data.
- **Authentication boundary:** implemented in two layers (detailed in §6) — a fast `proxy.ts` pre-check (cookie presence only, Edge-safe) and an authoritative verification in the `(protected)/layout.tsx` Server Component (Node runtime, Admin SDK, full `verifySessionCookie`). Only the second layer is treated as real authorization; the first is a UX/perf optimization to avoid rendering protected shells before a redirect. **Correction discovered during 1A.1 toolchain research:** Next.js 16 renamed the `middleware.ts` convention (and its `middleware()` export) to `proxy.ts` (`proxy()`); the `edge` runtime is not supported under the new name (`proxy` always runs on the `nodejs` runtime). This plan originally referenced `middleware.ts` — updated here to `proxy.ts` for accuracy. Since `proxy` is Node-only, the "Edge-safe fast pre-check" framing changes slightly by the time 1A.7 is implemented: both layers will run on the Node runtime, so the two-layer split becomes primarily about separation of concerns (cheap cookie-presence check vs. full cryptographic verification) rather than an Edge-vs-Node split — worth re-confirming against Next's `proxy` docs at 1A.7 time in case guidance shifts further.
- **Error boundaries:** a root `error.tsx` for unhandled rendering errors, and a scoped error boundary under `(protected)/admin/` so a dashboard data-fetch failure doesn't take down the whole app shell. Errors surfaced to users follow the structured error model in §18 (safe, plain-language messages only).
- **Loading states:** `loading.tsx` under `(protected)/admin/` for the dashboard's initial Firestore reads, and an explicit "Setting up your account…" state (not a generic spinner) specifically for the `provisioning.status === PENDING` case described in §10/§16, since that's a distinct, expected condition rather than a generic loading flicker.

### `tourist-web` initial role

Phase 1A `tourist-web` is a bare Next.js app: root layout, a single placeholder home page, workspace-shared `tsconfig`/ESLint config wired up, and a trivial health-check route (`app/api/health/route.ts`) so the build/deploy pipeline has something real to exercise. No Firebase client wiring, no map provider, no Places/Categories UI. Its real build-out starts at Phase 1E.

---

## 5. Firebase Environment Strategy

### Project strategy

Three separate Firebase projects, one per environment — **not** three environments inside one project (that would make tenant isolation testing unsafe and blur billing/quota boundaries):

- `touristmap-dev` (or org-appropriate naming, to be finalized by the user before creation — not decided in this plan)
- `touristmap-staging`
- `touristmap-prod`

Each has its own Authentication users, Firestore database, and Storage bucket. No production credentials, project IDs, or API keys are created or referenced by this plan — project creation is a later, explicit step.

### Local emulator strategy

Day-to-day development and all automated tests run against the **Firebase Emulator Suite** (Auth + Firestore + Functions + Storage), configured in `firebase.json`, pointed at the `touristmap-dev` project's configuration shape (so emulator behavior matches real project structure) but touching no real cloud resources. `firebase emulators:start` for interactive development; `firebase emulators:exec "<command>"` for CI-style one-shot test runs (§22). Emulator use is not optional for security-rules testing — rules tests must run against the emulator, never against production or with relaxed rules (§12).

### Environment variables

**Browser (public, `NEXT_PUBLIC_`-prefixed):**

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false
```

Note: standard Firebase Web SDK config values are not secrets — they're safe to ship in a browser bundle by design, because access control is enforced by Firestore/Storage security rules, not by hiding these values. They're still kept in environment files (not hardcoded) purely for per-environment flexibility (dev/staging/prod point at different projects).

**Server / Admin SDK (private — never `NEXT_PUBLIC_`, never sent to the browser):**

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

These three are only needed where Application Default Credentials aren't automatically available (i.e., local development and any non-GCP deploy target). In deployed environments (Cloud Functions, and Cloud Run if introduced later), prefer **Application Default Credentials** over a downloaded service-account key file — no key material to manage or leak. For local server-side testing, prefer `gcloud auth application-default login` over a checked-out JSON key wherever practical; if a key file is genuinely needed locally, it is referenced by path from an env var and is never committed (see `.gitignore` below).

### `.env.example`

A single template file (or one per app, both patterns are acceptable — recommend one per app: `apps/admin-web/.env.example`, `apps/tourist-web/.env.example`) listing every variable name above with obviously-placeholder values (e.g. `NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key-here`). **No real value of any kind is ever placed in this plan document, in `.env.example`, or in any committed file.**

### Files Git must ignore

```
.env
.env.local
.env.*.local
*.firebase-adminsdk*.json
firebase-debug.log
firestore-debug.log
ui-debug.log
.firebase/
node_modules/
.next/
dist/
coverage/
```

---

## 6. Authentication Architecture

**Provider:** Firebase Authentication, Email + Password, for Phase 1A (per `SYSTEM_BLUEPRINT.md` §8; other providers are future work).

**Why not rely solely on client-side Firebase auth state:** `onAuthStateChanged` only tells the *browser* whether a user is signed in. It cannot be checked by Next.js Server Components, Route Handlers, or Middleware, and a client-only guard can be bypassed by anyone who can run JavaScript in their own browser (e.g., by simply not calling the redirect logic). Server-rendered protected content and any server-side authorization decision (Firestore reads via Admin SDK, custom-claim checks) need a credential the *server* can independently verify. This is why Phase 1A uses the documented Firebase **session cookie** pattern instead of trusting client state.

### Flow

1. **Register/Login (client):** the client Firebase SDK performs `createUserWithEmailAndPassword` (via the `registerClient` Callable Function path described in §10 — see note below) or `signInWithEmailAndPassword`, and obtains a Firebase **ID token**.
2. **Session establishment:** the client POSTs the ID token to `POST /api/auth/session` (a Next.js Route Handler). The server verifies the ID token with the Admin SDK, then calls `createSessionCookie` to mint a session cookie, and sets it as an **httpOnly, Secure, SameSite=Lax** cookie. From this point, the browser's own Firebase Auth client state is not the thing being trusted — the cookie, verifiable only server-side, is.
3. **Protected route check (fast path):** `proxy.ts` (Next.js 16's renamed `middleware.ts` — see the correction note in §4) checks only whether the session cookie is *present* — this is a cheap pre-filter, not a security decision by itself. (Next.js 16's `proxy` convention always runs on the `nodejs` runtime rather than `edge`, so the practical distinction from the layout-level check below is separation of concerns, not a runtime boundary — re-confirm against current Next.js docs at 1A.7.)
4. **Protected route check (authoritative path):** the `(protected)/layout.tsx` Server Component (Node runtime) calls `getAuth().verifySessionCookie(cookie, checkRevoked: true)`. This is the actual authorization gate. If verification fails for any reason (expired, revoked, malformed, or the user is disabled), the layout redirects server-side to `/login` — it never renders protected content first.
5. **Logout:** client calls Firebase `signOut()` and `DELETE /api/auth/session`, which clears the cookie server-side (and can optionally revoke refresh tokens via `revokeRefreshTokens(uid)` for a harder logout — recommended for Phase 1A given this is an admin surface).
6. **Expired session:** `verifySessionCookie` throws → redirect to `/login?reason=session_expired`, shown as a plain-language message, not a raw error.
7. **Disabled user:** two independent signals are checked, because "disabled" can originate from two places in this architecture — Firebase Auth's own `disabled` flag (Firebase automatically invalidates tokens for disabled users, so `verifySessionCookie` with `checkRevoked: true` will fail on the next check) and our own `users/{uid}.status` field (Firestore-level, in case tenant/user suspension is ever driven from application data rather than the Auth record directly — relevant once Stage 3 exists). Either signal being "not active" results in forced logout + redirect to `/login?reason=account_disabled`.

**Custom claims:** during provisioning (§10), the backend sets `customerId` and `role` as **custom claims** on the Firebase Auth user via `setCustomUserClaims`. Every server-side authorization check reads `customerId`/`role` from the *verified token's claims*, never from anything the client submits in a request body — this is what makes tenant/role checks trustworthy. (Custom claims propagate to a fresh ID token on the next sign-in or forced token refresh; the session-cookie flow above re-verifies on every protected request, so stale claims aren't a practical concern for Phase 1A's scope.)

**Why a Callable Function performs registration rather than the client calling `createUserWithEmailAndPassword` directly:** see §10 — the same operation that creates the Auth user also needs to atomically provision the tenant, so Auth-user creation is folded into the trusted backend call rather than split across a client call + a separate backend call.

---

## 7. Multi-Tenant Identity Model

| ID | Source | Format | Notes |
|---|---|---|---|
| `uid` | Firebase Authentication (assigned by Firebase) | Firebase's own opaque UID | Already globally unique and non-guessable by construction — used as-is, no wrapping. |
| `customerId` | Generated server-side during provisioning | `cust_` + a cryptographically random, URL-safe token (~20 chars) | See rationale below. |
| `mapId` | Generated server-side during provisioning | `map_` + a cryptographically random, URL-safe token (~20 chars) | Same generator/strategy as `customerId`. |

### ID generation strategy — and why

Three options were considered:

- **Firestore auto-IDs** (`doc().id`) — unique, but not self-describing. A bare 20-char auto-ID gives no hint what kind of resource it references, which hurts log/URL/debugging readability once IDs start appearing in QR URLs (Phase 1H+) and support conversations.
- **Slug from company name** (e.g. `jr-west`) — rejected outright: guessable, potentially PII-adjacent, and unstable if a company renames — violates the "must never use a company name or username as the primary identifier" rule directly.
- **Prefixed random token** (chosen) — a `cust_`/`map_` prefix followed by a cryptographically random, suffiently long random suffix (generated server-side only, e.g. via Node's `crypto.randomUUID()`/an equivalent random-token generator, **never** derived from any user-supplied value): globally unique (negligible collision probability at any realistic scale), non-guessable (random, not sequential/incremental — so one customer can't enumerate or infer another's ID), stable for the resource's lifetime (assigned once at creation by trusted backend code, never regenerated or reassigned), and self-describing in logs/URLs (`cust_`/`map_` prefix makes the ID's type obvious at a glance, the same pattern used by Stripe, GitHub, and similar platforms).

IDs are generated **only** inside the trusted `registerClient` Callable Function (§10, §15) — never accepted from client input.

### Relationships

```
uid (Firebase Auth)
  ↓ 1:1
users/{uid}  { customerId, role, ... }
  ↓ N:1
customers/{customerId}
  ↓ 1:N
maps/{mapId}  { customerId, ... }
```

`uid` → `users/{uid}` is the join between an authenticated identity and a tenant. `customers/{customerId}` is the tenant root. `maps/{mapId}.customerId` is how map ownership is checked. In Phase 1A, one customer has exactly one map (created at registration); the *data model* already supports a customer owning multiple maps later (per `SYSTEM_BLUEPRINT.md` §5) simply by creating additional `maps/{mapId}` documents with the same `customerId` — no schema change needed for that specific growth path.

---

## 8. Phase 1A Firestore Data Model

Only three collections are defined. No other Stage 1 collection (`places`, `categories`, `menu`, `languages` subcollection, `events`, `liveCameras`, `widgetInstances`, `publishedMaps`, `devices`) is created in Phase 1A — they appear in `SYSTEM_BLUEPRINT.md` §12 as the eventual target, not as Phase 1A deliverables.

### Enums

```
ClientType        = RAILWAY | HOTEL | MUNICIPALITY | TOURISM_ORGANIZATION | SHOPPING_FACILITY | OTHER
CustomerStatus     = ACTIVE | SUSPENDED
ProvisioningStatus = PENDING | COMPLETE | FAILED
Role               = SUPER_ADMIN | CLIENT_ADMIN | CLIENT_EDITOR
UserStatus         = ACTIVE | DISABLED
MapStatus          = DRAFT | PUBLISHED
Language           = EN | JA | ZH_CN | KO
MapProviderName    = GOOGLE_MAPS | MAPBOX
MapStyle           = ROAD | SATELLITE | HYBRID | TERRAIN | CUSTOM
MapAreaType        = BOUNDED | UNBOUNDED
```

### `customers/{customerId}`

| Field | Type | Required | Written by | Read by | Mutability |
|---|---|---|---|---|---|
| `customerId` | string | yes | provisioning backend | any authenticated member of this customer | immutable |
| `companyName` | string | yes | provisioning backend (from registration form) | same | mutable (editing UI is later than 1A) |
| `clientType` | `ClientType` | yes | provisioning backend (from registration form) | same | immutable in 1A |
| `status` | `CustomerStatus` | yes | trusted backend only (always `ACTIVE` in 1A; Stage 3 will be the only future writer of `SUSPENDED`) | same | mutable, backend-only |
| `primaryContactName` | string | yes | provisioning backend (registration form) | same | mutable later |
| `primaryContactEmail` | string | yes | provisioning backend (mirrors Auth user's email at creation) | same | mutable later (not synced automatically on Auth email change in 1A) |
| `provisioning` | map: `{ status: ProvisioningStatus, startedAt, completedAt?, lastError? }` | yes | provisioning backend only | same (used by client to gate dashboard access, §10/§16) | mutable, backend-only |
| `createdAt` | server timestamp | yes | provisioning backend | same | immutable |
| `updatedAt` | server timestamp | yes | trusted backend on any change | same | mutable, backend-only |

### `users/{uid}`

| Field | Type | Required | Written by | Read by | Mutability |
|---|---|---|---|---|---|
| `uid` | string | yes | provisioning backend | self; same-customer members (for a future member list) | immutable |
| `customerId` | string | yes | provisioning backend | self; same-customer members | immutable in 1A (see §9 for future-evolution note) |
| `role` | `Role` | yes | trusted backend only — never client-writable, even for one's own doc | self; same-customer members | mutable, backend-only; only `CLIENT_ADMIN` is ever assigned in 1A |
| `email` | string | yes | provisioning backend (denormalized from Auth) | self; same-customer members | mutable later, backend-only |
| `displayName` | string | yes | provisioning backend (registration "Contact Name") | self; same-customer members | client-mutable for this one field only (see rules, §12) |
| `status` | `UserStatus` | yes | trusted backend only | self; same-customer members | mutable, backend-only; always `ACTIVE` in 1A |
| `createdAt` | server timestamp | yes | provisioning backend | same | immutable |
| `updatedAt` | server timestamp | yes | trusted backend on any change | same | mutable, backend-only |

### `maps/{mapId}`

| Field | Type | Required | Written by | Read by | Mutability |
|---|---|---|---|---|---|
| `mapId` | string | yes | provisioning backend | same-customer members | immutable |
| `customerId` | string | yes | provisioning backend | same-customer members | immutable (ownership field) |
| `name` | string | yes | provisioning backend, defaulted from `companyName` (e.g. `"{companyName} Tourist Map"`) | same-customer members | mutable later (Phase 1B), read-only via UI in 1A |
| `status` | `MapStatus` | yes | provisioning backend, always `DRAFT` at creation | same-customer members | mutable later (Phase 1J Publish Engine); never transitions in 1A |
| `defaultLanguage` | `Language` | yes | provisioning backend, default `EN` | same-customer members | mutable later (Phase 1D) |
| `enabledLanguages` | array<`Language`> | yes | provisioning backend, default `["EN"]` | same-customer members | mutable later (Phase 1D); invariant: must always include `defaultLanguage`, enforced in `packages/validation` |
| `mapProvider` | map: `{ provider: MapProviderName, style: MapStyle }` | yes | provisioning backend, default `{ GOOGLE_MAPS, ROAD }` | same-customer members | placeholder only in 1A — not rendered anywhere yet; mutable later (Phase 1B) |
| `area` | map: `{ type: MapAreaType, center?, defaultZoom?, bounds? }` | yes | provisioning backend, default `{ type: UNBOUNDED }` | same-customer members | placeholder only in 1A; mutable later (Phase 1B) |
| `createdAt` | server timestamp | yes | provisioning backend | same | immutable |
| `updatedAt` | server timestamp | yes | trusted backend on any change | same | mutable, backend-only |

---

## 9. Client Membership / Role Model

**Decision: a simple `users/{uid}.customerId + role` model, not a membership subcollection, for Phase 1A.**

Two options were weighed:

- **(a) Simple model** — `users/{uid}` carries exactly one `customerId` and one `role`. One user belongs to exactly one customer.
- **(b) Membership model** — a `memberships/{membershipId}` (or `customers/{customerId}/members/{uid}`) collection, allowing one `uid` to be associated with multiple customers and/or multiple roles.

**Chosen: (a).** Every currently-documented registration and role flow (`SYSTEM_BLUEPRINT.md` §10–11) is "one registrant creates exactly one new customer and becomes its `CLIENT_ADMIN`." There is no current product requirement for a single person to belong to multiple client organizations, nor for per-map role differences within one customer. `SUPER_ADMIN` (Stage 3) is platform-wide, not customer-scoped, and is still expressible as a `role` value with `customerId` conceptually null/unused for that role. `CLIENT_EDITOR` (a plausible near-future "invite a teammate" feature) is still "one user, one customer" under the currently documented product shape. Building a membership subcollection now — with its extra collection, extra joined reads on every authorization check, and extra security-rules surface — would be speculative complexity with no current requirement driving it.

**Trade-off, made explicit:** if a future requirement needs one user to belong to multiple customers (e.g. an agency managing several clients' maps) or differentiated roles per map, migrating from "field on the user doc" to a membership collection is an **additive, well-contained migration** — it relocates where `customerId`/`role` are read from, it doesn't rename or restructure the concepts themselves, and it doesn't require changing the ID strategy (§7) or the provisioning trust boundary (§10). This is why the membership-model question is marked **CAN EVOLVE LATER** in §24 rather than **LOCK NOW**.

---

## 10. Registration / Tenant Provisioning

This is the security-critical core of Phase 1A. The browser must never be able to create a `customerId`, assign `CLIENT_ADMIN` (or any role), create ownership records, or touch another customer's map — full stop.

### The atomicity problem

Firebase Authentication (a separate service) and Firestore (a separate service) cannot participate in one cross-service atomic transaction. A naive "create the Auth user, then separately write Firestore docs" flow can partially fail — most dangerously, leaving an Auth user that can sign in but has no `customerId`/`role`, which would break every downstream assumption (dashboard, rules, claims).

### Chosen architecture

A single **HTTPS Callable Cloud Function**, `registerClient`, is the **only** code path permitted to provision a tenant. It performs the entire registration in one trusted, server-side operation — including creating the Firebase Auth user itself (rather than the client creating the Auth user and separately invoking a provisioning function), specifically so the function can own compensation logic for the one seam that can't be made atomic:

1. **Validate input** using the shared `packages/validation` registration schema (also used client-side for instant form feedback — but the server check here is authoritative regardless of what the client already validated).
2. **Idempotency check** (see below) — determine whether this is a new registration or a retry of a previously-interrupted one for the same email.
3. `admin.auth().createUser({ email, password, displayName: contactName })` → obtain `uid`. *(Skipped on a detected retry — see below.)*
4. Generate `customerId` (`cust_...`) and `mapId` (`map_...`) per §7.
5. Write `customers/{customerId}`, `users/{uid}`, and `maps/{mapId}` in a **single Firestore batched write**. Firestore batched writes are atomic across multiple documents *within Firestore itself* — this fully solves the "three Firestore docs must land together" part of the problem.
6. Set custom claims (`customerId`, `role: CLIENT_ADMIN`) on the Auth user via `setCustomUserClaims`.
7. Mark `customers/{customerId}.provisioning.status = COMPLETE` as part of the same batch.
8. Return `{ customerId, mapId }` to the client, which proceeds to sign in (if needed) and establish the session cookie (§6).

**Compensation for thrown errors:** if any step after (3) throws, the function deletes the just-created Auth user (`admin.auth().deleteUser(uid)`) before returning a structured error (§18) to the client — so a *caught* failure never leaves an orphaned Auth user.

**The one gap compensation can't cover — and how it's closed:** if the function process itself is killed/times out between steps (3) and (6) (not a thrown JS error, e.g. a platform-level interruption), the compensating delete in the `catch` block never runs, and an orphaned Auth user with no Firestore docs can result. This is closed two ways, not one:

- **Idempotency by email:** before creating anything, `registerClient` checks whether an Auth user with the submitted email already exists. If one exists **and** there is no `customers/*` doc with `provisioning.status = COMPLETE` for that `uid`, the call is treated as a **retry of an interrupted registration**, not a new signup: it reuses the existing `uid`, skips `createUser`, and resumes/re-runs steps (4)–(8) (reusing already-persisted `customerId`/`mapId` if a `PENDING` customer doc already exists, rather than generating new ones and creating a duplicate customer). This makes double-clicks, client retries after a timeout, and "the network dropped right after Auth succeeded" all safe by construction.
- **Scheduled reconciliation (DEFERRED — Amendment 2):** a small, low-frequency scheduled Cloud Function (e.g. hourly, Cloud Scheduler-triggered) finds Auth users older than ~24 hours with no corresponding `users/{uid}` document and deletes them. This is the backstop for the rare true-crash case that even the idempotent-retry path can't catch (e.g., the user never retries at all). **This function is not implemented in the initial Phase 1A build.** The design is documented here and kept ready to implement, but per the approved amendment it is only built if testing or real operational experience demonstrates it's actually necessary. Its absence means the rare true-crash case is not fully closed by Phase 1A alone — this residual risk is accepted for now and tracked in §24.

### Provisioning states

`customers/{customerId}.provisioning.status`:

- **`PENDING`** — set at the start of the batched write; in the normal case this resolves to `COMPLETE` within the same function invocation (sub-second), but is modeled explicitly so the retry path in step 3 above has something concrete to check, and so the client can show an honest "setting up your account" state rather than assuming instant completion.
- **`COMPLETE`** — safe to use; dashboard and protected routes proceed normally.
- **`FAILED`** — set (where a persisted doc exists at all — in most failure modes the batch simply never committed, so there's often no doc to mark) when provisioning could not complete after retries; surfaced to the client as "registration incomplete, please try again or contact support," never as a broken/empty dashboard.

### Duplicate submissions

Handled by the same email-based idempotency check above — a duplicate submit (same email, e.g. from a double-click) resumes/completes the same tenant rather than creating a second one or throwing a confusing "email already in use" error for what is, from the user's point of view, the same attempt.

---

## 11. Default Map Creation

The single map created during registration gets the **minimum safe defaults** needed for the dashboard to render meaningfully and for later phases to build on without a schema migration — nothing more:

- `name`: derived from `companyName` (e.g. `"{companyName} Tourist Map"`)
- `status`: `DRAFT`
- `defaultLanguage`: `EN`
- `enabledLanguages`: `["EN"]`
- `mapProvider`: `{ provider: GOOGLE_MAPS, style: ROAD }` — persisted, unused by any UI in 1A
- `area`: `{ type: UNBOUNDED }` — persisted, unused by any UI in 1A

**Explicitly not created at registration:** any category, place, menu item, event, live camera, branding/theme value beyond these schema defaults, or a published snapshot. Phase 1B is where an admin meaningfully configures map center/bounds/categories/branding; Phase 1A only guarantees the document exists in a valid, forward-compatible shape.

---

## 12. Firestore Security Rules

**Ownership is verified via custom claims on the verified ID token (`request.auth.token.customerId`, `request.auth.token.role`) — never via a `get()` lookup of the user's own document inside a rule, and never via anything the client includes in a request body.** Custom claims are only settable server-side (`setCustomUserClaims`, called exclusively from `registerClient`), so a rule that checks `request.auth.token.customerId == resource.data.customerId` cannot be spoofed by the client — there is no field the browser can send that a rule will trust for identity or role.

Representative Phase 1A rules (documented here for review; the actual `firestore.rules` file is created during implementation, not by this plan):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /customers/{customerId} {
      allow read: if request.auth != null
                   && request.auth.token.customerId == customerId;
      allow write: if false; // backend (Admin SDK / Callable Function) only
    }

    match /users/{uid} {
      allow read: if request.auth != null
                   && (request.auth.uid == uid
                       || request.auth.token.customerId == resource.data.customerId);
      allow update: if request.auth != null
                     && request.auth.uid == uid
                     && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['displayName', 'updatedAt']);
      allow create, delete: if false; // backend only
    }

    match /maps/{mapId} {
      allow read: if request.auth != null
                   && request.auth.token.customerId == resource.data.customerId;
      allow write: if false; // Phase 1A: no client-side map edits at all yet
    }
  }
}
```

How this satisfies every required scenario:

- **Own customer/map read allowed** — claim-to-resource match succeeds.
- **Cross-tenant customer/map read denied** — claim won't match a different `customerId`.
- **Ownership mutation denied** — `customers`, `maps`, and `users` creation/role/`customerId` are `allow write: if false` (or excluded from the `users` update allow-list) entirely in Phase 1A; there is currently no client-writable path to any ownership or role field at all, which is the safest possible starting posture.
- **Privilege escalation denied** — `role` is not in the `users` update allow-list and isn't writable by any other rule; only trusted backend code (Admin SDK, which bypasses rules) can set it.
- **Unauthenticated denied** — every rule requires `request.auth != null`.
- **Browser can't directly provision a tenant** — `customers` create, `users` create, and `maps` create are all denied to clients outright; the only path to creating these documents is the Admin SDK inside `registerClient`, and the Admin SDK is a privileged context that security rules do not apply to by design (this is precisely the intended trust boundary, not a loophole).

**No temporary allow-all rules, at any point, including local development.** Local development and all rules tests run against the Firebase Emulator Suite using this same rules file — rules bugs are caught in development, not discovered at first production deploy.

---

## 13. Firebase Storage Rules

No file uploads are implemented in Phase 1A (branding logos and place images start in Phase 1B/1C). The Phase 1A baseline is **deny-by-default for everything**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

There is no legitimate Phase 1A path that needs Storage access, so this is the correct starting point rather than a placeholder to "fill in later." It gets revisited in whichever phase first needs a real upload path.

---

## 14. Shared Types and Validation

- **`packages/shared-types`** (§2): the single source of truth for `Customer`/`User`/`Map` shapes and all Phase 1A enums, imported by `admin-web`, `firebase/functions`, and (where needed) `tourist-web`. Zero runtime dependencies, so it's safe to import from any runtime (Node, Edge, browser) without bundling concerns.
- **`packages/validation`** (§2): Zod schemas for registration input, login input, and the Firestore document shapes above, imported by both `admin-web` (client-side pre-validation, for instant form feedback) and `firebase/functions` (server-side validation inside `registerClient`, which remains authoritative regardless of what the client already checked). This is the mechanism that prevents type/shape duplication and drift between `admin-web` and `firebase/functions`.

**Server-side validation in the Callable Function is authoritative in all cases.** Client-side validation via the same Zod schemas is a UX convenience (instant feedback, fewer round-trips) — it is never treated as the actual security or data-integrity gate.

---

## 15. API / Server Boundary

Three possible mechanisms exist in this stack; Phase 1A uses each for a distinct, non-overlapping reason rather than mixing them arbitrarily:

| Mechanism | Used for | Why |
|---|---|---|
| Direct Firebase client SDK | Reads of the signed-in user's own already-rules-protected data (e.g., the dashboard reading its own `customers/{customerId}` and `maps/{mapId}` docs) | No need to proxy a read through a server layer when security rules already protect it correctly. |
| Next.js Route Handler (`/api/auth/session`) | Session cookie creation/deletion only | Must run in a Next.js server context because it sets an httpOnly cookie — something the Firebase client SDK cannot do. |
| Firebase Callable Function (`registerClient`; the scheduled reconciliation function is designed but deferred per Amendment 2) | Tenant provisioning — the one and only path that creates `customers`/`users`/`maps` documents and assigns roles | Needs privileged Admin SDK access to both Auth and Firestore; benefits from being independently deployable/monitorable/testable from the Next.js app; Callable Functions have built-in auth-context handling well-suited to a "trusted mutation" endpoint. `SYSTEM_BLUEPRINT.md` §8 already designates `firebase/functions` as the backend for exactly this kind of operation. |

**A Next.js Server Action calling the Admin SDK directly for provisioning was considered and rejected for Phase 1A:** it would technically work, but it would entangle a security-critical, retry-sensitive, idempotency-dependent operation with the Next.js app's own deployment lifecycle, rather than keeping it as an independently testable and deployable unit. No other backend mechanism (a separate Express service, Cloud Run) is introduced — Phase 1A's scope doesn't reach the "more complex backend services" threshold `SYSTEM_BLUEPRINT.md` §8 reserves Cloud Run for.

---

## 16. Client Admin Routes

| Route | Access | Notes |
|---|---|---|
| `/register` | Public | Redirects to `/admin` if a valid active session already exists. |
| `/login` | Public | Same redirect behavior as `/register`. |
| `/admin` | Protected | Proof-of-provisioning dashboard (§17). |
| `/admin/account` | Protected | Read-only account/tenant info screen in Phase 1A — no edit form yet. |

### Redirect behavior

- **Unauthenticated** visiting any `/admin/**` route → redirect to `/login?next=<original path>` (so the user lands back where they intended after signing in).
- **Authenticated, active, `provisioning.status = COMPLETE`** → `/admin/**` renders normally; visiting `/login` or `/register` while already authenticated → redirect to `/admin`.
- **Disabled** (Firebase Auth `disabled` flag or `users/{uid}.status = DISABLED`) → forced sign-out + redirect to `/login?reason=account_disabled` with a clear, plain-language message — never a silent failure or generic error page.
- **Incomplete provisioning** (`customers/{customerId}.provisioning.status != COMPLETE`) → `/admin/**` shows a dedicated "finishing setup" (if `PENDING`) or "setup didn't complete, please contact support / try again" (if `FAILED`) state, rather than rendering a broken or empty dashboard. Given the idempotent-retry design in §10, this should be rare in practice, but it is an explicitly handled state, not an assumed-away edge case.

---

## 17. Initial Dashboard

Phase 1A's `/admin` dashboard exists to **prove tenant provisioning worked**, not to implement the real CMS dashboard described in `STAGE_1_BLUEPRINT.md` §1 (which needs Places/Categories/Languages/Publish counts that don't exist until later phases). It displays:

- Company Name
- Map Name
- `customerId`
- `mapId`
- Account Status (from `customers/{customerId}.status`)
- Map Status (from `maps/{mapId}.status` — will always read `DRAFT` in 1A)
- Published Version — shown as "Not yet published" rather than omitted silently, since the concept exists in the target architecture even though no publish engine exists yet in 1A

**Not exposed in the UI:** the raw Firebase `uid`, the contents of custom claims, internal `provisioning.lastError` details, or any other customer's data. (The `uid` remains available in dev tools/server logs for debugging — there's just no product reason to surface it in the UI.) No "Publish" button or other forward-looking affordance is shown, since a button that does nothing yet would be misleading; the dashboard states plainly, where relevant, that map configuration and publishing arrive in a later phase.

---

## 18. Error Model

A single structured error shape, used consistently client- and server-side:

```ts
type AppError = {
  code: string;        // e.g. "auth/invalid-credentials", "provisioning/duplicate-email", "authz/forbidden"
  message: string;      // plain-language, safe to show the user
  details?: unknown;    // present only in non-production responses, for diagnostics
};
```

Categories: **registration** (weak password, email already in use as a genuinely new email vs. a detected retry, provisioning failure), **authentication** (invalid credentials, disabled user, expired/invalid session), **authorization** (forbidden — cross-tenant access attempt, insufficient role), **Firestore** (generic "temporarily unavailable" surfaced to the user; full detail logged server-side only), **configuration** (a missing required env var should fail fast at boot in local/dev rather than misbehave silently at runtime).

User-facing messages are plain language and never include stack traces, internal document paths, raw Firebase error strings, or claims contents. Internal logs (§19) retain the real error code and stack trace for diagnosis.

---

## 19. Logging

Structured (JSON) log events, each tagged with an event name and, for provisioning-related events, a **correlation/request ID** generated once per registration attempt and threaded through every log line for that attempt — this is what makes the idempotent-retry path in §10 traceable end-to-end (e.g., seeing "attempt 1 timed out" and "attempt 2 resumed the same customerId" as related log lines).

Minimum required events: `registration.started`, `registration.provisioning.succeeded`, `registration.provisioning.failed`, `auth.login.failure`, `authz.denied`, `backend.unexpected_error`.

**Never logged, under any circumstance:** passwords, ID tokens, session cookie values, service-account private key material. Email addresses may be logged at info level where needed for provisioning diagnosis (they're already known to the person submitting the form and are necessary to trace a specific registration attempt), but nothing more sensitive.

---

## 20. Test Strategy

| Layer | Tool | Covers |
|---|---|---|
| **Unit** | Vitest | `packages/validation` schemas (valid/invalid input shapes), ID-generation and enum/domain logic in `packages/shared-types`-adjacent helpers, provisioning-validation logic in isolation from Firebase. |
| **Auth / Integration** | Playwright, against the Emulator Suite | Registration success (full flow through to dashboard), login success, login failure (wrong password), logout (session actually cleared, protected route inaccessible after), protected-route redirect behavior for each state in §16. |
| **Security Rules** | `@firebase/rules-unit-testing`, against the Firestore emulator | Own-customer read allowed; cross-tenant customer read denied; own-map read allowed; cross-tenant map read denied; any attempt to mutate `customerId`/`role`/ownership fields denied; self-assigned `SUPER_ADMIN` denied; unauthenticated admin-data access denied. |
| **Provisioning** | Vitest/Playwright against the Functions + Auth + Firestore emulators | Normal success path; duplicate/double-submitted registration (idempotency); simulated Firestore failure mid-batch (compensation runs, no orphaned Auth user); retry after a simulated partial failure (resumes rather than duplicates). Scheduled-reconciliation testing is out of scope for the initial Phase 1A build per Amendment 2 (the function is deferred) — it is added if/when that function is implemented. |
| **Build** | pnpm scripts | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass across the whole workspace. |

All emulator-backed tests run via `firebase emulators:exec "<test command>"` so they're hermetic and CI-runnable without touching any real Firebase project.

---

## 21. Local Development Workflow

```
pnpm install
cp apps/admin-web/.env.example apps/admin-web/.env.local   # fill emulator-safe values
cp apps/tourist-web/.env.example apps/tourist-web/.env.local
firebase emulators:start                                    # Auth + Firestore + Functions + Storage
pnpm --filter admin-web dev                                  # in a separate terminal
pnpm --filter tourist-web dev                                # in a separate terminal, different port
pnpm test                                                     # unit tests
pnpm test:rules                                               # emulator-backed rules tests
pnpm test:e2e                                                  # emulator-backed Playwright tests
```

This is a proposed workflow for the implementation step — no command above has been executed as part of this plan.

---

## 22. CI Readiness

Even though no CI configuration file is created in Phase 1A, the root scripts are structured so a future CI workflow is a thin wrapper around them:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rules   # firebase emulators:exec "..."
pnpm test:e2e     # firebase emulators:exec "..."
pnpm build
```

The two emulator-backed commands are the only ones that need a running emulator; `firebase emulators:exec` starts the emulators, runs the given command, and tears them down automatically, which is exactly the pattern a CI job needs (no separately-managed background emulator process).

---

## 23. Implementation Order

| Checkpoint | Scope | Acceptance condition |
|---|---|---|
| **1A.1** | Workspace/toolchain | `pnpm-workspace.yaml`, root configs, `.nvmrc`, empty `apps/`/`packages/` scaffolds exist; `pnpm install` succeeds; `pnpm lint`/`typecheck`/`build` run (trivially) against empty-ish apps. |
| **1A.2** | Shared domain foundation | `packages/shared-types` and `packages/validation` exist with the types/enums/schemas from §8/§14; unit tests for validation schemas pass. |
| **1A.3** | Firebase local environment | `firebase.json`, emulator config, `firestore.rules`/`storage.rules` (deny-by-default baseline) exist; `firebase emulators:start` runs cleanly with no real project required. |
| **1A.4** | Authentication | Register/login/logout work against the emulator using Firebase client SDK + the session-cookie Route Handler (§6); no tenant provisioning yet at this checkpoint — just raw Auth + session. |
| **1A.5** | Tenant provisioning | `registerClient` Callable Function implements §10 in full (batched write, custom claims, compensation, idempotent retry); provisioning tests pass against the emulator. |
| **1A.6** | Security rules | Full `firestore.rules` from §12 implemented; all rules-unit-testing scenarios in §20 pass. |
| **1A.7** | Client session/protected routes | `proxy.ts` (formerly `middleware.ts` — renamed in Next.js 16, see §4) + `(protected)/layout.tsx` implement the two-layer check from §6; all redirect scenarios in §16 verified via Playwright. |
| **1A.8** | Dashboard | `/admin` and `/admin/account` render the fields in §17 from real (emulator) data for a freshly-registered tenant. |
| **1A.9** | Integration/security tests | Full Playwright suite (registration → dashboard, second client isolation, logout, reload/session-restore, disabled-account denial) passes end-to-end against the emulator suite. |
| **1A.10** | Build/review | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:rules && pnpm test:e2e && pnpm build` all pass cleanly across the whole workspace; final diff reviewed against this plan before declaring Phase 1A complete. |

Each checkpoint is expected to be implemented and reviewed before the next begins, per the "implement only the requested phase" principle — this plan does not authorize skipping ahead to 1A.5 before 1A.1–1A.4 exist, for example.

---

## 24. Risks / Decisions

### LOCK NOW

These are expensive to change once real users/data exist, because they're load-bearing for everything built on top of them:

- **Session architecture** — Firebase session cookie + server-side `verifySessionCookie` + custom claims. Touches every protected route and the entire authorization boundary; changing it later means re-touching all of `admin-web`'s protected surface.
- **ID strategy** — prefixed random `customerId`/`mapId`, `uid` used as-is. IDs get embedded everywhere over time — URLs, documents, security rules, and eventually QR destination URLs (Phase 1H). Changing the format later is a data migration across every collection.
- **Provisioning trust boundary** — `registerClient` (Callable Function, Admin SDK) is the *only* path that can create ownership/role data; the browser can never write these fields directly. This is the core multi-tenant security invariant. It's far safer to start strict and deliberately loosen a specific case later than to start loose and try to lock it down after real tenants exist.
- **Firestore ownership fields + claims-based rules** — every tenant resource carries `customerId`; rules check it against the verified token's claims. This is the multi-tenant backbone; retrofitting ownership fields onto already-populated collections later is risky and disruptive.
- **Public/private data boundary pattern** (deny-by-default rules, claims-based reads, no allow-all anywhere) — same reasoning as above.

### CAN EVOLVE LATER

These are real decisions, documented and made deliberately, but changing them later is additive or contained rather than structurally disruptive:

- **Membership model** — simple field today, migratable to a subcollection later without renaming the underlying concepts (§9).
- **Toolchain minor/major versions** — Node 24→26 once 26 is Active LTS, TypeScript 6→7 once the ecosystem catches up, whether to introduce Turborepo/Nx if build times justify it (§3).
- **Session cookie lifetime** — a tunable value, not a structural choice (Amendment 3: initial value 14 days, read from centralized server configuration/`SESSION_COOKIE_MAX_AGE_SECONDS`, never hardcoded at call sites — the session-cookie *architecture* in §6 remains LOCK NOW, only this number is adjustable).
- **`packages/map-schema` / `localization` / `ui-tokens` creation timing** — purely additive when the first real consumer appears (§2).
- **Server-mechanism choice for future mutations beyond provisioning** — e.g. whether Phase 1B place edits go through Server Actions or a Callable Function is a Phase 1B decision; Phase 1A only locks the *provisioning* path specifically, not every future write path in the system.

---

## 25. Phase 1A Definition of Done

- [ ] A fresh client can register → tenant is safely provisioned (customer, user, map documents exist, correctly linked, `provisioning.status = COMPLETE`) → login/session is valid → the client can access exactly their own customer/map data → the dashboard loads and shows correct values.
- [ ] A second, independent client can register → receives a **different** `customerId`/`mapId` → **cannot** read or write the first client's `customers`/`users`/`maps` documents (verified by both a rules test and an integration test attempting cross-tenant access).
- [ ] Logout works → all `/admin/**` routes become inaccessible immediately after (verified, not assumed).
- [ ] Reloading the browser after login restores a valid session correctly (session cookie persists and re-verifies) without requiring the user to log in again.
- [ ] An invalid or disabled session is denied protected access, with the correct redirect and message (§16), not a broken page.
- [ ] All security rules tests (§12, §20) pass.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` (unit + integration + rules) passes.
- [ ] `pnpm build` (production build of both apps) passes.

Phase 1A is not to be reported complete unless every item above has actually been executed and verified — not merely implemented and assumed to work.
