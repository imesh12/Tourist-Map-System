'use client';

import { useState, type FormEvent } from 'react';

/**
 * The Create Map drawer — checkpoint 1B.6 §6. Same drawer-overlay visual
 * pattern `CategoryFormDrawer`/`PoiFormDrawer`/`MenuItemFormDrawer` already
 * establish, but deliberately much smaller: a new map's only
 * client-editable field at creation time is its name (`mapCreateInputSchema`
 * — packages/validation/src/map-create.ts — has no other field at all).
 * Every other Map Settings value (provider, style, area, branding) is
 * server-defaulted and can be changed afterward from the new map's own
 * Map Settings page, exactly like the first map provisioning already
 * creates is editable from day one.
 */

export interface CreateMapFormValues {
  readonly name: string;
}

interface CreateMapDrawerProps {
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: CreateMapFormValues) => void;
}

export function CreateMapDrawer({ isSaving, formError, fieldErrors, onCancel, onSubmit }: CreateMapDrawerProps) {
  const [name, setName] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ name });
  }

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="createMapDrawerTitle" onClick={(event) => event.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="createMapDrawerTitle" className="drawer-title">
              Create map
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
              <label className="field-label" htmlFor="newMapName">
                Map name *
              </label>
              <input
                id="newMapName"
                name="newMapName"
                type="text"
                required
                autoFocus
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
              />
              <span className="field-hint">You can rename this map later from its own Map Settings.</span>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || !name.trim()}>
              {isSaving ? 'Creating…' : 'Create map'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
