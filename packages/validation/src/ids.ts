import { z } from 'zod';
import {
  CATEGORY_ID_PREFIX,
  CUSTOMER_ID_PREFIX,
  MAP_ID_PREFIX,
  MENU_ITEM_ID_PREFIX,
  PAGE_ID_PREFIX,
  POI_ID_PREFIX,
  PUBLICATION_ID_PREFIX,
} from 'shared-types';

/**
 * Format validation only — ID *generation* is trusted-backend-only
 * (checkpoint 1A.5, the `registerClient` provisioning function; see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §7 and §10). This file exists so
 * any code that *receives* an ID (reading a document, or defense-in-depth
 * validation before a write) can reject malformed or injected values,
 * without assuming one exact random generator or exact length — only the
 * prefix and a reasonable, URL-safe character-class/length envelope for the
 * random suffix.
 */
const randomSuffixPattern = (prefix: string) => new RegExp(`^${prefix}[A-Za-z0-9_-]{16,40}$`);

export const customerIdSchema = z
  .string()
  .regex(
    randomSuffixPattern(CUSTOMER_ID_PREFIX),
    `customerId must match ${CUSTOMER_ID_PREFIX}<16-40 url-safe characters>`,
  );

export const mapIdSchema = z
  .string()
  .regex(randomSuffixPattern(MAP_ID_PREFIX), `mapId must match ${MAP_ID_PREFIX}<16-40 url-safe characters>`);

export const categoryIdSchema = z
  .string()
  .regex(randomSuffixPattern(CATEGORY_ID_PREFIX), `categoryId must match ${CATEGORY_ID_PREFIX}<16-40 url-safe characters>`);

export const poiIdSchema = z
  .string()
  .regex(randomSuffixPattern(POI_ID_PREFIX), `poiId must match ${POI_ID_PREFIX}<16-40 url-safe characters>`);

/** checkpoint 1B.5 — see shared-types' `MenuItem`. */
export const menuItemIdSchema = z
  .string()
  .regex(randomSuffixPattern(MENU_ITEM_ID_PREFIX), `menuItemId must match ${MENU_ITEM_ID_PREFIX}<16-40 url-safe characters>`);

/** checkpoint 1B.8 — see shared-types' `MapPublicationSnapshot`. */
export const publicationIdSchema = z
  .string()
  .regex(
    randomSuffixPattern(PUBLICATION_ID_PREFIX),
    `publicationId must match ${PUBLICATION_ID_PREFIX}<16-40 url-safe characters>`,
  );

/** checkpoint 1B.11 — see shared-types' `Page`. */
export const pageIdSchema = z
  .string()
  .regex(randomSuffixPattern(PAGE_ID_PREFIX), `pageId must match ${PAGE_ID_PREFIX}<16-40 url-safe characters>`);

/**
 * Firebase Authentication UID. Firebase documents UIDs as 1-128 characters;
 * deliberately not pinned to the ~28-character length of default-generated
 * UIDs, since custom/imported UIDs are allowed to differ — see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §7.
 */
export const uidSchema = z.string().min(1).max(128);
