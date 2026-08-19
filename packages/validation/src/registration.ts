import { z } from 'zod';
import { CLIENT_TYPES } from 'shared-types';

/**
 * Registration input — the untrusted-input schema for the future
 * `registerClient` provisioning flow (checkpoint 1A.5). See
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10 for the fields this maps onto:
 * `companyName`/`clientType` → `customers/{customerId}`, `contactName`/
 * `email` → both the Firebase Auth user and `customers/{customerId}`'s
 * `primaryContact*` fields, `initialMapName` → `maps/{mapId}.name` (falling
 * back to a name derived from `companyName` if omitted, per
 * SYSTEM_BLUEPRINT.md §11 / STAGE_1A_TECHNICAL_PLAN.md §11).
 *
 * SECURITY: this schema deliberately has NO `role`, `customerId`, `mapId`,
 * or `status` field — those are never client-suppliable (see
 * docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10 and the platform's core
 * ownership rule). `.strict()` below rejects any unrecognized extra key
 * outright, so an attempt to smuggle e.g. `role: "SUPER_ADMIN"` or a
 * pre-chosen `customerId` into the payload fails validation rather than
 * being silently dropped or, worse, silently accepted.
 */

const NAME_MAX_LENGTH = 200;

const trimmedNonEmptyString = (maxLength: number) => z.string().trim().min(1).max(maxLength);

export const registrationInputSchema = z
  .object({
    companyName: trimmedNonEmptyString(NAME_MAX_LENGTH),
    clientType: z.enum(CLIENT_TYPES),
    contactName: trimmedNonEmptyString(NAME_MAX_LENGTH),
    // Trimmed + lowercased before format validation, since this value
    // becomes both the Firebase Auth account email and
    // customers/{customerId}.primaryContactEmail.
    email: z.string().trim().toLowerCase().email().max(254),
    // NOT trimmed or otherwise normalized — silently altering a password
    // the user actually typed would be a correctness/security bug, not a
    // normalization. Baseline length only; Firebase Authentication itself
    // enforces its own minimum (6) — this app-level floor is intentionally
    // slightly stricter.
    password: z.string().min(8).max(128),
    // Optional: if omitted, the provisioning backend derives a default name
    // from companyName. Exposed here so a registrant can name their first
    // map immediately instead of renaming it in a later phase.
    initialMapName: trimmedNonEmptyString(NAME_MAX_LENGTH).optional(),
  })
  .strict();

export type RegistrationInput = z.infer<typeof registrationInputSchema>;
