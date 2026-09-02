import { z } from 'zod';
import { CATEGORY_ICONS, CATEGORY_SOURCE_TYPES, RELEASED_PLATFORM_CATEGORY_IDS } from 'shared-types';
import { categoryIdSchema, customerIdSchema, mapIdSchema } from './ids.js';
import { localizedTextSchema } from './language.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * Category domain + input schemas — checkpoint 1B.2, see
 * docs/stages/STAGE_1B_TECHNICAL_PLAN.md. Mirrors shared-types' `Category`.
 */

const NAME_MAX_LENGTH = 100;

export const categoryNameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);
export const categoryIconSchema = z.enum(CATEGORY_ICONS);
export const categoryOrderSchema = z.number().int().min(0);
export const categorySourceTypeSchema = z.enum(CATEGORY_SOURCE_TYPES);

/**
 * A category's `platformCategoryId` link — checkpoint 1B.4. Deliberately a
 * closed `z.enum` over `RELEASED_PLATFORM_CATEGORY_IDS` (shared-types), not
 * a bare `z.string()` — a category-linking request can only ever name one of
 * the platform's own currently-released registry entries, never an
 * arbitrary string; this is what makes the Categories UI's "controlled
 * dropdown only, never arbitrary platformCategoryId input" requirement an
 * enforced server-side invariant rather than just a UI convention.
 */
export const categoryPlatformCategoryIdSchema = z.enum(RELEASED_PLATFORM_CATEGORY_IDS);

/**
 * checkpoint 1B.17A — a Category's translated fields, mirroring shared-types'
 * `CategoryTranslations`. `name`'s translation bound matches `categoryNameSchema`'s
 * own `NAME_MAX_LENGTH` exactly (§13: "preserve existing field length
 * constraints").
 */
export const categoryTranslationsSchema = z
  .object({
    name: localizedTextSchema(NAME_MAX_LENGTH).optional(),
  })
  .strict();

/**
 * Full stored document — defense-in-depth validation for reads, mirroring
 * `mapSchema`'s role. `sourceType`/`platformCategoryId` are optional —
 * Category CMS architecture checkpoint, see
 * docs/architecture/CATEGORY_ARCHITECTURE.md and shared-types' `Category`
 * doc comment: every category document written before these fields existed
 * (checkpoint 1B.2) must keep parsing successfully with no migration, so
 * both stay optional rather than required-with-a-default.
 */
export const categorySchema = z.object({
  categoryId: categoryIdSchema,
  customerId: customerIdSchema,
  mapId: mapIdSchema,
  name: categoryNameSchema,
  icon: categoryIconSchema,
  enabled: z.boolean(),
  order: categoryOrderSchema,
  sourceType: categorySourceTypeSchema.optional(),
  platformCategoryId: z.string().optional(),
  // checkpoint 1B.17A — optional, backward compatible: every category
  // document written before this checkpoint (and every category no editor
  // has translated yet) has no `translations` field at all.
  translations: categoryTranslationsSchema.optional(),
  createdAt: firestoreTimestampLikeSchema,
  updatedAt: firestoreTimestampLikeSchema,
});
export type CategoryParsed = z.infer<typeof categorySchema>;

/**
 * `POST /api/map/categories` input — the untrusted-input schema for
 * creating a category. `.strict()` rejects `categoryId`/`customerId`/
 * `mapId`/`createdAt`/`updatedAt` outright, exactly like
 * `registrationInputSchema`'s "no ownership/identity field at all" pattern
 * (docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10) — none of those are ever
 * client-suppliable; the server derives/generates them. `order` is optional:
 * when omitted, the server appends the category to the end of the current
 * list (see the route handler) rather than requiring the client to compute
 * a correct value itself. `sourceType` is deliberately NOT a field on this
 * schema — Category CMS architecture checkpoint: whether a category is
 * `PLATFORM`- or `CLIENT_CUSTOM`-sourced is a trust decision the server
 * makes (today, always `CLIENT_CUSTOM` — see the route handler), never
 * something a request body gets to assert, exactly like every other
 * ownership/identity field above.
 *
 * `platformCategoryId` — added checkpoint 1B.4, optional, and deliberately
 * the CLOSED `categoryPlatformCategoryIdSchema` enum above rather than a
 * bare string: a Client Admin may opt in to linking their own,
 * still-`CLIENT_CUSTOM`-sourced category to one of the platform's released
 * capability sets (today, only `RESTAURANT`), but can never assert an
 * arbitrary/unreleased ID. Omitting it (the default) creates a purely
 * custom category with no linked capability, exactly like every category
 * before checkpoint 1B.4 existed.
 *
 * `translations` — checkpoint 1B.17B §10. Optional, reuses
 * `categoryTranslationsSchema` verbatim (never a parallel/looser copy). The
 * route handler is additionally responsible for verifying every language key
 * present is one of THIS map's own `enabledLanguages` (not just the global
 * registry `categoryTranslationsSchema` itself already checks) — see
 * `isTranslationsWithinSupportedLanguages()` (./language.ts), a check this
 * schema alone cannot make since it has no access to which map a given
 * request targets.
 */
export const categoryCreateInputSchema = z
  .object({
    name: categoryNameSchema,
    icon: categoryIconSchema,
    enabled: z.boolean().optional(),
    order: categoryOrderSchema.optional(),
    platformCategoryId: categoryPlatformCategoryIdSchema.optional(),
    translations: categoryTranslationsSchema.optional(),
  })
  .strict();
export type CategoryCreateInput = z.infer<typeof categoryCreateInputSchema>;

/**
 * `PATCH /api/map/categories/{categoryId}` input — every field is optional
 * (a partial update: e.g. an enable/disable toggle sends only `enabled`),
 * but at least one must be present, and `categoryId`/`customerId`/`mapId`/
 * `createdAt`/`updatedAt` are — as with create — not fields on this schema
 * at all, so no request body can move a category to another map/tenant or
 * forge its identity/timestamps.
 *
 * `platformCategoryId` — checkpoint 1B.4, accepts either a released ID
 * (link/re-link) or literal `null` (explicitly unlink back to a purely
 * custom category — see the route handler's `FieldValue.delete()` on
 * `null`). Omitting the field entirely leaves the existing link, if any,
 * untouched — the same "only touch what was sent" convention every other
 * optional field on this schema already follows.
 *
 * `translations` — checkpoint 1B.17B §10, same shape/reasoning as
 * `categoryCreateInputSchema` above. When present, it is treated as the FULL
 * desired translations state for this category (a complete replace, not a
 * per-language patch — mirroring `theme`/`languages` on
 * `mapSettingsUpdateSchema`'s own "always sent as one complete object"
 * convention) — the route handler clears the stored field entirely when this
 * resolves to an empty object, which is what makes "deleting text removes the
 * key" (§9) work: the Admin translation editor always sends its current full
 * local state, so a language cleared back to blank in the form is simply
 * absent from this object on submit, not sent as `''`.
 */
export const categoryUpdateInputSchema = z
  .object({
    name: categoryNameSchema.optional(),
    icon: categoryIconSchema.optional(),
    enabled: z.boolean().optional(),
    order: categoryOrderSchema.optional(),
    platformCategoryId: categoryPlatformCategoryIdSchema.nullable().optional(),
    translations: categoryTranslationsSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInputSchema>;
