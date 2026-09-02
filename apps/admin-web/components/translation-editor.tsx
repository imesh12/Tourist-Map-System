'use client';

import { listPublicContentLanguages, type LocalizedText, type PublicContentLanguage } from 'shared-types';

/**
 * The shared, reusable Admin "Translations" editor — checkpoint 1B.17B
 * §4-§9/§26. One component, reused by `CategoryFormDrawer`/`PoiFormDrawer`/
 * `PageFormDrawer`/`MenuItemFormDrawer`, rather than four independently
 * hand-rolled translation UIs (§26: "avoid giant components — extract a
 * small reusable translation editor where sensible").
 *
 * Renders ONLY the languages the map has actually enabled
 * (`enabledLanguages`, sourced from the map's own Public Languages settings —
 * 1B.17A) — never every registry language, and never an unsupported one
 * (§9: "clearly show which languages are enabled for the map... must not
 * show unsupported languages"). The map's `defaultLanguage` is visually
 * marked among them, never excluded — a translation may still be entered for
 * the default language itself, exactly like every other enabled language.
 *
 * This component NEVER renders the entity's own legacy scalar field (Name/
 * Title/Label/Description) — that field stays on each drawer's own markup,
 * untouched and primary (§4/§5/§6/§9: "the existing single-value field
 * remains the default/fallback content and is NOT removed or hidden"). This
 * component is purely the OPTIONAL "Translations" section beneath it.
 *
 * State shape (`TranslationsFieldsState`) is a plain `{ [fieldKey]: LocalizedText }`
 * object — structurally identical to `CategoryTranslations`/`PoiTranslations`/
 * `PageTranslations`/`MenuItemTranslations` (each just a small object of
 * optional `LocalizedText` fields, shared-types), so a caller's local state
 * can be passed straight through to `*CreateInputSchema`/`*UpdateInputSchema`
 * on submit with no reshaping.
 *
 * Blank handling (§9): typing into a language's field and then clearing it
 * back to blank/whitespace-only REMOVES that language's key from the field's
 * `LocalizedText` object (`handleFieldChange` below) — never stores `''`. A
 * field whose `LocalizedText` object becomes fully empty is itself removed
 * from the returned state, and the whole `translations` object collapses to
 * `{}` once every field is empty — the caller's submit logic (see e.g.
 * `categories-manager.tsx`) is what decides whether `{}` is sent as-is
 * (update — "delete the stored field" semantics) or omitted (create).
 */

export interface TranslationFieldSpec {
  /** Matches the key on the entity's `*Translations` interface, e.g. `'name'`/`'description'`/`'title'`/`'content'`/`'label'`. */
  readonly key: string;
  readonly label: string;
  readonly maxLength: number;
  readonly multiline?: boolean;
}

/** `{ [fieldKey]: LocalizedText }` — see this file's own header doc comment. */
export type TranslationsFieldsState = Record<string, LocalizedText>;

export interface TranslationEditorProps {
  readonly fields: readonly TranslationFieldSpec[];
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
  readonly value: TranslationsFieldsState;
  readonly onChange: (next: TranslationsFieldsState) => void;
  readonly disabled?: boolean;
  /** Used to build stable, unique `id`/`data-testid` attributes per field/language — e.g. `'category'`, `'poi'`, `'page'`, `'menu-item'`. */
  readonly idPrefix: string;
}

/** Strips an emptied `LocalizedText` field, and an emptied whole `translations` object, from the returned state — never leaves a dangling `{}` nested value where the field key itself could simply be absent. */
function setLanguageValue(
  current: TranslationsFieldsState,
  fieldKey: string,
  lang: PublicContentLanguage,
  rawText: string,
): TranslationsFieldsState {
  const trimmed = rawText.trim();
  const nextFieldValue: LocalizedText = { ...current[fieldKey] };
  if (trimmed === '') {
    delete nextFieldValue[lang];
  } else {
    nextFieldValue[lang] = rawText;
  }

  const next: TranslationsFieldsState = { ...current };
  if (Object.keys(nextFieldValue).length > 0) {
    next[fieldKey] = nextFieldValue;
  } else {
    delete next[fieldKey];
  }
  return next;
}

export function TranslationEditor({ fields, enabledLanguages, defaultLanguage, value, onChange, disabled, idPrefix }: TranslationEditorProps) {
  if (enabledLanguages.length === 0) {
    // Should not normally happen — every map always has at least one
    // enabled language (1B.17A) — but fails safe rather than rendering an
    // empty, confusing section.
    return null;
  }

  const languageEntries = listPublicContentLanguages().filter((entry) => enabledLanguages.includes(entry.code));

  return (
    <div className="card" data-testid={`${idPrefix}-translations-section`} style={{ boxShadow: 'none', border: '1px solid var(--color-border)' }}>
      <div className="card-title">Translations</div>
      <p className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>
        Optional. Add translated text for the languages this map supports — leave any language blank to fall back
        automatically to the default content above. This does not change the primary field.
      </p>

      {fields.map((field) => (
        <div key={field.key} className="field">
          <span className="field-label" id={`${idPrefix}-${field.key}-translations-label`}>
            {field.label} translations
          </span>
          <div role="group" aria-labelledby={`${idPrefix}-${field.key}-translations-label`}>
            {languageEntries.map((entry) => {
              const isDefault = entry.code === defaultLanguage;
              const fieldId = `${idPrefix}-translation-${field.key}-${entry.code}`;
              const text = value[field.key]?.[entry.code] ?? '';

              return (
                <div key={entry.code} className="field" style={{ marginBottom: 'var(--space-3)' }}>
                  <label className="field-label" htmlFor={fieldId} style={{ fontWeight: 'normal' }}>
                    {entry.englishLabel} ({entry.nativeLabel}){isDefault ? ' — Map default' : ''}
                  </label>
                  {field.multiline ? (
                    <textarea
                      id={fieldId}
                      className="textarea"
                      rows={4}
                      maxLength={field.maxLength}
                      value={text}
                      onChange={(event) => onChange(setLanguageValue(value, field.key, entry.code, event.target.value))}
                      disabled={disabled}
                      data-testid={`${idPrefix}-translation-${field.key}-${entry.code}-input`}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      className="input"
                      type="text"
                      maxLength={field.maxLength}
                      value={text}
                      onChange={(event) => onChange(setLanguageValue(value, field.key, entry.code, event.target.value))}
                      disabled={disabled}
                      data-testid={`${idPrefix}-translation-${field.key}-${entry.code}-input`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
