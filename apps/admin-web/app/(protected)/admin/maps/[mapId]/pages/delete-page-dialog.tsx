'use client';

import { useEffect } from 'react';

/**
 * Deliberate delete confirmation — checkpoint 1B.11, mirrors
 * `DeletePoiDialog`'s exact accessible-dialog pattern (Escape closes,
 * overlay click closes, inner click does not bubble). A real modal built
 * from the project's own visual system, never the browser's native
 * `confirm()`.
 *
 * `inUseMessage` is set when a prior delete attempt was rejected by
 * `DELETE /api/maps/{mapId}/pages/{pageId}`'s `map/page-in-use` response
 * (see that route's own doc comment for the deletion policy) — shown
 * in-place rather than closing the dialog, so the admin can immediately
 * understand why and go remove the menu link first.
 */
interface DeletePageDialogProps {
  readonly pageTitle: string;
  readonly isDeleting: boolean;
  readonly inUseMessage?: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DeletePageDialog({ pageTitle, isDeleting, inUseMessage, onCancel, onConfirm }: DeletePageDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deletePageDialogTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="deletePageDialogTitle" className="modal-title">
          Delete page?
        </h2>
        <p className="modal-body">
          &ldquo;{pageTitle}&rdquo; will be removed from this map. This cannot be undone.
        </p>
        {inUseMessage ? (
          <div className="alert alert-danger" role="alert">
            {inUseMessage}
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
