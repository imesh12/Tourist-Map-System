import { z } from 'zod';
import { PAGE_STATUSES } from 'shared-types';
import { customerIdSchema, mapIdSchema, pageIdSchema } from './ids.js';
import { localizedTextSchema } from './language.js';
import { firestoreTimestampLikeSchema } from './timestamp.js';

/**
 * Page domain + input schemas — checkpoint 1B.11, see shared-types' `Page`
 * doc comment. Mirrors `category.ts`/`poi.ts`'s shape (full-document schema
 * for defense-in-depth reads, plus separate `.strict()` create/update input
 * schemas for the untrusted mutation boundary).
 *
 * `content` is validated as plain text only — no HTML/markup schema of any
 * kind exists here, matching §4 of the checkpoint ("Do NOT implement
 * arbitrary raw HTML storage/rendering... prefer safe plain-text
 * informational content"). A bound of 10,000 characters is generous for
 * genuinely informational content (a Wi-Fi guide, shuttle schedule,
 * check-in instructions) while still ruling out unbounded document storage
 * abuse through this endpoint.
 */

const TITLE_MAX_LENGTH = 150;
const CONTENT_MAX_LENGTH = 10_000;

export const pageTitleSchema = z.string().trim().min(1).max(TITLE_MAX_LENGTH);
/** Required — checkpoint 1B.11 §5's "content: required or explicitly defined empty behavior" is resolved as REQUIRED: an informational Page with no content is not a meaningful publishable unit, so the create/edit form always collects it, matching `pageTitleSchema`'s own required shape rather than introducing a separate "empty content" state to reason about. */
export const pageContentSchema = z.string().trim().min(1).max(CONTENT_MAX_LENGTH);
export const pageStatusSchema = z.enum(PAGE_STATUSES);

/** checkpoint 1B.17A — a Page's translated fields, mirroring shared-types' `PageTranslations`. Each field's translation bound matches its own scalar schema's max length exactly (§13). */
export const pageTranslationsSchema = z
  .object({
    title: localizedTextSchema(TITLE_MAX_LENGTH).optional(),
    content: localizedTextSchema(CONTENT_MAX_LENGTH).optional(),
  })
  .strict();

/**
 * Full stored document — defense-in-depth validation for reads, mirroring
 * `categorySchema`/`poiSchema`'s role.
 */
export const pageSchema = z.object({
  pageId: pageIdSchema,
  customerId: customerIdSchema,
  mapId: mapIdSchema,
  title: pageTitleSchema,
  content: pageContentSchema,
  // checkpoint 1B.17A — optional, backward compatible, mirrors `categorySchema.translations`.
  translations: pageTranslationsSchema.optional(),
  status: pageStatusSchema,
  createdAt: firestoreTimestampLikeSchema,
  updatedAt: firestoreTimestampLikeSchema,
});
export type PageParsed = z.infer<typeof pageSchema>;

/**
 * `POST /api/maps/{mapId}/pages` input. `.strict()` rejects `pageId`/
 * `customerId`/`mapId`/`createdAt`/`updatedAt` outright — none of those are
 * ever client-suppliable; the server derives/generates/stamps them. `status`
 * is optional (defaults to `ENABLED` in the route handler, mirroring
 * `poiCreateInputSchema`'s identical default-on-omit convention).
 */
export const pageCreateInputSchema = z
  .object({
    title: pageTitleSchema,
    content: pageContentSchema,
    status: pageStatusSchema.optional(),
    // checkpoint 1B.17B §10 — see `pageTranslationsSchema`'s own doc comment
    // above. The route handler additionally enforces that every language key
    // present is one of THIS map's `enabledLanguages`.
    translations: pageTranslationsSchema.optional(),
  })
  .strict();
export type PageCreateInput = z.infer<typeof pageCreateInputSchema>;

/**
 * `PATCH /api/maps/{mapId}/pages/{pageId}` input — every field optional (a
 * partial update: e.g. an enable/disable toggle sends only `status`), but at
 * least one must be present. `pageId`/`customerId`/`mapId`/`createdAt`/
 * `updatedAt` are not fields on this schema at all, exactly like
 * `categoryUpdateInputSchema`/`poiUpdateInputSchema`.
 */
export const pageUpdateInputSchema = z
  .object({
    title: pageTitleSchema.optional(),
    content: pageContentSchema.optional(),
    status: pageStatusSchema.optional(),
    // checkpoint 1B.17B §10 — a FULL-replace object, same convention
    // `categoryUpdateInputSchema.translations`'s own doc comment documents.
    translations: pageTranslationsSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });
export type PageUpdateInput = z.infer<typeof pageUpdateInputSchema>;
