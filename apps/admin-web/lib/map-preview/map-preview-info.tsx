import type { MapAreaBounds } from 'shared-types';
import type { MapPreviewCenter } from './types';

/**
 * The always-visible "Current Center / Current Zoom / Bounds" information
 * area below the map preview — checkpoint 1A.10 §8. Rendered unconditionally
 * by `map-settings-form.tsx`, independent of whether `MapPreview` is showing
 * a live interactive map or the non-interactive fallback — this is the
 * single source of that information either way, so it is never duplicated
 * (see `map-preview-summary.tsx`'s doc comment).
 *
 * Pure, prop-driven, no SDK — reflects the same derived `previewCenter`/
 * `previewZoom`/`previewBounds` the map itself receives, so it updates
 * immediately as the form changes (checkpoint 1B.1-D requirement 6) exactly
 * like the map does.
 */
interface MapPreviewInfoProps {
  readonly center?: MapPreviewCenter;
  readonly zoom?: number;
  readonly bounds?: MapAreaBounds;
}

export function MapPreviewInfo({ center, zoom, bounds }: MapPreviewInfoProps) {
  return (
    <div className="map-preview-info-grid" data-testid="map-preview-info">
      <div>
        <div className="map-preview-info-label">Current Center</div>
        <div className="map-preview-info-value" data-testid="map-preview-current-center">
          {center ? (
            <>
              Latitude {center.lat}
              <br />
              Longitude {center.lng}
            </>
          ) : (
            'Not set'
          )}
        </div>
      </div>

      <div>
        <div className="map-preview-info-label">Current Zoom</div>
        <div className="map-preview-info-value" data-testid="map-preview-current-zoom">
          {zoom ?? 'Not set'}
        </div>
      </div>

      <div>
        <div className="map-preview-info-label">Bounds</div>
        <div className="map-preview-info-value" data-testid="map-preview-bounds">
          {bounds ? (
            <>
              N {bounds.north}, S {bounds.south}
              <br />E {bounds.east}, W {bounds.west}
            </>
          ) : (
            'No bounds (Unbounded area)'
          )}
        </div>
      </div>
    </div>
  );
}
