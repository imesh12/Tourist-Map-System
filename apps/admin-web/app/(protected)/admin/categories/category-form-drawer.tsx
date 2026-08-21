'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { CategoryIcon } from 'shared-types';
import { ALL_CATEGORY_ICONS, categoryIconOptionLabel } from './category-icons';

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
}

interface CategoryFormDrawerProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: CategoryFormValues;
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: CategoryFormValues) => void;
}

export function CategoryFormDrawer({ mode, initialValues, isSaving, formError, fieldErrors, onCancel, onSubmit }: CategoryFormDrawerProps) {
  const [name, setName] = useState(initialValues.name);
  const [icon, setIcon] = useState<CategoryIcon>(initialValues.icon);
  const [order, setOrder] = useState(initialValues.order);
  const [enabled, setEnabled] = useState(initialValues.enabled);

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
    onSubmit({ name, icon, order, enabled });
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
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
              />
            </div>

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
