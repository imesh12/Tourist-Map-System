import type { MapAreaBounds, MapTheme } from 'shared-types';
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
 *
 * Checkpoint 1B.7 — a "Current Theme" row follows this exact same
 * established pattern for the new `theme` prop: this app's E2E suite
 * deliberately runs with no Google Maps API key configured (see
 * e2e/map-preview.spec.ts's own header comment), so the live map's actual
 * rendered `styles` are never itself inspectable from a test. This row is
 * what makes "theme changes update the preview immediately, with no Save"
 * (§8 of the checkpoint) a provable, semantic/state assertion rather than a
 * screenshot — exactly the same reason `map-preview-current-center`/
 * `map-preview-current-zoom`/`map-preview-bounds` already exist above.
 */
interface MapPreviewInfoProps {
  readonly center?: MapPreviewCenter;
  readonly zoom?: number;
  readonly bounds?: MapAreaBounds;
  readonly theme?: MapTheme;
}

const HIDDEN_LABELS: ReadonlyArray<readonly [key: keyof MapTheme['visibility'], label: string]> = [
  ['businessPois', 'Business POIs'],
  ['transit', 'Transit'],
  ['schools', 'Schools'],
  ['hospitals', 'Hospitals'],
  ['parks', 'Parks'],
  ['roadLabels', 'Road labels'],
  ['transitLabels', 'Transit labels'],
];

function summarizeHidden(theme: MapTheme): string {
  const hidden = HIDDEN_LABELS.filter(([key]) => !theme.visibility[key]).map(([, label]) => label);
  return hidden.length > 0 ? hidden.join(', ') : 'None';
}

export function MapPreviewInfo({ center, zoom, bounds, theme }: MapPreviewInfoProps) {
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

      {theme ? (
        <div>
          <div className="map-preview-info-label">Current Theme</div>
          <div className="map-preview-info-value" data-testid="map-preview-current-theme">
            Preset {theme.preset}
            <br />
            Hidden: {summarizeHidden(theme)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
