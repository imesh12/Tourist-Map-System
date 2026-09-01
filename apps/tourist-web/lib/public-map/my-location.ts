/**
 * Checkpoint 1B.10 §10 — the released MY_LOCATION feature's browser
 * Geolocation glue. Deliberately thin: `requestMyLocation()` is a one-shot
 * wrapper around `navigator.geolocation.getCurrentPosition` (never
 * `watchPosition` — this is "show my current location", not live tracking,
 * per §10's own "Do NOT add navigation routing" boundary), and
 * `myLocationErrorMessage()` is a small PURE function mapping every failure
 * mode to one deterministic, tourist-friendly sentence — kept separate so it
 * stays unit-testable without a real (or even mocked) `navigator.geolocation`
 * object.
 *
 * Privacy (§10, verbatim requirements): this module never sends a location
 * anywhere over the network, never writes it to Firestore/localStorage/
 * sessionStorage, never logs a coordinate (no `console.*` call anywhere in
 * this file), and requires no account/login — a resolved position is handed
 * straight back to the caller's `onSuccess` callback and lives only in
 * `tourist-map.tsx`'s own component state for the remainder of that page
 * view.
 */

export type MyLocationFailureReason = 'unsupported' | 'denied' | 'unavailable';

export interface MyLocationPosition {
  readonly latitude: number;
  readonly longitude: number;
}

export interface RequestMyLocationCallbacks {
  readonly onSuccess: (position: MyLocationPosition) => void;
  readonly onError: (reason: MyLocationFailureReason) => void;
}

/** A generous but bounded wait — a tourist tapping this control expects a prompt answer, not an indefinite spinner. */
const GEOLOCATION_TIMEOUT_MS = 10_000;

export function requestMyLocation({ onSuccess, onError }: RequestMyLocationCallbacks): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError('unsupported');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      onSuccess({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    },
    (error) => {
      // `PERMISSION_DENIED = 1`, `POSITION_UNAVAILABLE = 2`, `TIMEOUT = 3`
      // (the standard `GeolocationPositionError` codes) — both non-denial
      // failure modes collapse to the same friendly "unavailable" message
      // (`myLocationErrorMessage()`); a tourist does not need to distinguish
      // "the device couldn't get a fix" from "it took too long."
      onError(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
    },
    { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 },
  );
}

export function myLocationErrorMessage(reason: MyLocationFailureReason): string {
  switch (reason) {
    case 'unsupported':
      return "Location isn't supported in this browser.";
    case 'denied':
      return 'Location access was denied.';
    case 'unavailable':
      return "We couldn't get your location right now.";
  }
}
