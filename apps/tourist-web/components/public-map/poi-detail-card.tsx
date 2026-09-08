'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PublishedCategory, PublishedPoi, PublishedPoiPlace } from 'shared-types';
import { categoryIconMeta } from '@/lib/public-map/category-icon-meta';
import { resolveOpeningStatus } from '@/lib/public-map/opening-hours';
import { PoiPhotoGallery } from './poi-photo-gallery';

// A long authored description is collapsed to a few lines with a "Read more"
// toggle (checkpoint 1B.16 §9). Purely presentational: it clamps/reveals the
// SAME real `poi.description` text, never truncates what a screen reader or a
// test reads, and the threshold is a simple character count so there is no
// layout-measurement flakiness.
const DESCRIPTION_CLAMP_CHARS = 180;

/**
 * The selected-POI detail experience — checkpoint 1B.10 §11, extended by the
 * Photo Experience Prototype checkpoint (rich-detail expansion). ONE
 * component for both the desktop right-side floating panel and the mobile
 * bottom sheet — `app/globals.css` switches presentation via a `@media`
 * breakpoint only; the markup NEVER forks (and, by the same token, never
 * forks for `?embed=1` — the embed page renders this identical tree).
 *
 * Renders ONLY fields present on the current publication snapshot:
 * `PublishedPoi` (name/description/address/translations) and, for a
 * `GOOGLE_PLACES` POI whose Details lookup succeeded at Publish,
 * `PublishedPoi.place` (rating, price, type, hours, phone, website,
 * dine-in/takeaway/delivery — all snapshotted at Publish so a later draft or
 * Google change stays invisible until the next Publish). A row is rendered
 * ONLY when its field is present — never a placeholder, never a fabricated
 * "no rating" / "hours unavailable" row. An old publication with no `place`
 * renders exactly as it did before this expansion.
 *
 * Photos are NOT snapshotted — the `<PoiPhotoGallery>` resolves them fresh,
 * per request, from the trusted admin-web endpoints, and shows the
 * Google-required per-photo attribution. `providerPlaceId` / photo resource
 * names never reach this component.
 *
 * Content order (desktop + mobile, per the checkpoint's information
 * hierarchy): photo gallery → attribution → name → category/type → rating +
 * review count → price → service chips → description → address → opening
 * status/hours → website → phone → (existing action slots).
 *
 * Accessibility: `role="dialog"` + `aria-labelledby` at the `<h2>` name, a
 * real close `<button>` that receives focus on open, `Escape` closes, and
 * `aria-modal="false"` (the map behind stays usable).
 */
export interface PoiDetailCardProps {
  readonly poi: PublishedPoi;
  readonly category: PublishedCategory | undefined;
  readonly onClose: () => void;
  /** Photo Experience Prototype checkpoint — the browser-visible admin-web base URL for the public photo endpoints, or `undefined` when the feature is unconfigured (no gallery is attempted). */
  readonly photoApiBaseUrl?: string;
  /** The current map's id — needed to build the per-photo gallery endpoint URLs. */
  readonly mapId: string;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const CHECK_PATH = 'M9.55 17.6 4.4 12.45l1.4-1.4 3.75 3.75 8.25-8.25 1.4 1.4z';
const CROSS_PATH = 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z';

/**
 * dine-in / takeaway / delivery. A chip renders ONLY when Google explicitly
 * supplied the boolean: `true` → positive (check), `false` → muted negative
 * (cross). `undefined` (Google did not return the field) → nothing — never a
 * placeholder for unavailable data. Values are never inferred.
 */
function ServiceChips({ place }: { readonly place: PublishedPoiPlace }) {
  const chips = [
    { key: 'dine-in', label: 'Dine-in', value: place.dineIn },
    { key: 'takeaway', label: 'Takeaway', value: place.takeout },
    { key: 'delivery', label: 'Delivery', value: place.delivery },
  ].filter((chip): chip is { key: string; label: string; value: boolean } => typeof chip.value === 'boolean');
  if (chips.length === 0) {
    return null;
  }
  return (
    <div className="poi-detail-section">
      <ul data-testid="poi-detail-services" className="poi-detail-chips" aria-label="Service options">
        {chips.map((chip) => (
          <li
            key={chip.key}
            data-testid={`poi-detail-service-${chip.key}`}
            data-available={chip.value ? 'true' : 'false'}
            className={chip.value ? 'poi-detail-chip poi-detail-chip--on' : 'poi-detail-chip poi-detail-chip--off'}
          >
            <span className="poi-detail-chip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d={chip.value ? CHECK_PATH : CROSS_PATH} />
              </svg>
            </span>
            {chip.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A rich-detail row whose value is a link, with a leading glyph (reference: globe / phone). */
function LinkRow({
  testId,
  glyphPath,
  href,
  label,
  external,
}: {
  readonly testId: string;
  readonly glyphPath: string;
  readonly href: string;
  readonly label: string;
  readonly external?: boolean;
}) {
  return (
    <p className="poi-detail-section poi-detail-linkrow">
      <span className="poi-detail-linkrow-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d={glyphPath} />
        </svg>
      </span>
      <a
        data-testid={testId}
        className="poi-detail-link"
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {label}
      </a>
    </p>
  );
}

const GLOBE_PATH =
  'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.92 6h-2.98a15.7 15.7 0 0 0-1.4-3.56A8.03 8.03 0 0 1 18.92 8ZM12 4.04c.82 1.2 1.47 2.51 1.9 3.96h-3.8c.43-1.45 1.08-2.76 1.9-3.96ZM4.26 14a7.9 7.9 0 0 1 0-4h3.38a16.6 16.6 0 0 0 0 4Zm.82 2h2.98c.35 1.26.82 2.46 1.4 3.56A8.03 8.03 0 0 1 5.08 16Zm2.98-8H5.08a8.03 8.03 0 0 1 4.36-3.56A15.7 15.7 0 0 0 8.06 8ZM12 19.96c-.82-1.2-1.47-2.51-1.9-3.96h3.8c-.43 1.45-1.08 2.76-1.9 3.96ZM14.34 14H9.66a14.6 14.6 0 0 1 0-4h4.68a14.6 14.6 0 0 1 0 4Zm.26 5.56c.58-1.1 1.05-2.3 1.4-3.56h2.98a8.03 8.03 0 0 1-4.38 3.56ZM16.36 14a16.6 16.6 0 0 0 0-4h3.38a7.9 7.9 0 0 1 0 4Z';
const PHONE_PATH =
  'M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24c1.1.36 2.3.56 3.5.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.2.2 2.4.56 3.5a1 1 0 0 1-.24 1Z';

function OpeningHours({ place }: { readonly place: PublishedPoiPlace }) {
  const [expanded, setExpanded] = useState(false);
  const status = useMemo(() => resolveOpeningStatus(place.openingHours, place.utcOffsetMinutes), [place.openingHours, place.utcOffsetMinutes]);
  const weekday = place.openingHours?.weekdayDescriptions ?? [];

  if (status.state === 'unknown' && weekday.length === 0) {
    return null;
  }

  return (
    <div className="poi-detail-section poi-detail-section--hours">
      <p data-testid="poi-detail-hours-status" className="poi-detail-hours-status">
        {status.state !== 'unknown' ? (
          <span
            data-testid="poi-detail-hours-state"
            className={status.state === 'open' ? 'poi-detail-hours-badge poi-detail-hours-badge--open' : 'poi-detail-hours-badge poi-detail-hours-badge--closed'}
          >
            {status.state === 'open' ? 'Open now' : 'Closed'}
          </span>
        ) : null}
        {status.detail ? <span className="poi-detail-hours-detail">{status.detail}</span> : null}
        {weekday.length > 0 ? (
          <button
            type="button"
            data-testid="poi-detail-hours-toggle"
            className="poi-detail-readmore"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Hide hours' : 'See hours'}
          </button>
        ) : null}
      </p>
      {expanded && weekday.length > 0 ? (
        <ul data-testid="poi-detail-hours-list" className="poi-detail-hours-list">
          {weekday.map((line, dayIndex) => (
            <li key={dayIndex}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PoiDetailCard({ poi, category, onClose, photoApiBaseUrl, mapId }: PoiDetailCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const headingId = `poi-detail-name-${poi.poiId}`;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

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

  // The accent that ties this panel back to the selected marker is the POI's
  // own category color (the fixed palette the marker uses), never the tenant
  // brand color.
  const meta = category ? categoryIconMeta(category.icon) : undefined;
  const accent = meta?.color;

  const place = poi.place;
  const typeText = place?.primaryTypeDisplayName;
  const hasRating = typeof place?.rating === 'number';
  const priceText = place?.priceLevel === 'FREE' ? 'Free' : place?.priceLevelDisplay;
  const hasStatsRow = hasRating || Boolean(priceText);

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

      {/* 1 — photo gallery (renders `null` for a no-photo POI / unconfigured / failure: no placeholder). */}
      <PoiPhotoGallery mapId={mapId} poiId={poi.poiId} photoApiBaseUrl={photoApiBaseUrl} enabled={Boolean(poi.photo?.available)} />

      <div className="poi-detail-body">
        <div className="poi-detail-header">
          {/* 2 — name */}
          <h2 id={headingId} data-testid="poi-detail-name" className="poi-detail-name">
            {poi.name}
          </h2>
          {/* 3 — category / type */}
          {category || typeText ? (
            <p data-testid="poi-detail-category" className="poi-detail-category">
              {category ? (
                <>
                  <span className="poi-detail-category-icon" aria-hidden="true">
                    {meta ? meta.emoji : null}
                  </span>
                  <span className="poi-detail-category-name">{category.name}</span>
                </>
              ) : null}
              {typeText ? (
                <span data-testid="poi-detail-type" className="poi-detail-type">
                  {category ? ' · ' : ''}
                  {typeText}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* 4 + 5 — rating + review count, then price */}
        {hasStatsRow && place ? (
          <p data-testid="poi-detail-stats" className="poi-detail-stats">
            {hasRating ? (
              <span data-testid="poi-detail-rating" className="poi-detail-rating">
                <span aria-hidden="true">★</span> {place.rating!.toFixed(1)}
                {typeof place.userRatingCount === 'number' ? (
                  <span data-testid="poi-detail-rating-count" className="poi-detail-rating-count">
                    {' '}
                    ({place.userRatingCount})
                  </span>
                ) : null}
              </span>
            ) : null}
            {priceText ? (
              <span data-testid="poi-detail-price" className="poi-detail-price">
                {hasRating ? ' · ' : ''}
                {priceText}
              </span>
            ) : null}
          </p>
        ) : null}

        {/* 6 — service chips */}
        {place ? <ServiceChips place={place} /> : null}

        {/* description (existing published content) */}
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

        {/* 7 — address */}
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

        {/* 8 — opening status / hours */}
        {place ? <OpeningHours place={place} /> : null}

        {/* 9 — website */}
        {place?.websiteUri ? (
          <LinkRow
            testId="poi-detail-website"
            glyphPath={GLOBE_PATH}
            href={place.websiteUri}
            label={hostnameOf(place.websiteUri)}
            external
          />
        ) : null}

        {/* 10 — phone */}
        {place?.nationalPhoneNumber ? (
          <LinkRow
            testId="poi-detail-phone"
            glyphPath={PHONE_PATH}
            href={`tel:${place.nationalPhoneNumber.replace(/\s+/g, '')}`}
            label={place.nationalPhoneNumber}
          />
        ) : null}

        {/* Existing tourist action slots (§11: Audio Guide, Route/QR) — no
            placeholder buttons; this comment IS the structural preparation. */}
      </div>
    </div>
  );
}
