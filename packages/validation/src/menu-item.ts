import { z } from 'zod';
import { MENU_ITEM_STATUSES, RELEASED_FEATURE_KEYS } from 'shared-types';
import { categoryIconSchema } from './category.js';
import { categoryIdSchema, customerIdSchema, mapIdSchema, menuItemIdSchema } from './ids.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * MenuItem domain + input schemas — checkpoint 1B.5, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md §12. Mirrors category.ts's/
 * poi.ts's shape (full-document schema for defense-in-depth reads, plus
 * separate `.strict()` create/update input schemas for the untrusted
 * mutation boundary) — with one structural difference: `menuItemSchema` and
 * `menuItemCreateInputSchema` are both real `z.discriminatedUnion('type', ...)`
 * schemas, not a single flat `.object()` with optional `categoryId`/
 * `featureKey` fields, because §3 of the checkpoint requires this at the
 * type level: "Do not support malformed mixed states." A discriminated
 * union rejects (at parse time, not just via a `.refine()` afterthought) any
 * payload that supplies both `categoryId` and `featureKey`, or neither, for
 * a given `type`.
 *
 * Every branch object below MUST call `.strict()`. Zod's default object
 * mode silently STRIPS unknown keys rather than rejecting them — without
 * `.strict()`, a payload matching the `CATEGORY` branch's `type` literal but
 * also carrying a `featureKey` (or vice versa) would parse "successfully"
 * with the extra key quietly dropped, defeating the "reject malformed mixed
 * states" guarantee this comment claims. Repair Round 1 (checkpoint 1B.6)
 * found `menuItemSchema` missing `.strict()` on both branches for exactly
 * this reason — `menuItemCreateInputSchema` below already had it right;
 * mirror that pattern here and in any future branch added to this file.
 */

const LABEL_MAX_LENGTH = 60;

export const menuItemLabelSchema = z.string().trim().min(1).max(LABEL_MAX_LENGTH);
export const menuItemStatusSchema = z.enum(MENU_ITEM_STATUSES);
export const menuItemOrderSchema = z.number().int().min(0);
/**
 * A menu item's `featureKey` — deliberately the CLOSED `RELEASED_FEATURE_KEYS`
 * enum (shared-types), never a bare string. §7 of the checkpoint: "Do not
 * trust arbitrary featureKey strings from browser input. Validation should
 * only accept released keys." — this is what makes that an enforced
 * server-side invariant rather than a UI convention, exactly like
 * `categoryPlatformCategoryIdSchema`'s identical role for platform
 * categories.
 */
export const menuItemFeatureKeySchema = z.enum(RELEASED_FEATURE_KEYS);
/** A `CATEGORY` menu item's optional client icon override — reuses the same controlled `categoryIconSchema` catalog, never a free-form string (§16: "No arbitrary SVG/HTML/script"). */
export const menuItemIconSchema = categoryIconSchema;

/**
 * Full stored document — defense-in-depth validation for reads, mirroring
 * `categorySchema`/`poiSchema`'s role. A real discriminated union: the
 * `CATEGORY` branch requires `categoryId` and has no `featureKey` field at
 * all (not merely an absent optional one — zod's object shape genuinely
 * doesn't include it), and vice versa for `FEATURE`.
 */
export const menuItemSchema = z.discriminatedUnion('type', [
  z
    .object({
      menuItemId: menuItemIdSchema,
      customerId: customerIdSchema,
      mapId: mapIdSchema,
      type: z.literal('CATEGORY'),
      label: menuItemLabelSchema,
      categoryId: categoryIdSchema,
      icon: menuItemIconSchema.optional(),
      order: menuItemOrderSchema,
      status: menuItemStatusSchema,
      createdAt: firestoreTimestampLikeSchema,
      updatedAt: firestoreTimestampLikeSchema,
    })
    .strict(),
  z
    .object({
      menuItemId: menuItemIdSchema,
      customerId: customerIdSchema,
      mapId: mapIdSchema,
      type: z.literal('FEATURE'),
      label: menuItemLabelSchema,
      featureKey: menuItemFeatureKeySchema,
      order: menuItemOrderSchema,
      status: menuItemStatusSchema,
      createdAt: firestoreTimestampLikeSchema,
      updatedAt: firestoreTimestampLikeSchema,
    })
    .strict(),
]);
export type MenuItemParsed = z.infer<typeof menuItemSchema>;

/**
 * `POST /api/map/menu-items` input. `.strict()` on EACH branch rejects
 * `menuItemId`/`customerId`/`mapId`/`createdAt`/`updatedAt` outright, same
 * as every other create-input schema in this package — none of those are
 * ever client-suppliable. `categoryId`/`featureKey` are validated for FORMAT
 * only here (`categoryId`) or CLOSED-ENUM membership (`featureKey`) — the
 * route handler is additionally responsible for verifying a `categoryId`
 * actually references a category that exists (and is enabled — §11) under
 * the caller's own authenticated map before writing anything, and for
 * enforcing the "at most once per map" uniqueness rule (§12) neither this
 * schema nor Zod can express.
 */
export const menuItemCreateInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('CATEGORY'),
      categoryId: categoryIdSchema,
      label: menuItemLabelSchema,
      icon: menuItemIconSchema.optional(),
      order: menuItemOrderSchema.optional(),
      status: menuItemStatusSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('FEATURE'),
      featureKey: menuItemFeatureKeySchema,
      label: menuItemLabelSchema,
      order: menuItemOrderSchema.optional(),
      status: menuItemStatusSchema.optional(),
    })
    .strict(),
]);
export type MenuItemCreateInput = z.infer<typeof menuItemCreateInputSchema>;

/**
 * `PATCH /api/map/menu-items/{menuItemId}` input — deliberately NOT a
 * discriminated union, and deliberately has NO `type`/`categoryId`/
 * `featureKey` fields at all: which category/feature a menu item references
 * (and its `type`) is immutable after creation (a documented scope decision,
 * see the route handler's own doc comment) — swapping a `MenuItem` from one
 * category to another, or from `CATEGORY` to `FEATURE`, is not supported;
 * remove the item and add a new one instead. This keeps the duplicate-
 * uniqueness check (§12) and the category-ownership/eligibility check (§11)
 * both permanently a CREATE-time-only concern, with nothing to re-verify on
 * every edit.
 *
 * Every field optional (a partial update), but at least one must be
 * present. `icon` accepts a controlled value OR explicit `null` (clear an
 * override, revert to the linked category's own default icon) — mirrors
 * `categoryUpdateInputSchema.platformCategoryId`'s identical link/unlink
 * shape. The route additionally rejects `icon` entirely when the target
 * menu item's own stored `type` is `FEATURE` (a `FEATURE` item's icon is
 * never client-chosen, always the registry's) — a check this schema itself
 * cannot make, since it has no way to know which menu item a given request
 * targets.
 */
export const menuItemUpdateInputSchema = z
  .object({
    label: menuItemLabelSchema.optional(),
    icon: menuItemIconSchema.nullable().optional(),
    order: menuItemOrderSchema.optional(),
    status: menuItemStatusSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
export type MenuItemUpdateInput = z.infer<typeof menuItemUpdateInputSchema>;

/**
 * `POST /api/maps/{mapId}/menu-items/reorder` input — Repair Round 4
 * (checkpoint 1B.6). Swaps exactly two menu items' `order` values in a
 * single atomic write, replacing the previous client behavior of firing two
 * independent `PATCH .../menu-items/{menuItemId}` requests in parallel to
 * express one logical "move up"/"move down" action. That two-request
 * approach is not atomic as a *pair*: nothing stops the browser (or a
 * dropped connection) from completing one PATCH while cancelling or losing
 * the other — e.g. a navigation started immediately after the click, before
 * both requests finish — which can leave two items sharing an `order` value,
 * or leave a swap only half-applied. Always exactly two entries: this
 * endpoint expresses "swap these two adjacent items," not a general-purpose
 * bulk reorder — see the route handler's own doc comment for the rest of
 * the reasoning and the atomicity guarantee it provides.
 */
export const menuItemReorderInputSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            menuItemId: menuItemIdSchema,
            order: menuItemOrderSchema,
          })
          .strict(),
      )
      .length(2),
  })
  .strict()
  .refine((data) => data.items[0]!.menuItemId !== data.items[1]!.menuItemId, {
    message: 'Cannot reorder a menu item against itself',
  });
export type MenuItemReorderInput = z.infer<typeof menuItemReorderInputSchema>;
