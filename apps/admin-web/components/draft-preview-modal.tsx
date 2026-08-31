'use client';

import { useEffect, useRef } from 'react';
import type { MapAreaBounds, MapBranding, MapProviderName, MapStyle, MapTheme } from 'shared-types';
import { MapPreview } from '@/lib/map-preview/map-preview';
import { MapPreviewInfo } from '@/lib/map-preview/map-preview-info';
import type { MapPreviewCenter } from '@/lib/map-preview/types';

/**
 * The "Draft Preview" dialog — checkpoint 1B.8 §6/§17. What the Preview
 * button now opens, replacing the old plain `<a href="#map-preview-card">`
 * anchor link that merely scrolled to the same in-page card.
 *
 * Renders the CURRENT BROWSER STATE — including every unsaved Map Settings
 * edit — never a re-fetch of saved/published data. The caller
 * (`map-settings-form.tsx`) passes this component the exact same
 * `provider`/`style`/`center`/`zoom`/`bounds`/`theme` values already feeding
 * the live editor preview, so "Preview shows an unsaved change" is true by
 * construction: there is only ever one source of truth for "what does the
 * map look like right now," and both the inline editor preview and this
 * modal read it. This is explicitly a DRAFT preview, never the real
 * published public map (§6: "Do NOT call this the real public map") — the
 * badge/notice text below say so out loud, and this component reuses the
 * exact same `MapPreview` provider-abstraction every other preview surface
 * in this app uses (§3: never bypass it), not a second, parallel rendering
 * path.
 *
 * Checkpoint 1B.8 repair round: this modal was always passed the correct
 * current-draft `theme` (and `center`/`zoom`/`bounds`) — but rendered only
 * `<MapPreview>`, never the sibling `<MapPreviewInfo>` the inline editor
 * preview also renders right next to its own `<MapPreview>` (see
 * `map-settings-form.tsx`'s "Map Preview" card). `MapPreviewInfo`, not
 * `MapPreview`, is what renders the semantic "Current Theme" row
 * (`data-testid="map-preview-current-theme"`) — this app's E2E suite runs
 * with no Google Maps API key configured, so a live map's actual rendered
 * styling is never itself inspectable from a test; this row is what makes
 * that provable as a semantic/state assertion, the same reason
 * `map-preview-info.tsx`'s own doc comment gives for the inline preview.
 * Without it, this dialog had no assertable proof of showing the current
 * draft theme, and no parity with the inline preview. Fixed by rendering
 * `MapPreviewInfo` here too, fed the exact same `center`/`zoom`/`bounds`/
 * `theme` props this component already receives — no theme logic is
 * duplicated.
 *
 * Accessibility (§6): `role="dialog"` + `aria-modal` + `aria-labelledby`
 * pointing at a real heading, a Close button that receives initial focus,
 * Escape closes, and clicking the dimmed backdrop (but not the dialog
 * itself) closes — the same backdrop-click convention
 * `map-preview`'s sibling `.modal-overlay`/`.drawer-overlay` surfaces
 * already establish elsewhere in this app (checkpoint 1B.3's POI delete
 * confirmation, the Category CMS create/edit drawer).
 */

const TITLE_ID = 'draft-preview-modal-title';

export interface DraftPreviewModalProps {
  readonly mapName: string;
  readonly provider: MapProviderName;
  readonly style: MapStyle;
  readonly center?: MapPreviewCenter;
  readonly zoom?: number;
  readonly bounds?: MapAreaBounds;
  readonly theme: MapTheme;
  readonly branding?: MapBranding;
  readonly onClose: () => void;
}

export function DraftPreviewModal({ mapName, provider, style, center, zoom, bounds, theme, branding, onClose }: DraftPreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  function handleBackdropMouseDown(event: React.MouseEvent<HTMLDivElement>): void {
    // Only the backdrop itself (not a click that bubbled up from inside the
    // dialog) closes — mirrors this app's existing `.modal-overlay` click
    // convention.
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-overlay draft-preview-overlay" onMouseDown={handleBackdropMouseDown}>
      <div className="draft-preview-dialog" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID} data-testid="draft-preview-modal">
        <div className="draft-preview-header" style={branding?.primaryColor ? { background: branding.primaryColor } : undefined}>
          <div>
            <span className="badge draft-preview-badge">Draft Preview</span>
            <h2 id={TITLE_ID} className="draft-preview-title">
              {mapName}
            </h2>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} ref={closeButtonRef}>
            Close
          </button>
        </div>

        <p className="draft-preview-notice">
          This is a draft preview of your current unsaved changes — it is not the published public map.
        </p>

        <div className="draft-preview-body">
          <MapPreview provider={provider} style={style} center={center} zoom={zoom} bounds={bounds} theme={theme} />
          <MapPreviewInfo center={center} zoom={zoom} bounds={bounds} theme={theme} />
        </div>
      </div>
    </div>
  );
}
