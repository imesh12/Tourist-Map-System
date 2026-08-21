import type { CategoryIcon, CategorySourceType } from './enums.js';
import type { CategoryId, CustomerId, MapId } from './ids.js';
import type { FirestoreTimestampLike } from './timestamp.js';

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
  readonly createdAt: FirestoreTimestampLike;
  readonly updatedAt: FirestoreTimestampLike;
}
