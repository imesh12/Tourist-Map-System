'use client';

import { listPublicContentLanguages, type PublicContentLanguage } from 'shared-types';

/**
 * Checkpoint 1B.17B §12 — the public tourist language selector. Reads ONLY
 * the `supportedLanguages` this component is handed as a prop, which its
 * only caller (`TouristMap`) always sources from the already-fetched
 * IMMUTABLE publication snapshot (`snapshot.supportedLanguages`) — never the
 * live map draft's `enabledLanguages`. A map with only one supported
 * language renders nothing (§12: no point offering a choice of one).
 *
 * Visible but unobtrusive (§12) — a small `<select>` in the same visual
 * family as the branding header, native language names (`nativeLabel` from
 * the registry, e.g. "日本語"/"Français") so a visitor scanning for their own
 * language recognizes it without needing to already read English, and the
 * current selection is both the control's own `value` (a native
 * `<select>` already conveys "current selection" accessibly) and marked up
 * with `aria-label` for a screen reader.
 */
export interface LanguageSelectorProps {
  readonly supportedLanguages: readonly PublicContentLanguage[];
  readonly currentLanguage: PublicContentLanguage;
  readonly onChange: (language: PublicContentLanguage) => void;
}

export function LanguageSelector({ supportedLanguages, currentLanguage, onChange }: LanguageSelectorProps) {
  if (supportedLanguages.length <= 1) {
    return null;
  }

  const entries = listPublicContentLanguages().filter((entry) => supportedLanguages.includes(entry.code));

  return (
    <select
      data-testid="tourist-language-selector"
      className="tourist-language-selector"
      aria-label="Choose language"
      value={currentLanguage}
      onChange={(event) => onChange(event.target.value as PublicContentLanguage)}
    >
      {entries.map((entry) => (
        <option key={entry.code} value={entry.code}>
          {entry.nativeLabel}
        </option>
      ))}
    </select>
  );
}
