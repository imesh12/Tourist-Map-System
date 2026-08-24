'use client';

import { useEffect } from 'react';

/**
 * Deliberate delete confirmation — checkpoint 1B.3 §9. A real modal built
 * from the project's own visual system (`.modal-overlay`/`.modal`,
 * app/globals.css), never the browser's native `confirm()` — matching the
 * checkpoint's explicit instruction and the same accessible-dialog pattern
 * `CategoryFormDrawer` already establishes (Escape closes, overlay click
 * closes, inner click does not bubble).
 */
interface DeletePoiDialogProps {
  readonly poiName: string;
  readonly isDeleting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DeletePoiDialog({ poiName, isDeleting, onCancel, onConfirm }: DeletePoiDialogProps) {
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
        aria-labelledby="deletePoiDialogTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="deletePoiDialogTitle" className="modal-title">
          Delete POI?
        </h2>
        <p className="modal-body">
          &ldquo;{poiName}&rdquo; will be removed from this map. This cannot be undone.
        </p>
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
