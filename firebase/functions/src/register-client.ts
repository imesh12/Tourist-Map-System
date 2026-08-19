import { randomUUID } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { registrationInputSchema } from 'validation';
import { getAdminAuth, getAdminFirestore } from './firebase-admin.js';
import { generateCustomerId, generateMapId } from './ids.js';
import { ProvisioningError, provisionClient } from './provisioning/provision-client.js';

/**
 * `registerClient` — the sole trusted tenant-provisioning boundary,
 * checkpoint 1A.5. See docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10/§15.
 *
 * Deliberately callable WITHOUT a prior session: this is what performs a
 * brand-new registrant's very first Firebase Auth user creation (§6 — the
 * client never calls `createUserWithEmailAndPassword` directly for
 * registration; it calls this function instead, so Auth-user creation can
 * be folded into the same trusted operation that also provisions the
 * tenant and can compensate on failure).
 *
 * `request.data` is untrusted input from the browser and is validated
 * through `registrationInputSchema` before anything else happens —that
 * schema has no `role`/`customerId`/`mapId`/`status` field at all, so there
 * is no field name a caller could supply that would ever reach
 * `provisionClient` as a privileged value.
 */
export const registerClient = onCall(async (request) => {
  const requestId = randomUUID();

  const parsed = registrationInputSchema.safeParse(request.data);
  if (!parsed.success) {
    logger.info('registration.provisioning.failed', { requestId, reason: 'invalid_input' });
    throw new HttpsError('invalid-argument', 'Please check the registration form and try again.', {
      code: 'validation/invalid-input',
    });
  }

  // Safe to log once validated: trimmed/lowercased/format-checked, and
  // email logging for provisioning diagnosis is explicitly permitted by
  // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §19. The password is never
  // logged, here or anywhere else in this module.
  logger.info('registration.started', { requestId, email: parsed.data.email });

  try {
    const result = await provisionClient(parsed.data, {
      auth: getAdminAuth(),
      firestore: getAdminFirestore(),
      generateCustomerId,
      generateMapId,
    });

    logger.info('registration.provisioning.succeeded', {
      requestId,
      email: parsed.data.email,
      customerId: result.customerId,
      mapId: result.mapId,
    });

    return result;
  } catch (error) {
    const code = error instanceof ProvisioningError ? error.code : 'provisioning/failed';
    const message = error instanceof ProvisioningError ? error.message : 'Registration could not be completed. Please try again.';

    logger.error('registration.provisioning.failed', {
      requestId,
      email: parsed.data.email,
      reason: code,
      // Server-side diagnostic only — never returned to the client in the
      // HttpsError below, never a password/token/credential.
      // docs/stages/STAGE_1A_TECHNICAL_PLAN.md §19.
      detail: error instanceof Error ? error.message : String(error),
    });

    const httpsCode = code === 'provisioning/duplicate-email' ? 'already-exists' : 'internal';
    throw new HttpsError(httpsCode, message, { code });
  }
});
