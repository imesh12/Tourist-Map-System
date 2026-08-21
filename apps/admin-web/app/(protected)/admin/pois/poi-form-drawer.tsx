'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { MapAreaBounds, MapProviderName } from 'shared-types';
import type { CategoryParsed } from 'validation';
import { CATEGORY_ICON_META } from '../categories/category-icons';
import { LocationPicker } from '@/lib/map-preview/location-picker';
import type { MapPreviewCenter } from '@/lib/map-preview/types';

/**
 * The shared Create/Edit POI drawer — checkpoint 1B.3 §13. One form
 * component for both modes, exactly the same "caller decides initial
 * values/submit payload, this component only owns field markup/local
 * state" split `CategoryFormDrawer` established (§13: "No duplicate
 * create/edit form implementations").
 *
 * Like `CategoryFormDrawer`, the caller remounts this component (via a
 * `key` prop keyed on the POI being edited, or a fixed key for create)
 * whenever the target changes, so this component's own local field state
 * never needs a `useEffect` to resync from changed props.
 *
 * The map picker (`LocationPicker`, §14) is the ONLY way this drawer talks
 * to Google Maps — it never imports a map-preview adapter directly, per
 * that module's own "one entry point" contract. Latitude/longitude text
 * inputs stay independently editable and are the actual source of truth
 * this component submits; the picker is a convenience that both reads and
 * writes those same two numbers, so typing coordinates directly and
 * clicking the map both work and never disagree.
 */

export interface PoiFormValues {
  readonly name: string;
  readonly categoryId: string;
  readonly address: string;
  readonly description: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly status: 'ENABLED' | 'DISABLED';
}

interface PoiFormDrawerProps {
  readonly mode: 'create' | 'edit';
  readonly initialValues: PoiFormValues;
  readonly categories: readonly CategoryParsed[];
  readonly mapProvider: MapProviderName;
  readonly initialCenter: MapPreviewCenter;
  readonly bounds?: MapAreaBounds;
  readonly isSaving: boolean;
  readonly formError?: string;
  readonly fieldErrors: readonly string[];
  readonly onCancel: () => void;
  readonly onSubmit: (values: PoiFormValues) => void;
}

function toNumberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function PoiFormDrawer({
  mode,
  initialValues,
  categories,
  mapProvider,
  initialCenter,
  bounds,
  isSaving,
  formError,
  fieldErrors,
  onCancel,
  onSubmit,
}: PoiFormDrawerProps) {
  const [name, setName] = useState(initialValues.name);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId);
  const [address, setAddress] = useState(initialValues.address);
  const [description, setDescription] = useState(initialValues.description);
  const [latitude, setLatitude] = useState(initialValues.latitude);
  const [longitude, setLongitude] = useState(initialValues.longitude);
  const [status, setStatus] = useState<'ENABLED' | 'DISABLED'>(initialValues.status);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    onSubmit({ name, categoryId, address, description, latitude, longitude, status });
  }

  // The picker's `value` always reflects whatever the text inputs currently
  // parse to — falling back to `initialCenter` while a field is empty/
  // mid-edit (e.g. the user has cleared latitude to retype it) rather than
  // rendering a marker at (0, 0), which would be a misleading position and
  // is never a sensible POI location in this product.
  const pickerLat = toNumberOrUndefined(latitude) ?? initialCenter.lat;
  const pickerLng = toNumberOrUndefined(longitude) ?? initialCenter.lng;

  function handleMapLocationChange(location: MapPreviewCenter): void {
    setLatitude(String(location.lat));
    setLongitude(String(location.lng));
  }

  return (
    <div className="drawer-overlay" onClick={onCancel}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poiDrawerTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h2 id="poiDrawerTitle" className="drawer-title">
              {mode === 'create' ? 'New POI' : 'Edit POI'}
            </h2>
            <button type="button" className="btn btn-ghost" onClick={onCancel} aria-label="Close">
              ✕
            </button>
          </div>

          <div className="drawer-body">
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

            <div className="field">
              <label className="field-label" htmlFor="poiName">
                Name
              </label>
              <input
                id="poiName"
                className="input"
                type="text"
                required
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="poiCategory">
                Category
              </label>
              <select
                id="poiCategory"
                className="select"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={isSaving}
              >
                {categories.map((category) => {
                  const iconMeta = CATEGORY_ICON_META[category.icon];
                  return (
                    <option key={category.categoryId} value={category.categoryId}>
                      {iconMeta.emoji} {category.name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="poiAddress">
                Address <span className="field-hint">(optional)</span>
              </label>
              <input
                id="poiAddress"
                className="input"
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="poiDescription">
                Description <span className="field-hint">(optional)</span>
              </label>
              <textarea
                id="poiDescription"
                className="textarea"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="field">
              <span className="field-label" id="poiLocationLabel">
                Location
              </span>
              <LocationPicker
                provider={mapProvider}
                value={{ lat: pickerLat, lng: pickerLng }}
                initialCenter={initialCenter}
                bounds={bounds}
                onLocationChange={handleMapLocationChange}
              />
              <span className="field-hint">Click the map, or type coordinates below, to set this POI&apos;s location.</span>
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field-label" htmlFor="poiLatitude">
                  Latitude
                </label>
                <input
                  id="poiLatitude"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  required
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  disabled={isSaving}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="poiLongitude">
                  Longitude
                </label>
                <input
                  id="poiLongitude"
                  className="input"
                  type="text"
                  inputMode="decimal"
                  required
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="field">
              <span className="field-label" id="poiStatusLabel">
                Status
              </span>
              <div className="segmented" role="group" aria-labelledby="poiStatusLabel">
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={status === 'ENABLED'}
                  onClick={() => setStatus('ENABLED')}
                  disabled={isSaving}
                >
                  Enabled
                </button>
                <button
                  type="button"
                  className="segmented-option"
                  aria-pressed={status === 'DISABLED'}
                  onClick={() => setStatus('DISABLED')}
                  disabled={isSaving}
                >
                  Disabled
                </button>
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || categories.length === 0}>
              {isSaving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
