import { describe, expect, it } from 'vitest';
import {
  createAutoTranslationMetadata,
  fingerprintSourceText,
  markTranslationOverride,
  markTranslationStale,
} from './translation';

describe('translation metadata foundation', () => {
  it('fingerprints deterministically and changes when source changes', () => {
    expect(fingerprintSourceText('hello')).toBe(fingerprintSourceText('hello'));
    expect(fingerprintSourceText('hello')).not.toBe(fingerprintSourceText('hello!'));
  });

  it('marks AUTO translations stale only after a source change', () => {
    const metadata = createAutoTranslationMetadata('hello', 'FAKE_TRANSLATION');
    expect(markTranslationStale(metadata, 'hello').status).toBe('AUTO');
    expect(markTranslationStale(metadata, 'changed').status).toBe('STALE');
  });

  it('protects OVERRIDE translations from stale transitions', () => {
    const metadata = markTranslationOverride(createAutoTranslationMetadata('hello', 'FAKE_TRANSLATION'), 'hello');
    expect(markTranslationStale(metadata, 'changed').status).toBe('OVERRIDE');
  });
});
