'use client';

/**
 * A reusable "visual color picker + editable HEX text field" control —
 * checkpoint 1B.8 §4. Replaces the hex-only text inputs Branding/Theme used
 * through checkpoint 1B.7.
 *
 * Both controls share the exact same `value`/`onChange` — there is no
 * separate "picker state" vs "text state" to keep in sync; a native
 * `<input type="color">` always reports a normalized, fully-valid
 * `#rrggbb` value the instant it changes, so wiring both inputs to one
 * `onChange` already satisfies "visual picker changes → HEX field changes →
 * live preview updates immediately" for free — nothing here needs to
 * reconstruct that sync by hand.
 *
 * The text field, on the other hand, is never gated on validity — every
 * keystroke is passed straight through via `onChange`, so a partial value
 * like `#1a` stays fully editable (never reset, never rejected) as the
 * checkpoint requires. It is the CALLER's responsibility (not this
 * component's) to only fold a value into whatever feeds a live map preview
 * once it actually matches `#RRGGBB` — see `map-settings-form.tsx`'s
 * `toValidHexOrUndefined()` — and Save-time validation is unchanged:
 * `mapBrandingSchema`/`mapThemeColorsSchema` already reject anything that
 * isn't a full `#RRGGBB` value, exactly as before this component existed.
 *
 * The native color input can't itself display an invalid/incomplete text
 * value (the DOM control only ever accepts a full 6-digit hex) — while the
 * text field holds something incomplete, the picker swatch falls back to
 * `FALLBACK_PICKER_COLOR` rather than erroring or going blank, and reverts
 * to reflecting the real value again the moment it becomes valid.
 *
 * Accessible name collision, deliberately avoided: the text input keeps the
 * field's exact label (via `htmlFor`, unchanged from before this component
 * existed) so every pre-existing `getByLabel('Primary color', { exact: true })`-
 * style assertion keeps resolving to the text field specifically. The color
 * input gets its OWN distinct accessible name (`"${label} picker"`) — since
 * Playwright's `getByLabel` substring-matches by default, any assertion
 * against the field's bare label must pass `{ exact: true }` once this
 * second, differently-labeled control exists alongside it (the same
 * disambiguation checkpoint 1B.7 already applied to "Labels" vs. "Transit
 * labels").
 */

const FALLBACK_PICKER_COLOR = '#000000';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface ColorFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
}

export function ColorField({ id, label, value, onChange, disabled, hint }: ColorFieldProps) {
  const pickerValue = HEX_COLOR_PATTERN.test(value) ? value : FALLBACK_PICKER_COLOR;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="color-field">
        <input
          type="color"
          aria-label={`${label} picker`}
          className="color-picker-input"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        <input
          id={id}
          name={id}
          type="text"
          className="input"
          placeholder="#RRGGBB"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}
