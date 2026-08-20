'use client';

import { httpsCallable } from 'firebase/functions';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { CLIENT_TYPES, type ClientType } from 'shared-types';
import { registrationInputSchema } from 'validation';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { completeFirebaseLogin } from '@/lib/auth/complete-login';
import { AuthAppError, mapRegistrationError } from '@/lib/auth/errors';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebase/client';

/**
 * The `/register` form — checkpoint 1A.9.
 *
 * `registerClient` (docs/stages/STAGE_1A_TECHNICAL_PLAN.md §10/§15) is the
 * ONLY code path that ever creates a Firebase Auth user for registration
 * and provisions the tenant — this form never calls
 * `createUserWithEmailAndPassword` itself. Once the Callable Function
 * returns successfully, the tenant already exists (customer, user, map
 * documents, custom claims); this form then signs the browser in with the
 * same credentials and hands off to the SAME `completeFirebaseLogin()` the
 * `/login` form uses (§4B) — one shared session-establishment path,
 * regardless of whether the user just registered or is returning.
 */

interface RegisterClientResult {
  readonly customerId: string;
  readonly mapId: string;
}

interface FieldErrors {
  companyName?: string;
  clientType?: string;
  contactName?: string;
  email?: string;
  password?: string;
  initialMapName?: string;
}

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  RAILWAY: 'Railway',
  HOTEL: 'Hotel',
  MUNICIPALITY: 'Municipality',
  TOURISM_ORGANIZATION: 'Tourism Organization',
  SHOPPING_FACILITY: 'Shopping Facility',
  OTHER: 'Other',
};

export function RegisterForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('OTHER');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setFormError(undefined);
    setFieldErrors({});

    const parsed = registrationInputSchema.safeParse({ companyName, clientType, contactName, email, password });
    if (!parsed.success) {
      const knownFields = ['companyName', 'clientType', 'contactName', 'email', 'password', 'initialMapName'] as const;
      const nextFieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key !== 'string' || !(knownFields as readonly string[]).includes(key)) {
          continue;
        }
        const fieldKey = key as keyof FieldErrors;
        if (!nextFieldErrors[fieldKey]) {
          nextFieldErrors[fieldKey] = issue.message;
        }
      }
      setFieldErrors(nextFieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const registerClient = httpsCallable<typeof parsed.data, RegisterClientResult>(getFirebaseFunctions(), 'registerClient');
      await registerClient(parsed.data);

      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), parsed.data.email, parsed.data.password);

      try {
        await completeFirebaseLogin(credential.user);
      } catch (error) {
        try {
          await getFirebaseAuth().signOut();
        } catch {
          // best-effort
        }
        throw error;
      }

      router.push('/admin');
      router.refresh();
    } catch (error) {
      const appError = error instanceof AuthAppError ? error : mapRegistrationError(error);
      setFormError(appError.message);
      setPassword('');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} method="post" noValidate>
      {formError ? (
        <p role="alert" style={{ color: '#7a1f1f' }}>
          {formError}
        </p>
      ) : null}

      <div>
        <label htmlFor="companyName">Company name</label>
        <br />
        <input
          id="companyName"
          name="companyName"
          type="text"
          autoComplete="organization"
          required
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          aria-invalid={fieldErrors.companyName ? true : undefined}
          aria-describedby={fieldErrors.companyName ? 'companyName-error' : undefined}
          disabled={isSubmitting}
        />
        {fieldErrors.companyName ? (
          <p id="companyName-error" role="alert">
            {fieldErrors.companyName}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="clientType">Organization type</label>
        <br />
        <select
          id="clientType"
          name="clientType"
          required
          value={clientType}
          onChange={(event) => setClientType(event.target.value as ClientType)}
          disabled={isSubmitting}
        >
          {CLIENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CLIENT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {fieldErrors.clientType ? (
          <p id="clientType-error" role="alert">
            {fieldErrors.clientType}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="contactName">Your name</label>
        <br />
        <input
          id="contactName"
          name="contactName"
          type="text"
          autoComplete="name"
          required
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          aria-invalid={fieldErrors.contactName ? true : undefined}
          aria-describedby={fieldErrors.contactName ? 'contactName-error' : undefined}
          disabled={isSubmitting}
        />
        {fieldErrors.contactName ? (
          <p id="contactName-error" role="alert">
            {fieldErrors.contactName}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <br />
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          disabled={isSubmitting}
        />
        {fieldErrors.email ? (
          <p id="email-error" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          disabled={isSubmitting}
        />
        {fieldErrors.password ? (
          <p id="password-error" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating your account…' : 'Register'}
      </button>
    </form>
  );
}
