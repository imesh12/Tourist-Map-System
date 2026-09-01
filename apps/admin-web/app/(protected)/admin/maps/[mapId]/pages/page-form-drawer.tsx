'use client';

import { useEffect, useState, type FormEvent } from 'react';

/**
 * The shared Create/Edit Page drawer — checkpoint 1B.11 §7. Mirrors
 * `CategoryFormDrawer`'s exact "one form component for both modes" shape:
 * only the initial values, submit label, and `onSubmit` payload shape
 * differ, both handled by the caller (`pages-manager.tsx`).
 *
 * Content is a plain multiline `<textarea>` — no rich text editor, no HTML
 * (§4/§7 of the checkpoint: "Content should support multiline text. No rich
 * text editor in 1B.11.").
 */

export interface PageFormValues {
  readonly title: string;
  readonly content: string;
  readonly status: 'ENABLED' | 'DISABLED';
}

interface PageFormDrawerProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: PageFormValues;
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: PageFormValues) => void;
}

export function PageFormDrawer({ mode, initialValues, isSaving, formError, fieldErrors, onCancel, onSubmit }: PageFormDrawerProps) {
  const [title, setTitle] = useState(initialValues.title);
  const [content, setContent] = useState(initialValues.content);
  const [status, setStatus] = useState<'ENABLED' | 'DISABLED'>(initialValues.status);

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
    onSubmit({ title, content, status });
  }

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="pageDrawerTitle" onClick={(event) => event.stopPropagation()}>
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="pageDrawerTitle" className="drawer-title">
              {mode === 'create' ? 'Create Page' : 'Edit Page'}
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
              <label className="field-label" htmlFor="pageTitle">
                Title
              </label>
              <input
                id="pageTitle"
                className="input"
                type="text"
                required
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="pageContent">
                Content
              </label>
              <textarea
                id="pageContent"
                className="textarea"
                rows={8}
                required
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={isSaving}
              />
              <span className="field-hint">Plain text only. Line breaks are preserved when this page is shown to tourists.</span>
            </div>

            <div className="field">
              <span className="field-label" id="pageStatusLabel">
                Status
              </span>
              <div className="segmented" role="group" aria-labelledby="pageStatusLabel">
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
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
