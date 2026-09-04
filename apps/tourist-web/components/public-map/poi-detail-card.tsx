'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PublishedCategory, PublishedPoi } from 'shared-types';
import { categoryIconMeta } from '@/lib/public-map/category-icon-meta';

// A long authored description is collapsed to a few lines with a "Read more"
// toggle (checkpoint 1B.16 §9 — the reference place-detail panel's own
// pattern). Purely presentational: it clamps/reveals the SAME real
// `poi.description` text, never truncates what a screen reader or a test
// reads (the full string is always in the DOM), and the threshold is a
// simple character count so there is no layout-measurement flakiness.
const DESCRIPTION_CLAMP_CHARS = 180;

/**
 * Checkpoint 1B.10 §11 — the selected-POI detail experience. ONE component
 * for both the desktop "floating right-side panel" and the mobile "bottom
 * sheet" — `app/globals.css`'s `.poi-detail-card` rule switches presentation
 * purely via a `@media` breakpoint, matching this app's established "CSS
 * adapts, markup doesn't fork" convention.
 *
 * Renders ONLY fields already present on `PublishedPoi`/`PublishedCategory`
 * (§11: "Do not invent ratings, opening hours, phone, website, image unless
 * already part of the current public snapshot" — none of those fields exist
 * on `PublishedPoi` today, see packages/shared-types/src/publication.ts, so
 * none are rendered) and never any of §11's explicit exclusion list —
 * `sourceType`/`providerPlaceId`/`customerId`/`mapId`/Firestore paths/
 * internal timestamps were never part of `PublishedPoi` to begin with, so no
 * code path here could leak them.
 *
 * COVER-IMAGE SEAM (checkpoint 1B.16): the layout is a full-bleed
 * `.poi-detail-cover` slot followed by an inset `.poi-detail-body`. A future
 * checkpoint that adds a published POI image (Media Library upload, or a
 * Google Places photo handled per Google's attribution rules) renders the
 * `<figure class="poi-detail-cover">` in the marked slot and nothing else
 * about this component moves. Until then `coverImage` is always `undefined`
 * and NO placeholder is shown — the panel simply starts at the title.
 *
 * Accessibility (§11/§15): a real `role="dialog"` with `aria-labelledby`
 * pointing at the POI name heading (a genuine `<h2>`), a real `<button>`
 * close control with an accessible name, focus moves to the close button on
 * open, and `Escape` closes the panel — `aria-modal` stays `false` because
 * the map behind the panel is still meant to be usable.
 */
export interface PoiDetailCardProps {
  readonly poi: PublishedPoi;
  readonly category: PublishedCategory | undefined;
  readonly onClose: () => void;
}

export function PoiDetailCard({ poi, category, onClose }: PoiDetailCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingId = `poi-detail-name-${poi.poiId}`;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  // `TouristMap` gives this component a `key={poi.poiId}`, so selecting a
  // different POI remounts it: focus returns to the close button and the
  // description collapses back to its default — no cross-POI state bleed,
  // and no setState-in-effect.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isLongDescription = (poi.description?.length ?? 0) > DESCRIPTION_CLAMP_CHARS;

  // checkpoint 1B.16 §5/§6 — the accent that ties this panel back to the
  // selected marker is the POI's own category color (the same fixed palette
  // the marker uses, `category-icon-meta.ts`), never the tenant brand color.
  const meta = category ? categoryIconMeta(category.icon) : undefined;
  const accent = meta?.color;

  return (
    <div
      data-testid="poi-detail-card"
      className="poi-detail-card"
      role="dialog"
      aria-modal="false"
      aria-labelledby={headingId}
      style={accent ? ({ '--poi-accent': accent } as CSSProperties) : undefined}
    >
      {/* Decorative grab affordance — only visible in the mobile bottom-sheet layout. */}
      <span className="poi-detail-handle" aria-hidden="true" />
      <button
        ref={closeButtonRef}
        type="button"
        data-testid="poi-detail-close"
        className="poi-detail-close"
        aria-label="Close place details"
        onClick={onClose}
      >
        <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
          <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z" />
        </svg>
      </button>

      {/* checkpoint 1B.16 — full-bleed cover-image slot. Rendered only once a
          published POI image exists; no placeholder until then. */}
      {/* coverImage ? (
        <figure className="poi-detail-cover" aria-hidden="true">…</figure>
      ) : null */}

      <div className="poi-detail-body">
        <div className="poi-detail-header">
          <h2 id={headingId} data-testid="poi-detail-name" className="poi-detail-name">
            {poi.name}
          </h2>
          {category ? (
            <p data-testid="poi-detail-category" className="poi-detail-category">
              <span className="poi-detail-category-icon" aria-hidden="true">
                {meta ? meta.emoji : null}
              </span>
              <span className="poi-detail-category-name">{category.name}</span>
            </p>
          ) : null}
        </div>

        {poi.description ? (
          <div className="poi-detail-section">
            <p
              data-testid="poi-detail-description"
              className={
                isLongDescription && !descriptionExpanded
                  ? 'poi-detail-description poi-detail-description--clamped'
                  : 'poi-detail-description'
              }
            >
              {poi.description}
            </p>
            {isLongDescription ? (
              <button
                type="button"
                data-testid="poi-detail-description-toggle"
                className="poi-detail-readmore"
                aria-expanded={descriptionExpanded}
                onClick={() => setDescriptionExpanded((value) => !value)}
              >
                {descriptionExpanded ? 'Read less' : 'Read more'}
              </button>
            ) : null}
          </div>
        ) : null}

        {poi.address ? (
          <div className="poi-detail-section poi-detail-section--address">
            <p data-testid="poi-detail-address" className="poi-detail-address">
              <span className="poi-detail-address-pin" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                  <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 4.5A2.5 2.5 0 1 1 12 11.5 2.5 2.5 0 0 1 12 6.5z" />
                </svg>
              </span>
              <span className="poi-detail-address-text">{poi.address}</span>
            </p>
          </div>
        ) : null}

        {/* Future action slots (§11: Audio Guide, Route/QR) — no placeholder
            buttons; this comment IS the structural preparation. */}
      </div>
    </div>
  );
}
