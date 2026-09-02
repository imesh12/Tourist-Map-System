'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CategoryIcon, PublicContentLanguage } from 'shared-types';
import type { CategoryParsed, PageParsed } from 'validation';
import { getPublicFeatureRegistryEntry, type PublicFeatureRegistryEntry } from 'shared-types';
import { TranslationEditor, type TranslationsFieldsState } from '@/components/translation-editor';
import { DEFAULT_PAGE_MENU_ICON } from '@/lib/tenant/menu-projection';
import { ALL_CATEGORY_ICONS, categoryIconOptionLabel, CATEGORY_ICON_META } from '../categories/category-icons';

/** Mirrors `menuItemLabelSchema`'s own `LABEL_MAX_LENGTH` (packages/validation/src/menu-item.ts) — checkpoint 1B.17B §9: "preserve existing max lengths." */
const MENU_ITEM_LABEL_MAX_LENGTH = 60;

/**
 * The shared Add/Edit Menu Item drawer — checkpoint 1B.5 §9/§10. One form
 * component for both modes, the same "caller decides initial values/submit
 * payload, this component only owns field markup/local state" split
 * `CategoryFormDrawer`/`PoiFormDrawer` already established.
 *
 * CREATE mode shows a Type segmented control (Category / Feature) — §10's
 * "Step 1: Type" — which swaps the fields shown below it, exactly the way
 * `PoiFormDrawer`'s Status segmented control already toggles local state
 * without needing a multi-screen wizard. EDIT mode never shows the Type
 * control: `type`/`categoryId`/`featureKey` are permanently immutable after
 * creation (see `menuItemUpdateInputSchema`'s doc comment,
 * packages/validation/src/menu-item.ts) — the linked category/feature is
 * rendered as static, read-only text instead of a `<select>`.
 */

export interface MenuItemFormValues {
  readonly type: 'CATEGORY' | 'FEATURE' | 'PAGE';
  /** Meaningful only when `type === 'CATEGORY'`. */
  readonly categoryId: string;
  /** Meaningful only when `type === 'FEATURE'`. */
  readonly featureKey: string;
  /** Meaningful only when `type === 'PAGE'`. */
  readonly pageId: string;
  readonly label: string;
  /** `''` = inherited/default icon; otherwise a controlled `CategoryIcon` override. Only ever sent when `type === 'CATEGORY'` or `type === 'PAGE'`. */
  readonly icon: string;
  readonly status: 'ENABLED' | 'DISABLED';
  /** checkpoint 1B.17B — `{ label?: LocalizedText }`, mirroring `MenuItemTranslations`. Never auto-populated from the linked category/page/feature — only the legacy `label` field's own auto-fill-until-touched behavior exists (see `handleCategoryChange`/`handleFeatureChange`/`handlePageChange` below), and this must not be extended to translations (§9). */
  readonly translations: TranslationsFieldsState;
}

interface MenuItemFormDrawerProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: MenuItemFormValues;
  /** checkpoint 1B.17B §9 — see `CategoryFormDrawer`'s identical prop doc comment. */
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
  /** Every tenant category — used to resolve the linked category's name/icon for display (both create-mode option labels and edit-mode read-only display). */
  readonly categories: readonly CategoryParsed[];
  /** Every tenant page — used to resolve the linked page's title for display, mirroring `categories` above. */
  readonly pages: readonly PageParsed[];
  /** Enabled categories not already linked to any existing menu item — what the CREATE-mode Category `<select>` actually offers (§11/§12). Irrelevant in edit mode. */
  readonly selectableCategories: readonly CategoryParsed[];
  /** Released features not already linked to any existing menu item — what the CREATE-mode Feature `<select>` offers (§7/§12). Irrelevant in edit mode. */
  readonly selectableFeatures: readonly PublicFeatureRegistryEntry[];
  /** Enabled pages not already linked to any existing menu item — what the CREATE-mode Page `<select>` offers, mirroring `selectableCategories`. Irrelevant in edit mode. */
  readonly selectablePages: readonly PageParsed[];
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: MenuItemFormValues) => void;
}

export function MenuItemFormDrawer({
  mode,
  initialValues,
  categories,
  pages,
  selectableCategories,
  selectableFeatures,
  selectablePages,
  enabledLanguages,
  defaultLanguage,
  isSaving,
  formError,
  fieldErrors,
  onCancel,
  onSubmit,
}: MenuItemFormDrawerProps) {
  const [type, setType] = useState<'CATEGORY' | 'FEATURE' | 'PAGE'>(initialValues.type);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId || selectableCategories[0]?.categoryId || '');
  const [featureKey, setFeatureKey] = useState(initialValues.featureKey || selectableFeatures[0]?.key || '');
  const [pageId, setPageId] = useState(initialValues.pageId || selectablePages[0]?.pageId || '');
  const [label, setLabel] = useState(initialValues.label);
  const [labelTouched, setLabelTouched] = useState(mode === 'edit');
  const [icon, setIcon] = useState(initialValues.icon);
  const [status, setStatus] = useState<'ENABLED' | 'DISABLED'>(initialValues.status);
  const [translations, setTranslations] = useState<TranslationsFieldsState>(initialValues.translations);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const linkedCategory = categories.find((category) => category.categoryId === (mode === 'edit' ? initialValues.categoryId : categoryId));
  // Resolved from the full registry by key, not `selectableFeatures` — that
  // list is filtered to features NOT already linked to any menu item (see
  // its own prop doc comment above), so in edit mode the item's own
  // currently-linked feature is normally excluded from it and a
  // `selectableFeatures.find(...)` lookup would spuriously come back
  // `undefined`. `getPublicFeatureRegistryEntry` (the same lookup
  // `menu-builder-manager.tsx` already uses to render each row's feature
  // label) has no such filtering, so it resolves correctly in both modes —
  // Repair Round 1 (checkpoint 1B.6).
  const linkedFeature = getPublicFeatureRegistryEntry(mode === 'edit' ? initialValues.featureKey : featureKey);
  const linkedPage = pages.find((page) => page.pageId === (mode === 'edit' ? initialValues.pageId : pageId));

  function handleCategoryChange(nextCategoryId: string): void {
    setCategoryId(nextCategoryId);
    if (!labelTouched) {
      const category = selectableCategories.find((entry) => entry.categoryId === nextCategoryId);
      if (category) setLabel(category.name);
    }
  }

  function handleFeatureChange(nextFeatureKey: string): void {
    setFeatureKey(nextFeatureKey);
    if (!labelTouched) {
      const feature = selectableFeatures.find((entry) => entry.key === nextFeatureKey);
      if (feature) setLabel(feature.label);
    }
  }

  function handlePageChange(nextPageId: string): void {
    setPageId(nextPageId);
    if (!labelTouched) {
      const page = selectablePages.find((entry) => entry.pageId === nextPageId);
      if (page) setLabel(page.title);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    onSubmit({
      type,
      categoryId,
      featureKey,
      pageId,
      label,
      icon: type === 'CATEGORY' || type === 'PAGE' ? icon : '',
      status,
      translations,
    });
  }

  const noCategoriesAvailable = type === 'CATEGORY' && mode === 'create' && selectableCategories.length === 0;
  const noFeaturesAvailable = type === 'FEATURE' && mode === 'create' && selectableFeatures.length === 0;
  const noPagesAvailable = type === 'PAGE' && mode === 'create' && selectablePages.length === 0;
  const canSubmit =
    mode === 'edit' ||
    (type === 'CATEGORY' ? !noCategoriesAvailable : type === 'PAGE' ? !noPagesAvailable : !noFeaturesAvailable);

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menuItemDrawerTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="menuItemDrawerTitle" className="drawer-title">
              {mode === 'create' ? 'Add Menu Item' : 'Edit Menu Item'}
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

            {mode === 'create' ? (
              <div className="field">
                <span className="field-label" id="menuItemTypeLabel">
                  Type
                </span>
                <div className="segmented" role="group" aria-labelledby="menuItemTypeLabel">
                  <button
                    type="button"
                    className="segmented-option"
                    aria-pressed={type === 'CATEGORY'}
                    onClick={() => setType('CATEGORY')}
                    disabled={isSaving}
                  >
                    Category
                  </button>
                  <button
                    type="button"
                    className="segmented-option"
                    aria-pressed={type === 'PAGE'}
                    onClick={() => setType('PAGE')}
                    disabled={isSaving}
                  >
                    Page
                  </button>
                  <button
                    type="button"
                    className="segmented-option"
                    aria-pressed={type === 'FEATURE'}
                    onClick={() => setType('FEATURE')}
                    disabled={isSaving}
                  >
                    Feature
                  </button>
                </div>
              </div>
            ) : (
              <p className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>
                {type === 'CATEGORY'
                  ? 'Linked to a category — the link, and which category it points to, cannot be changed here. Remove this item and add a new one to link a different category.'
                  : type === 'PAGE'
                    ? 'Linked to a page — the link, and which page it points to, cannot be changed here. Remove this item and add a new one to link a different page.'
                    : 'Linked to a feature — the link cannot be changed here. Remove this item and add a new one to link a different feature.'}
              </p>
            )}

            {type === 'CATEGORY' ? (
              mode === 'create' && noCategoriesAvailable ? (
                <div className="empty-state">
                  <p>No eligible categories — every enabled category is already in the menu, or you have none yet.</p>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label className="field-label" htmlFor="menuItemCategory">
                      Category
                    </label>
                    {mode === 'create' ? (
                      <select
                        id="menuItemCategory"
                        className="select"
                        required
                        value={categoryId}
                        onChange={(event) => handleCategoryChange(event.target.value)}
                        disabled={isSaving}
                      >
                        {selectableCategories.map((category) => {
                          const iconMeta = CATEGORY_ICON_META[category.icon];
                          return (
                            <option key={category.categoryId} value={category.categoryId}>
                              {iconMeta.emoji} {category.name}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <p id="menuItemCategory" className="field-static-value">
                        {linkedCategory ? (
                          <>
                            <span aria-hidden="true">{CATEGORY_ICON_META[linkedCategory.icon].emoji}</span> {linkedCategory.name}
                          </>
                        ) : (
                          'Unknown category'
                        )}
                      </p>
                    )}
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="menuItemLabel">
                      Public label
                    </label>
                    <input
                      id="menuItemLabel"
                      className="input"
                      type="text"
                      required
                      autoFocus
                      maxLength={MENU_ITEM_LABEL_MAX_LENGTH}
                      value={label}
                      onChange={(event) => {
                        setLabelTouched(true);
                        setLabel(event.target.value);
                      }}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="menuItemIcon">
                      Icon
                    </label>
                    <select
                      id="menuItemIcon"
                      className="select"
                      value={icon}
                      onChange={(event) => setIcon(event.target.value)}
                      disabled={isSaving}
                    >
                      <option value="">
                        {linkedCategory ? `Use category icon (${CATEGORY_ICON_META[linkedCategory.icon].label})` : 'Use category icon'}
                      </option>
                      {ALL_CATEGORY_ICONS.map((value: CategoryIcon) => (
                        <option key={value} value={value}>
                          {categoryIconOptionLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )
            ) : type === 'PAGE' ? (
              mode === 'create' && noPagesAvailable ? (
                <div className="empty-state">
                  <p>No eligible pages — every enabled page is already in the menu, or you have none yet.</p>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label className="field-label" htmlFor="menuItemPage">
                      Page
                    </label>
                    {mode === 'create' ? (
                      <select
                        id="menuItemPage"
                        className="select"
                        required
                        value={pageId}
                        onChange={(event) => handlePageChange(event.target.value)}
                        disabled={isSaving}
                      >
                        {selectablePages.map((page) => (
                          <option key={page.pageId} value={page.pageId}>
                            {page.title}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p id="menuItemPage" className="field-static-value">
                        {linkedPage ? linkedPage.title : 'Unknown page'}
                      </p>
                    )}
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="menuItemLabel">
                      Public label
                    </label>
                    <input
                      id="menuItemLabel"
                      className="input"
                      type="text"
                      required
                      autoFocus
                      maxLength={MENU_ITEM_LABEL_MAX_LENGTH}
                      value={label}
                      onChange={(event) => {
                        setLabelTouched(true);
                        setLabel(event.target.value);
                      }}
                      disabled={isSaving}
                    />
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="menuItemIcon">
                      Icon
                    </label>
                    <select
                      id="menuItemIcon"
                      className="select"
                      value={icon}
                      onChange={(event) => setIcon(event.target.value)}
                      disabled={isSaving}
                    >
                      <option value="">Use default icon ({CATEGORY_ICON_META[DEFAULT_PAGE_MENU_ICON].label})</option>
                      {ALL_CATEGORY_ICONS.map((value: CategoryIcon) => (
                        <option key={value} value={value}>
                          {categoryIconOptionLabel(value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )
            ) : mode === 'create' && noFeaturesAvailable ? (
              <div className="empty-state">
                <p>No eligible features — every released feature is already in the menu.</p>
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="menuItemFeature">
                    Feature
                  </label>
                  {mode === 'create' ? (
                    <select
                      id="menuItemFeature"
                      className="select"
                      required
                      value={featureKey}
                      onChange={(event) => handleFeatureChange(event.target.value)}
                      disabled={isSaving}
                    >
                      {selectableFeatures.map((feature) => (
                        <option key={feature.key} value={feature.key}>
                          {feature.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p id="menuItemFeature" className="field-static-value">
                      {linkedFeature ? linkedFeature.label : initialValues.featureKey}
                    </p>
                  )}
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="menuItemLabel">
                    Public label
                  </label>
                  <input
                    id="menuItemLabel"
                    className="input"
                    type="text"
                    required
                    autoFocus
                    value={label}
                    onChange={(event) => {
                      setLabelTouched(true);
                      setLabel(event.target.value);
                    }}
                    disabled={isSaving}
                  />
                </div>
              </>
            )}

            {(mode === 'edit' || (type === 'CATEGORY' && !noCategoriesAvailable) || (type === 'PAGE' && !noPagesAvailable) || (type === 'FEATURE' && !noFeaturesAvailable)) ? (
              <TranslationEditor
                idPrefix="menu-item"
                fields={[{ key: 'label', label: 'Public label', maxLength: MENU_ITEM_LABEL_MAX_LENGTH }]}
                enabledLanguages={enabledLanguages}
                defaultLanguage={defaultLanguage}
                value={translations}
                onChange={setTranslations}
                disabled={isSaving}
              />
            ) : null}

            <div className="field">
              <span className="field-label" id="menuItemStatusLabel">
                Status
              </span>
              <div className="segmented" role="group" aria-labelledby="menuItemStatusLabel">
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={status === 'ENABLED'}
                  onClick={() => setStatus('ENABLED')}
                  disabled={isSaving}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={status === 'DISABLED'}
                  onClick={() => setStatus('DISABLED')}
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
            <button type="submit" className="btn btn-primary" disabled={isSaving || !canSubmit}>
              {isSaving ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
