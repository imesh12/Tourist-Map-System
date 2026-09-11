'use client';

import { useEffect } from 'react';

/**
 * Deliberate delete confirmation — LIVE CAMERAS FOUNDATION checkpoint,
 * mirrors `DeletePageDialog`'s exact accessible-dialog pattern (Escape
 * closes, overlay click closes, inner click does not bubble). A real modal
 * built from the project's own visual system, never the browser's native
 * `confirm()`.
 *
 * Unlike a Page, nothing else in this codebase references a `cameraId` yet
 * (no menu item, no cross-collection link) — so there is no "in use"
 * rejection case to surface here.
 */
interface DeleteCameraDialogProps {
  readonly cameraName: string;
  readonly isDeleting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DeleteCameraDialog({ cameraName, isDeleting, onCancel, onConfirm }: DeleteCameraDialogProps) {
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
        aria-labelledby="deleteCameraDialogTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="deleteCameraDialogTitle" className="modal-title">
          Delete live camera?
        </h2>
        <p className="modal-body">
          &ldquo;{cameraName}&rdquo; will be removed from this map. This cannot be undone.
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
