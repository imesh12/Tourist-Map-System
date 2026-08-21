'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { MAP_AREA_TYPES, MAP_PROVIDER_NAMES, MAP_STYLES, type MapAreaType, type MapProviderName, type MapStyle } from 'shared-types';
import { mapSettingsUpdateSchema, type MapParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { MapPreview } from '@/lib/map-preview/map-preview';
import { MapPreviewInfo } from '@/lib/map-preview/map-preview-info';

/**
 * The `/admin/map` Map Settings workspace — checkpoint 1B.1, redesigned in
 * checkpoint 1A.10 into a professional two-column workspace (§4): editable
 * cards on the left, a large live Map Preview on the right.
 *
 * Client-side `mapSettingsUpdateSchema.safeParse()` here is a UX
 * convenience only (instant feedback, no round-trip for an obviously
 * invalid value) — `PATCH /api/map/settings` re-validates the same schema
 * server-side and is the only boundary that actually matters
 * (docs/stages/STAGE_1B_TECHNICAL_PLAN.md §3). This form never sends
 * `mapId`/`customerId`/`status`/`createdAt`/`updatedAt` — the schema has no
 * such fields, and the server resolves the target map from the verified
 * session, not from anything this form submits.
 *
 * Numeric fields are plain text inputs (not `<input type="number">`'s
 * built-in spinner UX) kept as strings in state and parsed at submit time —
 * this keeps "field left blank" (→ omit from the payload, meaningful for
 * UNBOUNDED's optional center/zoom) cleanly distinguishable from "field has
 * a value", which a numeric input's own empty-string-vs-0 handling would
 * otherwise blur. The zoom slider (checkpoint 1A.10 §7) reads/writes the
 * exact same string state as the numeric input — one source of truth, two
 * controls.
 *
 * The "Discard changes" action (checkpoint 1A.10 §3) is real, working
 * client-side state reset — no fetch, nothing to fake. "Preview" is a
 * plain in-page anchor link to the Map Preview card below — also real: it
 * scrolls to the same live preview that already reflects every unsaved
 * change, rather than pretending a separate publish-preview engine exists
 * (§3: "do not claim actual publishing functionality exists if it does not
 * yet exist").
 */

const MIN_ZOOM = 0;
const MAX_ZOOM = 22;
const DEFAULT_SLIDER_ZOOM = 10;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface MapSettingsFormProps {
  readonly initialMap: MapParsed;
  readonly canEdit: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved';

function numberFieldToString(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

/** Empty/whitespace/non-numeric → undefined, rather than `NaN` reaching the map preview or the submit payload. */
function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function MapSettingsForm({ initialMap, canEdit }: MapSettingsFormProps) {
  const router = useRouter();

  const [name, setName] = useState(initialMap.name);
  const [provider, setProvider] = useState<MapProviderName>(initialMap.mapProvider.provider);
  const [style, setStyle] = useState<MapStyle>(initialMap.mapProvider.style);
  const [areaType, setAreaType] = useState<MapAreaType>(initialMap.area.type);
  const [centerLat, setCenterLat] = useState(numberFieldToString(initialMap.area.center?.lat));
  const [centerLng, setCenterLng] = useState(numberFieldToString(initialMap.area.center?.lng));
  const [defaultZoom, setDefaultZoom] = useState(numberFieldToString(initialMap.area.defaultZoom));
  const [north, setNorth] = useState(numberFieldToString(initialMap.area.bounds?.north));
  const [south, setSouth] = useState(numberFieldToString(initialMap.area.bounds?.south));
  const [east, setEast] = useState(numberFieldToString(initialMap.area.bounds?.east));
  const [west, setWest] = useState(numberFieldToString(initialMap.area.bounds?.west));
  const [logoUrl, setLogoUrl] = useState(initialMap.branding?.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(initialMap.branding?.primaryColor ?? '');
  const [secondaryColor, setSecondaryColor] = useState(initialMap.branding?.secondaryColor ?? '');

  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const isSaving = saveState === 'saving';
  const controlsDisabled = !canEdit || isSaving;

  const previewCenter = useMemo(() => {
    const lat = parseOptionalNumber(centerLat);
    const lng = parseOptionalNumber(centerLng);
    return lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
  }, [centerLat, centerLng]);

  const previewZoom = useMemo(() => parseOptionalNumber(defaultZoom), [defaultZoom]);
  const zoomSliderValue = previewZoom ?? DEFAULT_SLIDER_ZOOM;

  const previewBounds = useMemo(() => {
    if (areaType !== 'BOUNDED') {
      return undefined;
    }
    const parsedNorth = parseOptionalNumber(north);
    const parsedSouth = parseOptionalNumber(south);
    const parsedEast = parseOptionalNumber(east);
    const parsedWest = parseOptionalNumber(west);
    return parsedNorth !== undefined && parsedSouth !== undefined && parsedEast !== undefined && parsedWest !== undefined
      ? { north: parsedNorth, south: parsedSouth, east: parsedEast, west: parsedWest }
      : undefined;
  }, [areaType, north, south, east, west]);

  function handleMapCenterChange(center: { lat: number; lng: number }): void {
    setCenterLat(String(center.lat));
    setCenterLng(String(center.lng));
  }

  function handleMapZoomChange(zoom: number): void {
    setDefaultZoom(String(zoom));
  }

  function handleDiscard(): void {
    setName(initialMap.name);
    setProvider(initialMap.mapProvider.provider);
    setStyle(initialMap.mapProvider.style);
    setAreaType(initialMap.area.type);
    setCenterLat(numberFieldToString(initialMap.area.center?.lat));
    setCenterLng(numberFieldToString(initialMap.area.center?.lng));
    setDefaultZoom(numberFieldToString(initialMap.area.defaultZoom));
    setNorth(numberFieldToString(initialMap.area.bounds?.north));
    setSouth(numberFieldToString(initialMap.area.bounds?.south));
    setEast(numberFieldToString(initialMap.area.bounds?.east));
    setWest(numberFieldToString(initialMap.area.bounds?.west));
    setLogoUrl(initialMap.branding?.logoUrl ?? '');
    setPrimaryColor(initialMap.branding?.primaryColor ?? '');
    setSecondaryColor(initialMap.branding?.secondaryColor ?? '');
    setFormError(undefined);
    setFieldErrors([]);
    setSaveState('idle');
  }

  function buildPayload(): unknown {
    const trimmedLat = centerLat.trim();
    const trimmedLng = centerLng.trim();
    const center = trimmedLat && trimmedLng ? { lat: Number(trimmedLat), lng: Number(trimmedLng) } : undefined;

    const trimmedZoom = defaultZoom.trim();
    const zoom = trimmedZoom ? Number(trimmedZoom) : undefined;

    const bounds =
      areaType === 'BOUNDED'
        ? { north: Number(north.trim()), south: Number(south.trim()), east: Number(east.trim()), west: Number(west.trim()) }
        : undefined;

    const branding: Record<string, string> = {};
    if (logoUrl.trim()) branding.logoUrl = logoUrl.trim();
    if (primaryColor.trim()) branding.primaryColor = primaryColor.trim();
    if (secondaryColor.trim()) branding.secondaryColor = secondaryColor.trim();

    return {
      name,
      mapProvider: { provider, style },
      area: {
        type: areaType,
        ...(center ? { center } : {}),
        ...(zoom !== undefined ? { defaultZoom: zoom } : {}),
        ...(bounds ? { bounds } : {}),
      },
      ...(Object.keys(branding).length > 0 ? { branding } : {}),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setFormError(undefined);
    setFieldErrors([]);
    setSaveState('idle');

    const payload = buildPayload();
    const parsed = mapSettingsUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setSaveState('saving');
    try {
      const response = await fetch('/api/map/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });

      if (!response.ok) {
        let message = 'Could not save map settings. Please try again.';
        try {
          const body = (await response.json()) as { message?: unknown };
          if (typeof body.message === 'string' && body.message.length > 0) {
            message = body.message;
          }
        } catch {
          // Body wasn't JSON — fall back to the generic message above.
        }
        setFormError(message);
        setSaveState('idle');
        return;
      }

      setSaveState('saved');
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
      setSaveState('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Map Settings' }]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Map Settings</h1>
          <p className="page-description">
            Configure how your map is displayed. Changes are saved as a draft — publishing to the public map is not
            implemented yet.
          </p>
        </div>
        <div className="page-actions">
          <a href="#map-preview-card" className="btn btn-ghost">
            Preview
          </a>
          <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={controlsDisabled}>
            Discard changes
          </button>
          <button type="submit" className="btn btn-primary" disabled={controlsDisabled}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {!canEdit ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can edit map settings. You can view current values below.
        </div>
      ) : null}

      {formError ? (
        <div className="alert alert-danger" role="alert">
          {formError}
        </div>
      ) : null}

      {fieldErrors.length > 0 ? (
        <ul className="alert alert-danger" role="alert" style={{ margin: '0 0 var(--space-4)', paddingLeft: '1.2em' }}>
          {fieldErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      {saveState === 'saved' ? (
        <div className="alert alert-success" role="status">
          Map settings saved.
        </div>
      ) : null}

      <div className="workspace-grid">
        <div>
          <div className="card">
            <div className="card-title">General</div>
            <div className="field">
              <label className="field-label" htmlFor="mapName">
                Map name *
              </label>
              <input
                id="mapName"
                name="mapName"
                type="text"
                required
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={controlsDisabled}
              />
              <span className="field-hint">Internal name for this map.</span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Map Display</div>
            <div className="field">
              <label className="field-label" htmlFor="mapProvider">
                Provider
              </label>
              <select
                id="mapProvider"
                name="mapProvider"
                className="select"
                value={provider}
                onChange={(event) => setProvider(event.target.value as MapProviderName)}
                disabled={controlsDisabled}
              >
                {MAP_PROVIDER_NAMES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="mapStyle">
                Style
              </label>
              <select
                id="mapStyle"
                name="mapStyle"
                className="select"
                value={style}
                onChange={(event) => setStyle(event.target.value as MapStyle)}
                disabled={controlsDisabled}
              >
                {MAP_STYLES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Map Area</div>
            <div className="field">
              <span className="field-label" id="areaTypeLabel">
                Area Type
              </span>
              <div className="segmented" role="group" aria-labelledby="areaTypeLabel">
                {MAP_AREA_TYPES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="segmented-option"
                    aria-pressed={areaType === value}
                    onClick={() => setAreaType(value)}
                    disabled={controlsDisabled}
                  >
                    {value === 'UNBOUNDED' ? 'Unbounded' : 'Bounded'}
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="centerLat">
                  Center latitude
                </label>
                <input
                  id="centerLat"
                  name="centerLat"
                  type="text"
                  inputMode="decimal"
                  className="input"
                  value={centerLat}
                  onChange={(event) => setCenterLat(event.target.value)}
                  disabled={controlsDisabled}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="centerLng">
                  Center longitude
                </label>
                <input
                  id="centerLng"
                  name="centerLng"
                  type="text"
                  inputMode="decimal"
                  className="input"
                  value={centerLng}
                  onChange={(event) => setCenterLng(event.target.value)}
                  disabled={controlsDisabled}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="defaultZoom">
                Default zoom
              </label>
              <div className="slider-row">
                <input
                  type="range"
                  aria-label="Zoom slider"
                  className="slider"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  value={zoomSliderValue}
                  onChange={(event) => setDefaultZoom(event.target.value)}
                  disabled={controlsDisabled}
                />
                <input
                  id="defaultZoom"
                  name="defaultZoom"
                  type="text"
                  inputMode="numeric"
                  className="input"
                  style={{ width: '5em', flexShrink: 0 }}
                  value={defaultZoom}
                  onChange={(event) => setDefaultZoom(event.target.value)}
                  disabled={controlsDisabled}
                />
              </div>
            </div>

            {areaType === 'BOUNDED' ? (
              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="boundsNorth">
                    North
                  </label>
                  <input
                    id="boundsNorth"
                    name="boundsNorth"
                    type="text"
                    inputMode="decimal"
                    className="input"
                    value={north}
                    onChange={(event) => setNorth(event.target.value)}
                    disabled={controlsDisabled}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="boundsSouth">
                    South
                  </label>
                  <input
                    id="boundsSouth"
                    name="boundsSouth"
                    type="text"
                    inputMode="decimal"
                    className="input"
                    value={south}
                    onChange={(event) => setSouth(event.target.value)}
                    disabled={controlsDisabled}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="boundsEast">
                    East
                  </label>
                  <input
                    id="boundsEast"
                    name="boundsEast"
                    type="text"
                    inputMode="decimal"
                    className="input"
                    value={east}
                    onChange={(event) => setEast(event.target.value)}
                    disabled={controlsDisabled}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="boundsWest">
                    West
                  </label>
                  <input
                    id="boundsWest"
                    name="boundsWest"
                    type="text"
                    inputMode="decimal"
                    className="input"
                    value={west}
                    onChange={(event) => setWest(event.target.value)}
                    disabled={controlsDisabled}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="card-title">Branding</div>
            <div className="field">
              <label className="field-label" htmlFor="logoUrl">
                Logo URL
              </label>
              <input
                id="logoUrl"
                name="logoUrl"
                type="text"
                className="input"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                disabled={controlsDisabled}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="primaryColor">
                Primary color
              </label>
              <div className="color-field">
                <span className="color-swatch">
                  {HEX_COLOR_PATTERN.test(primaryColor) ? (
                    <span className="color-swatch-fill" style={{ background: primaryColor }} />
                  ) : null}
                </span>
                <input
                  id="primaryColor"
                  name="primaryColor"
                  type="text"
                  className="input"
                  placeholder="#RRGGBB"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  disabled={controlsDisabled}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="secondaryColor">
                Secondary color
              </label>
              <div className="color-field">
                <span className="color-swatch">
                  {HEX_COLOR_PATTERN.test(secondaryColor) ? (
                    <span className="color-swatch-fill" style={{ background: secondaryColor }} />
                  ) : null}
                </span>
                <input
                  id="secondaryColor"
                  name="secondaryColor"
                  type="text"
                  className="input"
                  placeholder="#RRGGBB"
                  value={secondaryColor}
                  onChange={(event) => setSecondaryColor(event.target.value)}
                  disabled={controlsDisabled}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card" id="map-preview-card">
            <div className="card-title">Map Preview</div>
            <MapPreview
              provider={provider}
              style={style}
              center={previewCenter}
              zoom={previewZoom}
              bounds={previewBounds}
              onCenterChange={handleMapCenterChange}
              onZoomChange={handleMapZoomChange}
            />
            <MapPreviewInfo center={previewCenter} zoom={previewZoom} bounds={previewBounds} />
          </div>
        </div>
      </div>
    </form>
  );
}
