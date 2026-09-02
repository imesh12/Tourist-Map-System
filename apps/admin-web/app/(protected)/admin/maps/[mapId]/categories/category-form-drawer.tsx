'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CategoryIcon, PublicContentLanguage } from 'shared-types';
import { listActivePlatformCategories } from 'shared-types';
import { TranslationEditor, type TranslationsFieldsState } from '@/components/translation-editor';
import { ALL_CATEGORY_ICONS, categoryIconOptionLabel } from './category-icons';

/** Mirrors `categoryNameSchema`'s own `NAME_MAX_LENGTH` (packages/validation/src/category.ts) — checkpoint 1B.17B §9: "preserve existing max lengths." */
const CATEGORY_NAME_MAX_LENGTH = 100;

/**
 * "Custom category" — the `<select>` option value for "no platform link"
 * (an empty string is never a valid `platformCategoryId`, so it's a safe,
 * unambiguous sentinel). Checkpoint 1B.4's controlled-dropdown requirement:
 * the ONLY other options this `<select>` ever offers are
 * `listActivePlatformCategories()` (shared-types) entries — there is no free-
 * text input anywhere that could submit an arbitrary `platformCategoryId`.
 */
const CUSTOM_CATEGORY_OPTION_VALUE = '';

/**
 * The shared Create/Edit Category drawer — checkpoint (Category CMS
 * redesign) §3. One form component for both modes, so create and edit
 * never duplicate field markup/validation-error rendering — only the
 * initial values, submit label, and the `onSubmit` payload shape differ,
 * both handled by the caller (`categories-manager.tsx`).
 *
 * The caller remounts this component (via a `key` prop keyed on the
 * category being edited, or a fixed key for create) whenever the target
 * changes, so this component's own local field state never needs a
 * `useEffect` to resync from changed props — a fresh mount already starts
 * from the right values.
 */

export interface CategoryFormValues {
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly order: string;
  readonly enabled: boolean;
  /** `''` (`CUSTOM_CATEGORY_OPTION_VALUE`) = no platform link (a purely custom category); otherwise one of `listActivePlatformCategories()`'s `platformCategoryId` values — checkpoint 1B.4. */
  readonly platformCategoryId: string;
  /** checkpoint 1B.17B — `{ name?: LocalizedText }`, mirroring `CategoryTranslations`. Always present as a plain object (never `undefined`) so this drawer's local state has one consistent shape; an entity with no translations yet simply starts from `{}`. */
  readonly translations: TranslationsFieldsState;
}

interface CategoryFormDrawerProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: CategoryFormValues;
  /** checkpoint 1B.17B §9 — the map's own `enabledLanguages`/`defaultLanguage` (1B.17A), threaded down from the server page through `categories-manager.tsx`. The Translations section renders ONLY these languages. */
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: CategoryFormValues) => void;
}

export function CategoryFormDrawer({
  mode,
  initialValues,
  enabledLanguages,
  defaultLanguage,
  isSaving,
  formError,
  fieldErrors,
  onCancel,
  onSubmit,
}: CategoryFormDrawerProps) {
  const [name, setName] = useState(initialValues.name);
  const [icon, setIcon] = useState<CategoryIcon>(initialValues.icon);
  const [order, setOrder] = useState(initialValues.order);
  const [enabled, setEnabled] = useState(initialValues.enabled);
  const [platformCategoryId, setPlatformCategoryId] = useState(initialValues.platformCategoryId);
  const [translations, setTranslations] = useState<TranslationsFieldsState>(initialValues.translations);

  const activePlatformCategories = listActivePlatformCategories();
  const linkedCapability = activePlatformCategories.find((entry) => entry.platformCategoryId === platformCategoryId);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    onSubmit({ name, icon, order, enabled, platformCategoryId, translations });
  }

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="categoryDrawerTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="categoryDrawerTitle" className="drawer-title">
              {mode === 'create' ? 'Create Category' : 'Edit Category'}
            </h2>
            <button type="button" className="btn btn-ghost" onClick={onCancel} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="drawer-body">
            {formError ? (
              <div className="alert alert-danger" role="alert">
                {formError}
              </div>
            ) : null}
            {fieldErrors.length > 0 ? (
              <ul className="alert alert-danger" role="alert" style={{ margin: '0 0 var(--space-4)', paddingLeft: '1.2em' }}>
                {fieldErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}

            <div className="field">
              <label className="field-label" htmlFor="categoryName">
                Name
              </label>
              <input
                id="categoryName"
                className="input"
                type="text"
                required
                autoFocus
                maxLength={CATEGORY_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <TranslationEditor
              idPrefix="category"
              fields={[{ key: 'name', label: 'Name', maxLength: CATEGORY_NAME_MAX_LENGTH }]}
              enabledLanguages={enabledLanguages}
              defaultLanguage={defaultLanguage}
              value={translations}
              onChange={setTranslations}
              disabled={isSaving}
            />

            <div className="field">
              <label className="field-label" htmlFor="categoryIcon">
                Icon
              </label>
              <select
                id="categoryIcon"
                className="select"
                value={icon}
                onChange={(event) => setIcon(event.target.value as CategoryIcon)}
                disabled={isSaving}
              >
                {ALL_CATEGORY_ICONS.map((value) => (
                  <option key={value} value={value}>
                    {categoryIconOptionLabel(value)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="categoryPlatformLink">
                Category type
              </label>
              <select
                id="categoryPlatformLink"
                className="select"
                value={platformCategoryId}
                onChange={(event) => setPlatformCategoryId(event.target.value)}
                disabled={isSaving}
              >
                <option value={CUSTOM_CATEGORY_OPTION_VALUE}>Custom category</option>
                {activePlatformCategories.map((entry) => (
                  <option key={entry.platformCategoryId} value={entry.platformCategoryId}>
                    Released category: {entry.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {linkedCapability
                  ? `✓ Client custom content · ✓ ${linkedCapability.allowedSources.includes('GOOGLE_PLACES') ? 'Google Places' : 'No external source'}`
                  : 'Client custom only'}
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="categoryOrder">
                Order
              </label>
              <input
                id="categoryOrder"
                className="input"
                type="text"
                inputMode="numeric"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
                disabled={isSaving}
              />
              <span className="field-hint">Lower numbers appear first.</span>
            </div>

            <div className="field">
              <span className="field-label" id="categoryStatusLabel">
                Status
              </span>
              <div className="segmented" role="group" aria-labelledby="categoryStatusLabel">
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={enabled}
                  onClick={() => setEnabled(true)}
                  disabled={isSaving}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={!enabled}
                  onClick={() => setEnabled(false)}
                  disabled={isSaving}
                >
                  Disabled
                </button>
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
