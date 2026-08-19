import { z } from 'zod';
import { LANGUAGES, MAP_AREA_TYPES, MAP_PROVIDER_NAMES, MAP_STATUSES, MAP_STYLES } from 'shared-types';
import { customerIdSchema, mapIdSchema } from './ids';
import { firestoreTimestampLikeSchema } from './timestamp';

/**
 * Mirrors shared-types' `TouristMap` interface. `customerId` is the
 * ownership field — this schema validates its *format* (via
 * `customerIdSchema`) but, per docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10,
 * the *value* itself must always come from trusted backend context (the
 * `customerId` the authenticated caller's custom claims resolve to), never
 * from client-supplied input, even where this schema is reused for
 * defense-in-depth validation before a write.
 */
export const mapSchema = z
  .object({
    mapId: mapIdSchema,
    customerId: customerIdSchema,
    name: z.string().trim().min(1).max(200),
    status: z.enum(MAP_STATUSES),
    defaultLanguage: z.enum(LANGUAGES),
    enabledLanguages: z
      .array(z.enum(LANGUAGES))
      .min(1)
      .refine((languages) => new Set(languages).size === languages.length, {
        message: 'enabledLanguages must not contain duplicates',
      }),
    mapProvider: z.object({
      provider: z.enum(MAP_PROVIDER_NAMES),
      style: z.enum(MAP_STYLES),
    }),
    area: z.object({
      type: z.enum(MAP_AREA_TYPES),
      center: z.object({ lat: z.number(), lng: z.number() }).optional(),
      defaultZoom: z.number().optional(),
      bounds: z
        .object({
          north: z.number(),
          south: z.number(),
          east: z.number(),
          west: z.number(),
        })
        .optional(),
    }),
    createdAt: firestoreTimestampLikeSchema,
    updatedAt: firestoreTimestampLikeSchema,
  })
  // Invariant from docs/stages/STAGE_1A_TECHNICAL_PLAN.md §8:
  // enabledLanguages must always include defaultLanguage.
  .refine((map) => map.enabledLanguages.includes(map.defaultLanguage), {
    message: 'enabledLanguages must include defaultLanguage',
    path: ['enabledLanguages'],
  });

export type MapParsed = z.infer<typeof mapSchema>;
