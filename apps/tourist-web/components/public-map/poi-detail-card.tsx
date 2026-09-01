'use client';

import { useEffect, useRef } from 'react';
import type { PublishedCategory, PublishedPoi } from 'shared-types';
import { categoryIconMeta } from '@/lib/public-map/category-icon-meta';

/**
 * Checkpoint 1B.10 §11 — the selected-POI detail experience. ONE component
 * for both the desktop "floating card" and the mobile "bottom sheet" —
 * `app/globals.css`'s `.poi-detail-card` rule switches presentation purely
 * via a `@media` breakpoint, matching this app's established "CSS adapts,
 * markup doesn't fork" convention (`tourist-map-shell`/`tourist-map-canvas`
 * already work the same way).
 *
 * Renders ONLY fields already present on `PublishedPoi`/`PublishedCategory`
 * (§11: "Do not invent ratings, opening hours, phone, website, image unless
 * already part of the current public snapshot" — none of those fields exist
 * on `PublishedPoi` today, see packages/shared-types/src/publication.ts, so
 * none are rendered) and never any of §11's explicit exclusion list —
 * `sourceType`/`providerPlaceId`/`customerId`/`mapId`/Firestore paths/
 * internal timestamps are not merely omitted here, they were never part of
 * `PublishedPoi` to begin with (see that type's own doc comment), so there
 * is no possible code path in this component that could leak them.
 *
 * Accessibility (§11/§15): a real `role="dialog"` with `aria-labelledby`
 * pointing at the POI name heading (a genuine `<h2>`, not a styled `<div>`),
 * a real `<button>` close control with an accessible name, and focus moves
 * to the close button on open so a keyboard/screen-reader user lands
 * somewhere meaningful immediately rather than wherever focus happened to be
 * before the marker/search-result activation.
 */
export interface PoiDetailCardProps {
  readonly poi: PublishedPoi;
  readonly category: PublishedCategory | undefined;
  readonly onClose: () => void;
}

export function PoiDetailCard({ poi, category, onClose }: PoiDetailCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingId = `poi-detail-name-${poi.poiId}`;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [poi.poiId]);

  return (
    <div
      data-testid="poi-detail-card"
      className="poi-detail-card"
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
    >
      <button
        ref={closeButtonRef}
        type="button"
        data-testid="poi-detail-close"
        className="poi-detail-close"
        aria-label="Close place details"
        onClick={onClose}
      >
        ×
      </button>
      <h2 id={headingId} data-testid="poi-detail-name" className="poi-detail-name">
        {poi.name}
      </h2>
      {category ? (
        <p data-testid="poi-detail-category" className="poi-detail-category">
          <span aria-hidden="true">{categoryIconMeta(category.icon).emoji}</span> {category.name}
        </p>
      ) : null}
      {poi.description ? (
        <p data-testid="poi-detail-description" className="poi-detail-description">
          {poi.description}
        </p>
      ) : null}
      {poi.address ? (
        <p data-testid="poi-detail-address" className="poi-detail-address">
          {poi.address}
        </p>
      ) : null}
      {/* Future action slots (§11: "structurally prepared for Audio Guide,
          Route/QR — do not implement fake buttons for features not yet
          available") — deliberately no placeholder buttons rendered here;
          this comment IS the structural preparation, not a hidden element,
          so nothing tourist-facing implies a capability that does not
          exist yet. */}
    </div>
  );
}
