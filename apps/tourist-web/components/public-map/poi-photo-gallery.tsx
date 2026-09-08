'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPoiPhotoMetaUrl,
  buildPoiPhotoUrl,
  COVER_PHOTO_PX,
  GALLERY_MAX_PHOTOS,
  type PoiPhotoAttribution,
  type PoiPhotoMeta,
} from '@/lib/public-map/poi-photo-source';

/**
 * Photo Experience Prototype checkpoint (gallery expansion) — the
 * multi-photo cover for `PoiDetailCard`.
 *
 * LAZY by construction: on open it fetches `/photo-meta` (index 0) ONCE for
 * the total `count` + the cover photo's attribution. Only the CURRENTLY
 * shown photo's `<img loading="lazy">` is mounted (a `key` per index), so
 * `/photo?index=N` is requested only when the visitor actually navigates to
 * photo N — never all photos up front. Each photo's attribution is fetched
 * from `/photo-meta?index=N` the first time that photo is viewed.
 *
 * Every failure mode collapses to the existing no-cover behavior: feature
 * unconfigured, `/photo-meta` (index 0) not-ok / `available:false`, or the
 * cover `<img>` failing to load → this component renders `null` and the
 * detail panel simply starts at the title. A NON-cover photo failing is
 * skipped (advance past it); it never breaks the gallery.
 *
 * Google attribution: the `<figcaption>` credit is built ONLY from what
 * `/photo-meta?index=N` returned for THIS photo — never invented. (The
 * on-map `photo-pin` marker remains PROTOTYPE-ONLY and NOT
 * production-compliant for Google-sourced photos — see
 * `lib/public-map/marker-style-adapter.ts`; this in-panel gallery IS where
 * the required per-photo attribution is shown.)
 */
export interface PoiPhotoGalleryProps {
  readonly mapId: string;
  readonly poiId: string;
  readonly photoApiBaseUrl: string | undefined;
  /** `poi.photo?.available` — whether the published snapshot says to try at all. */
  readonly enabled: boolean;
}

type MetaStatus = 'loading' | 'ok' | 'unavailable';

function CreditLine({ attributions }: { readonly attributions: readonly PoiPhotoAttribution[] }) {
  if (attributions.length === 0) {
    return null;
  }
  const hasLink = attributions.some((entry) => entry.uri);
  return (
    <figcaption data-testid="poi-detail-cover-credit" className="poi-detail-cover-credit">
      Photo by{' '}
      {hasLink
        ? attributions.map((entry, index) => (
            <span key={`${entry.displayName}-${index}`}>
              {index > 0 ? ', ' : ''}
              {entry.uri ? (
                <a href={entry.uri} target="_blank" rel="noreferrer noopener">
                  {entry.displayName}
                </a>
              ) : (
                entry.displayName
              )}
            </span>
          ))
        : attributions.map((entry) => entry.displayName).join(', ')}
    </figcaption>
  );
}

export function PoiPhotoGallery({ mapId, poiId, photoApiBaseUrl, enabled }: PoiPhotoGalleryProps) {
  const [metaStatus, setMetaStatus] = useState<MetaStatus>('loading');
  const [count, setCount] = useState(1);
  const [index, setIndex] = useState(0);
  const [attributionsByIndex, setAttributionsByIndex] = useState<ReadonlyMap<number, readonly PoiPhotoAttribution[]>>(() => new Map());
  const failedMetaIndicesRef = useRef<Set<number>>(new Set());

  const coverMetaUrl = enabled ? buildPoiPhotoMetaUrl(photoApiBaseUrl, mapId, poiId) : undefined;

  // One-time: the cover's meta (total count + index-0 attribution). Only the
  // ASYNC branch ever calls setState — the "feature not configured / no POI
  // photo" case is handled by an early `return null` at render time, so this
  // effect never sets state synchronously in its body.
  useEffect(() => {
    if (!coverMetaUrl) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(coverMetaUrl, { signal: controller.signal });
        if (!response.ok) {
          setMetaStatus('unavailable');
          return;
        }
        const meta = (await response.json()) as Partial<PoiPhotoMeta>;
        if (meta.available !== true) {
          setMetaStatus('unavailable');
          return;
        }
        const total = Math.min(Math.max(typeof meta.count === 'number' ? meta.count : 1, 1), GALLERY_MAX_PHOTOS);
        setCount(total);
        setAttributionsByIndex((previous) => new Map(previous).set(0, Array.isArray(meta.attributions) ? meta.attributions : []));
        setMetaStatus('ok');
      } catch {
        // Abort / network error — leave `metaStatus` at 'loading' so a
        // re-open can retry; the panel just shows no cover meanwhile.
      }
    })();
    return () => controller.abort();
  }, [coverMetaUrl]);

  // Lazy per-photo attribution, fetched the first time an index is viewed.
  useEffect(() => {
    if (metaStatus !== 'ok' || index === 0 || attributionsByIndex.has(index) || failedMetaIndicesRef.current.has(index)) {
      return;
    }
    const url = buildPoiPhotoMetaUrl(photoApiBaseUrl, mapId, poiId, { index });
    if (!url) {
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          failedMetaIndicesRef.current.add(index); // don't retry; image still shows, just no caption
          return;
        }
        const meta = (await response.json()) as Partial<PoiPhotoMeta>;
        setAttributionsByIndex((previous) =>
          new Map(previous).set(index, Array.isArray(meta.attributions) ? meta.attributions : []),
        );
      } catch {
        /* keep showing the image without a caption */
      }
    })();
    return () => controller.abort();
  }, [metaStatus, index, attributionsByIndex, photoApiBaseUrl, mapId, poiId]);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => ((current + delta) % count + count) % count);
    },
    [count],
  );

  const handleImgError = useCallback(() => {
    if (index === 0) {
      setMetaStatus('unavailable'); // cover gone → no gallery at all (no-cover behavior)
      return;
    }
    setIndex((current) => (current + 1) % count); // skip the broken photo
  }, [index, count]);

  const imgSrc = useMemo(
    () => buildPoiPhotoUrl(photoApiBaseUrl, mapId, poiId, { maxPx: COVER_PHOTO_PX, index }),
    [photoApiBaseUrl, mapId, poiId, index],
  );

  if (metaStatus !== 'ok' || !imgSrc) {
    return null;
  }

  const currentAttributions = attributionsByIndex.get(index) ?? [];
  const hasControls = count > 1;

  return (
    <figure className="poi-detail-cover" data-testid="poi-detail-cover" data-photo-count={count}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={index}
        src={imgSrc}
        alt=""
        className="poi-detail-cover-image"
        loading="lazy"
        onError={handleImgError}
      />

      {hasControls ? (
        <>
          <button
            type="button"
            data-testid="poi-detail-gallery-prev"
            className="poi-detail-gallery-nav poi-detail-gallery-nav--prev"
            aria-label="Previous photo"
            onClick={() => go(-1)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="poi-detail-gallery-next"
            className="poi-detail-gallery-nav poi-detail-gallery-nav--next"
            aria-label="Next photo"
            onClick={() => go(1)}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m8.6 7.4 1.4-1.4 6 6-6 6-1.4-1.4 4.6-4.6z" />
            </svg>
          </button>
          {/* Reference: a compact "N / M" count at the bottom-right — the
              arrows + count carry the affordance; no dot row. */}
          <span className="poi-detail-gallery-count" data-testid="poi-detail-gallery-indicator" aria-hidden="true">
            {index + 1} / {count}
          </span>
        </>
      ) : null}

      <CreditLine attributions={currentAttributions} />
    </figure>
  );
}
