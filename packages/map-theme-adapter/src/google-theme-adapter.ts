import type { MapTheme } from 'shared-types';

/**
 * MapTheme -> Google Maps styling adapter — checkpoint 1B.7, see
 * docs/architecture/MAP_THEME_ARCHITECTURE.md.
 *
 * Checkpoint 1B.9: moved here, into its own tiny shared workspace package
 * (`packages/map-theme-adapter`), from `apps/admin-web/lib/map-preview/
 * google-theme-adapter.ts`. The public tourist map (`apps/tourist-web`) now
 * needs the exact same `MapTheme -> Google Maps styles` translation the
 * admin live preview already used — this function had zero dependency on
 * anything admin-web-specific (only `shared-types`' `MapTheme`), so moving
 * it (not forking a second copy) is a pure relocation with no behavior
 * change: same implementation, same tests (moved verbatim alongside it),
 * now importable as `from 'map-theme-adapter'` by both apps instead of
 * living inside one of them. `apps/admin-web/lib/map-preview/
 * google-maps-preview.tsx` was updated to import from this package; no
 * other file referenced the old relative path.
 *
 * The ONE place a provider-neutral `MapTheme` is translated into a real
 * Google Maps JS API `styles` array. Nothing else in this codebase is
 * allowed to generate a Google style array directly (§6 of the checkpoint:
 * "Do not let the Map Settings form generate Google style arrays
 * directly") — `map-settings-form.tsx` only ever holds a `MapTheme` value;
 * `google-maps-preview.tsx` calls this function once, right before handing
 * the result to `google.maps.Map`'s `styles` option.
 *
 * A `MapboxThemeAdapter` (future, not implemented this checkpoint — see
 * `map-preview.tsx`'s existing MAPBOX-not-yet-implemented fallback) would
 * live alongside this file as a sibling module with the identical
 * `MapTheme -> <provider format>` signature.
 *
 * Deliberately returns a plain array of plain objects shaped like
 * `google.maps.MapTypeStyle`, not an import of the real Google Maps type —
 * this keeps the module loadable and unit-testable (see
 * google-theme-adapter.test.ts) without the real `google` global or the
 * Maps JS SDK ever being present, exactly like `mapThemeSchema`'s own
 * "provider-neutral, zero SDK dependency" boundary.
 *
 * Pure and deterministic: the same `MapTheme` value always produces the
 * exact same style array, in the exact same order — no randomness, no
 * environment/time dependency, no mutation of the input.
 *
 * Compliance note (§5 of the checkpoint): a Google Maps `styles` array can
 * only affect the BASEMAP's own rendering (roads, land, water, POI/label
 * visibility and color) — it has no way to touch, hide, or otherwise alter
 * the Google logo or the "Keep exploring" / legal attribution control the
 * Maps JS API renders on top of the map itself. Nothing in this adapter (or
 * anywhere else in this checkpoint) attempts to remove or obscure that
 * required UI; it is simply outside what a `styles` array is capable of
 * touching in the first place.
 *
 * Repair round (typing only): `GoogleMapStyler`/`GoogleMapStyleElement` are
 * this file's own OUTPUT types, not `MapTheme` — `MapTheme` itself (and
 * every field on it) stays fully `readonly`; nothing about the provider-
 * neutral domain model changes here. `google.maps.MapTypeStyle.stylers` is
 * declared as a MUTABLE `MapTypeStyler[]` (the real Maps JS API type), so
 * this adapter's own `GoogleMapStyleElement.stylers` is typed as a mutable
 * `GoogleMapStyler[]` to match it structurally — a `readonly GoogleMapStyler[]`
 * is not assignable where a plain `GoogleMapStyler[]` is expected, and that
 * mismatch is exactly what surfaced as two `pnpm typecheck` failures in
 * `google-maps-preview.tsx` (the initial `Map` constructor's `styles` option
 * and the theme-sync effect's `setOptions({ styles })` call). Every internal
 * builder here (`visibilityOff`/`colorStyle`, and the inline `labels.text.fill`
 * entry) already constructs a fresh array literal per call, so this widening
 * is free — nothing shares or mutates these arrays after construction.
 */

export interface GoogleMapStyler {
  [key: string]: string | number;
}

export interface GoogleMapStyleElement {
  featureType?: string;
  elementType?: string;
  stylers: GoogleMapStyler[];
}

function visibilityOff(featureType: string, elementType?: string): GoogleMapStyleElement {
  return elementType ? { featureType, elementType, stylers: [{ visibility: 'off' }] } : { featureType, stylers: [{ visibility: 'off' }] };
}

function colorStyle(color: string, featureType?: string, elementType?: string): GoogleMapStyleElement {
  return featureType
    ? { featureType, elementType: elementType ?? 'geometry', stylers: [{ color }] }
    : { elementType: elementType ?? 'geometry', stylers: [{ color }] };
}

/**
 * Converts a provider-neutral `MapTheme` into a Google Maps `styles` array.
 *
 * Order is deliberate and stable: visibility (suppression) rules first,
 * then color overrides — later entries in a Google `styles` array do not
 * override earlier ones for a DIFFERENT `featureType`/`elementType` pair
 * (each entry only ever targets its own declared feature/element), so
 * ordering has no functional effect on the result, but a stable order keeps
 * output deterministic and easy to snapshot-test.
 */
export function mapThemeToGoogleMapsStyles(theme: MapTheme): readonly GoogleMapStyleElement[] {
  const { visibility, colors } = theme;
  const styles: GoogleMapStyleElement[] = [];

  // --- Visibility: suppress provider clutter, keep useful geography -----
  // §5 "Hide or strongly reduce: default business POIs, random commercial
  // POIs, schools, hospitals unless explicitly useful, unnecessary
  // administrative clutter." `poi` (the umbrella feature type) is
  // deliberately never turned off wholesale — that would also hide
  // `poi.park`, which has its own independent `visibility.parks` flag.
  if (!visibility.businessPois) {
    styles.push(visibilityOff('poi.business'));
    styles.push(visibilityOff('poi.attraction'));
    styles.push(visibilityOff('poi.government'));
    styles.push(visibilityOff('poi.place_of_worship'));
  }
  if (!visibility.schools) {
    styles.push(visibilityOff('poi.school'));
  }
  if (!visibility.hospitals) {
    styles.push(visibilityOff('poi.medical'));
  }
  if (!visibility.parks) {
    styles.push(visibilityOff('poi.park'));
  }
  // §5 "Preserve: roads, rail / stations, major geography, parks where
  // useful, water, street labels where configured, transit labels where
  // configured." `transit` (rail/stations/lines themselves) is only ever
  // suppressed wholesale when the flag is fully off; a `transit: true` with
  // `transitLabels: false` keeps the lines/stations but hides their text
  // labels specifically — the same distinction `roadLabels` makes for
  // roads below.
  if (!visibility.transit) {
    styles.push(visibilityOff('transit'));
  } else if (!visibility.transitLabels) {
    styles.push(visibilityOff('transit', 'labels'));
  }
  if (!visibility.roadLabels) {
    styles.push(visibilityOff('road', 'labels'));
  }

  // --- Colors --------------------------------------------------------
  if (colors?.background) {
    styles.push(colorStyle(colors.background));
  }
  if (colors?.land) {
    styles.push(colorStyle(colors.land, 'landscape'));
  }
  if (colors?.road) {
    styles.push(colorStyle(colors.road, 'road'));
  }
  if (colors?.water) {
    styles.push(colorStyle(colors.water, 'water'));
  }
  if (colors?.label) {
    styles.push({ elementType: 'labels.text.fill', stylers: [{ color: colors.label }] });
  }

  return styles;
}
