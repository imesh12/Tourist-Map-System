# Phase 1B Technical Plan — Map CMS

**Status:** Approved for implementation, checkpoint by checkpoint (§below), same convention as `STAGE_1A_TECHNICAL_PLAN.md`.
**Location:** `docs/stages/STAGE_1B_TECHNICAL_PLAN.md`
**Authoritative parents:** [`docs/architecture/SYSTEM_BLUEPRINT.md`](../architecture/SYSTEM_BLUEPRINT.md), [`docs/stages/STAGE_1_BLUEPRINT.md`](STAGE_1_BLUEPRINT.md) §3 ("Phase 1B — Map CMS: Map settings, map center, map range (bounded/unbounded), categories, basic branding"), and `STAGE_1A_TECHNICAL_PLAN.md` (Phase 1A architecture, which this plan builds on and does not reopen).

Phase 1B covers the **editable draft Map CMS**: map settings, map area, categories, and basic branding. It does **not** cover Places, Languages (beyond the existing `defaultLanguage`/`enabledLanguages` scalar fields), Tourist Web, Preview/Publish, Embed, QR, Android, or Super Admin — those are later phases/stages.

---

## 1. Checkpoints

| Checkpoint | Scope |
|---|---|
| **1B.1** | Map settings (name), map provider/style, map area (BOUNDED/UNBOUNDED, center, zoom, bounds), basic branding (logo URL, primary/secondary color) — one trusted server mutation boundary, `/admin/map` UI. |
| **1B.2** | Categories: `maps/{mapId}/categories/{categoryId}` — create/list/edit/reorder/enable-disable, client-configurable per `SYSTEM_BLUEPRINT.md` §11. |
| **1B.3** | Map CMS integration/regression pass across 1B.1 + 1B.2 together, before Phase 1C (Places) begins. |

Each checkpoint is implemented and locally verified before the next begins — same "implement only the requested checkpoint" discipline as Phase 1A.

---

## 2. Data Model (1B.1)

No new top-level Firestore collection. `maps/{mapId}` (already defined in `STAGE_1A_TECHNICAL_PLAN.md` §8) is extended with one new optional field:

- `branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string }`

Rationale: `SYSTEM_BLUEPRINT.md` §12's Firestore conceptual structure lists no separate branding collection — branding is documented only as a controlled set of theme fields (§11) plus a parallel Storage media path (`customers/{customerId}/branding/`, for the logo *file* once upload exists). A small config object embedded in the map's own document is the smallest change consistent with that structure, and avoids a speculative new collection. `logoUrl` is a plain URL string for 1B.1 — actual Storage upload UI is deferred to whichever later checkpoint first implements Storage writes (place images, Phase 1C, are the more natural first mover); a client may still paste an already-hosted URL.

`name`, `mapProvider`, and `area` already exist (Phase 1A) and become editable for the first time in 1B.1. `mapId`, `customerId`, `status`, `defaultLanguage`, `enabledLanguages`, `createdAt` are **not** editable in 1B.1.

---

## 3. Write Boundary

One Next.js Route Handler, `PATCH /api/map/settings`, following the same trusted-server-mutation shape Phase 1A already established for `/api/auth/session` (origin check, cookie-verified identity, no client-supplied ownership field ever trusted). It resolves the target map via the existing `getCurrentClientContext()` (never a client-supplied `mapId`/`customerId`), so there is no code path where a request body can select a different tenant's map — cross-tenant writes are structurally impossible, not merely rejected by a check.

Firestore `maps/{mapId}` security rules remain `allow write: if false` — the browser never writes `maps/*` directly, in 1B.1 or otherwise. No rule change is required or made.

Only `CLIENT_ADMIN` may call this endpoint in 1B.1. `CLIENT_EDITOR`'s map-settings permissions are not yet canonically defined anywhere in the blueprint; rather than guess, 1B.1 keeps write access `CLIENT_ADMIN`-only and revisits `CLIENT_EDITOR` if/when the blueprint defines its scope.

---

## 4. Draft-Only

This checkpoint edits `maps/{mapId}` directly — the live **draft** document. It does not create, read, or write `publishedMaps/*` in any way. No versioning, no publish, no rollback. That is Phase 1J. The tourist-facing app does not exist yet (Phase 1E+) and reads nothing from Phase 1B in any case.

---

## 5. Out of Scope for 1B.1

- Categories (1B.2)
- Real Storage logo upload (deferred; `logoUrl` is a plain string field only)
- Visual map/coordinate picker (later, once an admin map view exists)
- Publish/Preview engine (Phase 1J)
- Any Places/Languages/Tourist Web work
