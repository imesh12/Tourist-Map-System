'use client';

import { useEffect, useRef } from 'react';
import type { PublishedPage } from 'shared-types';

/**
 * Checkpoint 1B.11 §12 — the selected-Page information overlay. Mirrors
 * `PoiDetailCard`'s exact shape: ONE component for both the desktop
 * "floating card" and the mobile "bottom sheet" (`app/globals.css`'s
 * `.page-overlay` rule switches presentation purely via a `@media`
 * breakpoint, the same "CSS adapts, markup doesn't fork" convention every
 * other public-map overlay in this app already uses).
 *
 * Renders ONLY `page.title`/`page.content` — the entire published Page
 * representation (`PublishedPage`, packages/shared-types/src/publication.ts)
 * has no other fields to begin with, so there is no possible code path here
 * that could leak an internal id, draft status, or admin metadata; the
 * `pageId` prop exists purely for `data-testid`/`key` plumbing, never
 * rendered as visible text (§12: "must not expose internal IDs in visible
 * UI").
 *
 * §4/§12 — content safety: `page.content` is rendered as PLAIN TEXT inside a
 * `<p>` with CSS `white-space: pre-wrap` (`.page-overlay-content` in
 * `app/globals.css`) to preserve the author's line breaks. This component
 * NEVER uses `dangerouslySetInnerHTML` — there is no rich text/HTML to
 * render in this checkpoint, and there must never be a code path that could
 * inject one later without a deliberate, separately-reviewed change.
 *
 * Accessibility: a real `role="dialog"` with `aria-labelledby` pointing at
 * the Page title heading (a genuine `<h2>`, not a styled `<div>`), a real
 * `<button>` close control with an accessible name, and focus moves to the
 * close button on open — the exact same pattern `PoiDetailCard` already
 * establishes.
 */
export interface PageOverlayProps {
  readonly page: PublishedPage;
  readonly onClose: () => void;
}

export function PageOverlay({ page, onClose }: PageOverlayProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingId = `page-overlay-title-${page.pageId}`;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [page.pageId]);

  return (
    <div data-testid="page-overlay" className="page-overlay" role="dialog" aria-modal="false" aria-labelledby={headingId}>
      <button
        ref={closeButtonRef}
        type="button"
        data-testid="page-overlay-close"
        className="page-overlay-close"
        aria-label="Close page"
        onClick={onClose}
      >
        ×
      </button>
      <h2 id={headingId} data-testid="page-overlay-title" className="page-overlay-title">
        {page.title}
      </h2>
      <p data-testid="page-overlay-content" className="page-overlay-content">
        {page.content}
      </p>
    </div>
  );
}
