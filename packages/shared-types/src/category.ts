import type { CategoryIcon, CategorySourceType } from './enums.js';
import type { CategoryId, CustomerId, MapId } from './ids.js';
import type { LocalizedText } from './language.js';
import type { FirestoreTimestampLike } from './timestamp.js';

/**
 * checkpoint 1B.17A "Multilingual Data Foundation" — a Category's
 * translated fields, reusing `LocalizedText` (./language.js) per field
 * rather than a single flattened translations blob (so a future
 * multi-field-translatable domain like `Poi`/`Page` has an unambiguous
 * per-field shape to mirror, see those files' own `*Translations`
 * interfaces). Entirely OPTIONAL and additive: `Category.name` (the legacy
 * scalar) is UNCHANGED and remains the single source of truth for any
 * reader that doesn't yet resolve translations — see
 * `packages/validation/src/language.ts`'s shared fallback resolver for how
 * the two are reconciled. No editor produces this yet (1B.17B); this
 * checkpoint only prepares the data model/validation so that future
 * checkpoint is additive, not a schema migration.
 */
export interface CategoryTranslations {
  readonly name?: LocalizedText;
}

/**
 * `maps/{mapId}/categories/{categoryId}` — checkpoint 1B.2, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md. Nested under its owning map, per
 * SYSTEM_BLUEPRINT.md §12's Firestore conceptual structure — not a
 * top-level collection.
 *
 * `customerId`/`mapId` are stored explicitly (not merely implied by the
 * Firestore path) so ownership can be checked directly against a category
 * document, the same defense-in-depth pattern `TouristMap.customerId`
 * already establishes — both are written exclusively by trusted backend
 * code and are never derived from, or overwritable by, client input.
 *
 * Single-language/basic for 1B.2 — no `translations` map yet. Multilingual
 * category content is Phase 1D's concern (see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §14's "no Phase 1B+ domain concept"
 * framing, applied the same way here).
 *
 * `sourceType`/`platformCategoryId` — added for the Category CMS
 * architecture checkpoint (see docs/architecture/CATEGORY_ARCHITECTURE.md),
 * BOTH optional and BOTH backward compatible: every category document
 * written by checkpoint 1B.2 predates these fields and remains valid
 * without any migration (`categorySchema` in packages/validation treats
 * them as optional for exactly this reason). `platformCategoryId` is
 * always `undefined` today — no Super Admin platform-category release
 * mechanism exists yet (see `PlatformCategoryDefinition` in
 * ./platform-category.js, a types-only future model with no runtime
 * consumer). `customName`/`customIcon` and `menuEnabled` from the
 * documented future `ClientCategoryConfig` shape are deliberately NOT
 * added here yet — see ./platform-category.js's doc comments for why each
 * is still premature.
 */
export interface Category {
  readonly categoryId: CategoryId;
  readonly customerId: CustomerId;
  readonly mapId: MapId;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly enabled: boolean;
  readonly order: number;
  readonly sourceType?: CategorySourceType;
  readonly platformCategoryId?: string;
  /** checkpoint 1B.17A — see `CategoryTranslations`' own doc comment above. Absent on every category document written before this checkpoint, and on every category no editor has translated yet. */
  readonly translations?: CategoryTranslations;
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}
