'use client';

import { useEffect } from 'react';

/**
 * Deliberate delete confirmation — checkpoint 1B.5 §13. Mirrors
 * `DeletePoiDialog`'s exact accessible-dialog pattern (Escape closes,
 * overlay click closes, inner click does not bubble) — a real modal built
 * from the project's own visual system, never the browser's native
 * `confirm()`.
 *
 * The body copy is explicit that removing a menu item never deletes the
 * category/POIs it references (§13's own example: `Remove "Gourmet" from
 * public menu? This will not delete the Restaurant category or its POIs.`)
 * — reinforcing at the UI layer what `DELETE /api/map/menu-items/{menuItemId}`
 * already guarantees structurally (that route's Firestore access is scoped
 * entirely to the `menuItems` subcollection, so it cannot reach
 * `categories`/`pois` even in principle).
 */
interface DeleteMenuItemDialogProps {
  readonly label: string;
  readonly type: 'CATEGORY' | 'FEATURE';
  readonly linkedName?: string;
  readonly isDeleting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DeleteMenuItemDialog({ label, type, linkedName, isDeleting, onCancel, onConfirm }: DeleteMenuItemDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const bodyText =
    type === 'CATEGORY'
      ? `This will not delete ${linkedName ? `the ${linkedName} category` : 'the linked category'} or its POIs.`
      : 'This only removes it from the menu — nothing else is affected.';

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deleteMenuItemDialogTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="deleteMenuItemDialogTitle" className="modal-title">
          Remove &ldquo;{label}&rdquo; from public menu?
        </h2>
        <p className="modal-body">{bodyText}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
