import { z } from 'zod';

/**
 * Login input — the untrusted-input schema for checkpoint 1A.4's email/
 * password sign-in form (`apps/admin-web`'s `/login` page).
 *
 * This is deliberately a SEPARATE schema from `registrationInputSchema`
 * (§10/§14 of docs/stages/STAGE_1A_TECHNICAL_PLAN.md), not a reuse of it:
 * login only ever needs `email`/`password`, and the two schemas enforce
 * different password rules for different reasons (see below).
 *
 * SECURITY: exactly like `registrationInputSchema`, this schema has NO
 * `role`, `customerId`, `mapId`, or `status` field, and `.strict()` rejects
 * any unrecognized extra key outright — an attempt to smuggle
 * `role: "SUPER_ADMIN"` or any tenant-ownership field into a login payload
 * fails validation rather than being silently dropped or accepted. Login
 * only ever proves "which Firebase user is this" — see
 * `lib/auth/verify-session.ts` in admin-web for where that boundary is
 * enforced server-side; this schema is the client-side input gate in front
 * of it.
 */

const EMAIL_MAX_LENGTH = 254;
// Firebase Authentication's own password floor is 6 characters. Login must
// accept whatever an existing account's password actually is — unlike
// registration (which enforces an 8-char *creation* baseline going
// forward), a login schema that re-enforced the 8-char floor could reject a
// legitimately correct password created under an older/looser policy, or a
// password set directly by a future Stage 3 admin tool. Firebase itself is
// the source of truth for whether the credential is correct; this schema
// only guards against empty/pathologically large payloads reaching the
// Firebase SDK call.
const PASSWORD_MIN_LENGTH = 1;
const PASSWORD_MAX_LENGTH = 4096;

export const loginInputSchema = z
  .object({
    // Trimmed + lowercased before format validation, mirroring
    // registrationInputSchema — this is the same value Firebase
    // Authentication treats as the account identifier.
    email: z.string().trim().toLowerCase().email().max(EMAIL_MAX_LENGTH),
    // NOT trimmed, lowercased, or otherwise transformed — preserved exactly
    // as typed. Silently altering a password the user actually typed would
    // be a correctness/security bug, not a normalization (same rule as
    // registrationInputSchema).
    password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  })
  .strict();

export type LoginInput = z.infer<typeof loginInputSchema>;
