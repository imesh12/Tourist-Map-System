import { describe, expect, it } from 'vitest';
import { myLocationErrorMessage } from './my-location';

describe('myLocationErrorMessage — checkpoint 1B.10 §10', () => {
  it('gives a distinct, friendly sentence for each failure reason', () => {
    const unsupported = myLocationErrorMessage('unsupported');
    const denied = myLocationErrorMessage('denied');
    const unavailable = myLocationErrorMessage('unavailable');

    expect(unsupported).toBe("Location isn't supported in this browser.");
    expect(denied).toBe('Location access was denied.');
    expect(unavailable).toBe("We couldn't get your location right now.");

    // No two failure reasons collapse to an identical sentence.
    expect(new Set([unsupported, denied, unavailable]).size).toBe(3);
  });

  it('never mentions coordinates, codes, or technical detail', () => {
    for (const reason of ['unsupported', 'denied', 'unavailable'] as const) {
      const message = myLocationErrorMessage(reason);
      expect(message).not.toMatch(/\d/);
    }
  });
});
