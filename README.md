# Tourist Map System

Multi-tenant digital tourism platform monorepo. See [`docs/architecture/SYSTEM_BLUEPRINT.md`](docs/architecture/SYSTEM_BLUEPRINT.md) for the canonical system architecture, [`docs/stages/STAGE_1_BLUEPRINT.md`](docs/stages/STAGE_1_BLUEPRINT.md) for Stage 1 scope, and [`docs/stages/STAGE_1A_TECHNICAL_PLAN.md`](docs/stages/STAGE_1A_TECHNICAL_PLAN.md) for the current phase's implementation-level plan.

**Current phase: 1A — Foundation** (workspace/toolchain, Firebase environments, authentication, tenant provisioning, security rules, protected routes, proof-of-provisioning dashboard). Not yet implemented: Map CMS, Places, Languages, Branding, the Tourist Web UI, Voice Guide, QR, Embedding, Publishing, Android, or Super Admin — see the Stage 1 blueprint for sequencing.

## Toolchain

| Tool | Version |
|---|---|
| Node.js | 24 LTS (pinned via `.nvmrc`, currently `24.19.0`) |
| pnpm | 11.x (pinned via `packageManager` in `package.json`, currently `11.22.0`) |
| TypeScript | 6.x (`~6.0.0`) — **not** TypeScript 7 during Phase 1A |
| Next.js | 16.x (`admin-web`, `tourist-web`) |
| React | 19.2.x |

Exact patch versions in `package.json`/`.nvmrc` should be reconciled against the actual registry-resolved versions the first time `pnpm install` is run in an environment with package registry access (see the Phase 1A.1 completion report for why that could not be done in the authoring session).

## Repository layout

```
apps/
  admin-web/    Client Admin web application (full Phase 1A functionality)
  tourist-web/  Public tourist-facing web application (foundation scaffold only in 1A)
packages/
  shared-types/ Framework-agnostic domain types and enums, zero runtime dependencies
  validation/   Zod schemas shared between admin-web and firebase/functions
firebase/
  functions/    Cloud Functions (tenant provisioning, etc.)
  firestore.rules
  firestore.indexes.json
  storage.rules
  firebase.json
docs/
  architecture/ Canonical system architecture
  stages/       Per-phase blueprints and technical plans
```

`packages/map-schema`, `packages/localization`, and `packages/ui-tokens` are intentionally not present yet — see `docs/stages/STAGE_1A_TECHNICAL_PLAN.md` §2 for why each is deferred to a later phase.

## Local development workflow

```bash
pnpm install

# Per app, copy the example env file and fill in emulator-safe values:
cp apps/admin-web/.env.example apps/admin-web/.env.local
cp apps/tourist-web/.env.example apps/tourist-web/.env.local

# Start the Firebase Emulator Suite (Auth + Firestore + Functions + Storage):
firebase emulators:start

# In separate terminals:
pnpm --filter admin-web dev
pnpm --filter tourist-web dev

# Verification:
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No real Firebase project, credentials, or secrets are checked into this repository. `.env.example` files list variable names only — see `docs/stages/STAGE_1A_TECHNICAL_PLAN.md` §5 for the full environment-variable reference and the dev/staging/production project strategy.
