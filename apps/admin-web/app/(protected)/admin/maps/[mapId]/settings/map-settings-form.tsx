'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type FormEvent } from 'react';
import {
  DEFAULT_MAP_THEME,
  MAP_AREA_TYPES,
  MAP_MARKER_SIZES,
  MAP_MARKER_STYLES,
  MAP_PROVIDER_NAMES,
  MAP_STYLES,
  MAP_THEME_PRESET_DEFAULTS,
  MAP_THEME_PRESETS,
  PUBLIC_CONTENT_LANGUAGE_CODES,
  listPublicContentLanguages,
  type MapAreaType,
  type MapMarkerSize,
  type MapMarkerStyle,
  type MapProviderName,
  type MapStyle,
  type MapTheme,
  type MapThemePreset,
  type PublicContentLanguage,
} from 'shared-types';
import { mapSettingsUpdateSchema, type MapParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { ColorField } from '@/components/color-field';
import { DraftPreviewModal } from '@/components/draft-preview-modal';
import { formatPublishedAt } from '@/lib/format-timestamp';
import { MapPreview } from '@/lib/map-preview/map-preview';
import { MapPreviewInfo } from '@/lib/map-preview/map-preview-info';

/**
 * The `/admin/maps/{mapId}/settings` Map Settings workspace — checkpoint
 * 1B.1, redesigned in checkpoint 1A.10 into a two-column workspace (§4):
 * editable cards on the left, a live Map Preview on the right. Checkpoint
 * 1B.8 makes three changes to this file:
 *
 * 1. UX repair (§2/§3/§4) — the right column is now wrapped in
 *    `.workspace-grid-sticky-col` (globals.css) so it stays visible while
 *    scrolling through Branding/Theme/Colors, and every hex-only color field
 *    (`primaryColor`/`secondaryColor`/theme background/road/water/label) is
 *    now a `ColorField` (visual `<input type="color">` + hex text, synced).
 * 2. The "Preview" button (§6) no longer scrolls to an anchor — it opens
 *    `DraftPreviewModal`, a real dialog rendering the exact same unsaved
 *    browser state (provider/style/center/zoom/bounds/theme) the inline
 *    preview already shows.
 * 3. Save vs. Publish (§7/§14/§15) — a new Publish button calls
 *    `POST /api/maps/{mapId}/publish`, disabled whenever this form has
 *    unsaved edits ("Save changes before publishing."), plus a publication
 *    status row (Never published / Published version N) sourced from the
 *    server-authoritative `initialMap.publication` (see
 *    shared-types' `MapPublicationMeta`) — never fabricated from local
 *    state alone. "Unsaved Map Settings" is deliberately the only thing
 *    tracked as local React state here (§15 explicitly permits this,
 *    scoped conservatively to what this ONE form can actually know about
 *    itself — categories/POIs/menu items are out of this checkpoint's
 *    dirty-tracking scope).
 *
 * Client-side `mapSettingsUpdateSchema.safeParse()` here is a UX
 * convenience only (instant feedback, no round-trip for an obviously
 * invalid value) — `PATCH /api/maps/{mapId}/settings` re-validates the same
 * schema server-side and is the only boundary that actually matters. This
 * form never sends `mapId`/`customerId`/`status`/`createdAt`/`updatedAt`/
 * `publication` — the schema has no such fields, and the server resolves
 * the target map from the verified session, not from anything this form
 * submits; `publication` is written exclusively by the separate Publish
 * endpoint (see `handlePublish` below), never by this form's own Save.
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
 * Theme (checkpoint 1B.7): one `useState` per editable `MapTheme` field,
 * same granular-state convention every other card on this form already
 * uses — no separate "theme is dirty" tracking, no `CUSTOM` preset value
 * (see `MapThemePreset`'s own doc comment, shared-types/src/enums.ts, for
 * why). Picking a different preset POPULATES `visibility`/`colors`/
 * `markerStyle` from `MAP_THEME_PRESET_DEFAULTS`; it never locks them, and
 * hand-editing a field afterward never changes the selected preset name
 * back. `colors.land` is intentionally not exposed as a form field (kept to
 * 4 color inputs per the checkpoint's own mockup — background/road/water/
 * label) even though `MapThemeColors`/`mapThemeColorsSchema` both support
 * it; no preset in `MAP_THEME_PRESET_DEFAULTS` sets it either, so this form
 * simply never emits it. `previewTheme` below is the single source of truth
 * fed to both the live `<MapPreview>` (§8: updates with no Save) and
 * `payload`'s `theme` field (Save persists the same value).
 *
 * Checkpoint 1B.8 bug fix: `previewTheme`'s (and the new `previewBranding`'s)
 * colors were previously included the instant a hex field was non-empty,
 * even mid-typed/invalid (e.g. `#1a`) — that reached `mapThemeToGoogleMapsStyles()`
 * and, from there, the REAL Google Maps `styles` array, i.e. an invalid
 * provider style value while the admin was still typing (§4: "Invalid/
 * incomplete HEX text while typing must... not send invalid provider
 * styles"). `toValidHexOrUndefined()` below is the fix — a color only ever
 * reaches the live preview once it matches `#RRGGBB` exactly; the raw text
 * state feeding the input itself is completely untouched by this gate, so
 * the field stays fully editable regardless.
 *
 * Checkpoint 1B.8 repair round - real hydration bug fix: the "Last
 * published {timestamp}" row previously formatted its timestamp with
 * Date.prototype.toLocaleString(), whose output depends on the running
 * environment's locale/ICU data. Node (this Server Component's SSR pass)
 * and Chromium (hydrating that same HTML client-side) can disagree on that
 * default, producing a genuine server/client text mismatch on first paint.
 * formatPublishedAt() now lives in lib/format-timestamp.ts - a pure,
 * UTC-getter-only formatter with no Intl/locale dependency, so it always
 * returns the identical string in both environments. See that module's own
 * doc comment for the full reasoning.
 *
 * Public Languages (checkpoint 1B.17A §8): configures which languages this
 * map's PUBLIC TOURIST content is offered in — completely unrelated to the
 * Admin UI's own display language (still English-only; see shared-types'
 * `PublicContentLanguage` doc comment for the "two separate language
 * concepts" explanation this checkpoint is careful never to conflate). This
 * card does NOT let an operator translate any actual content (no per-field
 * translation editor exists yet — that's checkpoint 1B.17B); it only
 * configures the map-level `defaultLanguage`/`supportedLanguages` pair.
 *
 * `defaultLanguage`/`supportedLanguages` follow the exact same "always
 * included in the payload" convention `theme` already established above —
 * every map always has a real value for both (never "nothing configured
 * yet"), so there's no optional-omission case to represent. Client-side UX
 * guard (§8: "cannot deselect current default; default must always remain
 * supported"): the checkbox for the CURRENTLY-selected default language is
 * disabled (it can't be unchecked directly), and the "default" radio for a
 * language that isn't currently checked is disabled too (a language must be
 * supported before it can become the default) — an operator wanting to drop
 * the current default must first pick a different already-supported
 * language as the new default via the radio, which then frees the old
 * default's checkbox. `mapLanguageConfigSchema`'s own server-side
 * `.refine()` (packages/validation/src/language.ts) is the actual
 * authority; this is UX-only, same as every other client-side validation on
 * this form.
 *
 * Map Appearance redesign: the old separate "Map Display" (provider/style)
 * and "Theme" (preset/visibility/colors/marker) cards are merged into one
 * "Map Appearance" card, reordered to sit right after Public Languages so
 * the left column reads as the intended flow: pick a language, then Preset,
 * Provider, Map style, Marker style/size, glancing at the live preview to
 * the right the whole time. No control was removed or relabeled (every
 * id/htmlFor/data-testid a test locates by is unchanged) - only grouped and
 * reordered, and the eleven MapTheme.visibility checkboxes plus the four
 * color fields now sit inside a "Customize map information" native
 * details/summary disclosure, COLLAPSED by default - a client who just
 * wants TOURISM and Save never sees them. Native <details> semantics (not
 * custom JS) mean the collapsed controls are still fully reachable by
 * keyboard and assistive technology once expanded - see .disclosure
 * (globals.css) for the pure-CSS arrow indicator (no inaccessible
 * show/hide trick). e2e/map-theme.spec.ts opens this disclosure
 * (`getByText('Customize map information').click()`) before touching any
 * field it now contains. LIVE_PREVIEW_MAP_PROVIDERS (below) is the one behavior
 * change: the Provider select in this card now offers only providers
 * lib/map-preview/map-preview.tsx actually renders live, not the full
 * MAP_PROVIDER_NAMES enum - see that constant's own doc comment.
 */

const MIN_ZOOM = 0;
const MAX_ZOOM = 22;
const DEFAULT_SLIDER_ZOOM = 10;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Admin UX direction (Map Appearance redesign) — the Provider select in the
 * primary, non-advanced control row must never offer a choice with no real
 * live preview behind it. `MAP_PROVIDER_NAMES` (shared-types) still lists
 * every schema-valid provider (`MAPBOX` is a real, saveable value — see
 * `lib/map-preview/map-preview.tsx`'s own doc comment for why it isn't
 * implemented yet), but only `GOOGLE_MAPS` actually renders an interactive
 * `MapPreview` today; anything else falls back to a static summary notice.
 * This list is what the redesigned Provider dropdown offers instead of the
 * full enum — kept as a separate constant (not a filter inline at the call
 * site) so the ONE place this checkpoint's "don't fake it" rule lives is
 * findable by name. Whatever the map's OWN already-saved `provider` value
 * is stays selectable even if it falls outside this list (see the dropdown
 * itself), so an existing MAPBOX map is never silently hidden from its own
 * field.
 */
const LIVE_PREVIEW_MAP_PROVIDERS: readonly MapProviderName[] = ['GOOGLE_MAPS'];

interface MapSettingsFormProps {
  readonly mapId: string;
  readonly initialMap: MapParsed;
  readonly canEdit: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved';
type PublishState = 'idle' | 'publishing';

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

/** See this file's own header comment — never lets a partial/invalid hex value reach a live preview. */
function toValidHexOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** checkpoint 1B.17A — keeps `supportedLanguages` in the registry's own deterministic declaration order regardless of the order checkboxes were clicked in, matching `supportedPublicContentLanguagesSchema`'s own ordering expectations. */
function sortByRegistryOrder(codes: readonly PublicContentLanguage[]): readonly PublicContentLanguage[] {
  const set = new Set(codes);
  return PUBLIC_CONTENT_LANGUAGE_CODES.filter((code) => set.has(code));
}

export function MapSettingsForm({ mapId, initialMap, canEdit }: MapSettingsFormProps) {
  const router = useRouter();

  // Checkpoint 1B.7 — read-side default fallback (see `MapTheme`'s own doc
  // comment, shared-types/src/map.ts): a map document saved before this
  // checkpoint has no `theme` field at all, so the form starts from
  // `DEFAULT_MAP_THEME` (the STANDARD preset) rather than requiring a
  // migration.
  const initialTheme = initialMap.theme ?? DEFAULT_MAP_THEME;

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

  // checkpoint 1B.17A — Public Languages (§8). `initialMap.defaultLanguage`/
  // `.enabledLanguages` are ALWAYS present on every map document (see
  // shared-types' `TouristMap` doc comment), so — unlike `branding` above —
  // there's no "nothing configured yet" empty state to represent here.
  const [defaultLanguage, setDefaultLanguage] = useState<PublicContentLanguage>(initialMap.defaultLanguage);
  const [supportedLanguages, setSupportedLanguages] = useState<readonly PublicContentLanguage[]>(initialMap.enabledLanguages);

  const [themePreset, setThemePreset] = useState<MapThemePreset>(initialTheme.preset);
  const [visBusinessPois, setVisBusinessPois] = useState(initialTheme.visibility.businessPois);
  const [visTransit, setVisTransit] = useState(initialTheme.visibility.transit);
  const [visSchools, setVisSchools] = useState(initialTheme.visibility.schools);
  const [visHospitals, setVisHospitals] = useState(initialTheme.visibility.hospitals);
  const [visParks, setVisParks] = useState(initialTheme.visibility.parks);
  const [visRoadLabels, setVisRoadLabels] = useState(initialTheme.visibility.roadLabels);
  const [visTransitLabels, setVisTransitLabels] = useState(initialTheme.visibility.transitLabels);
  // checkpoint 1B.16 — optional on `MapTheme`; a theme saved before 1B.16
  // omits them and the historical behaviour is "shown", so seed a missing
  // value to `true` for the checkbox. `landmarkPois` seeds from its own
  // value or, when absent, from `businessPois` (its historical grouping).
  const [visRoads, setVisRoads] = useState(initialTheme.visibility.roads ?? true);
  const [visBuildings, setVisBuildings] = useState(initialTheme.visibility.buildings ?? true);
  const [visPlaceLabels, setVisPlaceLabels] = useState(initialTheme.visibility.placeLabels ?? true);
  const [visLandmarkPois, setVisLandmarkPois] = useState(initialTheme.visibility.landmarkPois ?? initialTheme.visibility.businessPois);
  const [themeBackground, setThemeBackground] = useState(initialTheme.colors?.background ?? '');
  const [themeRoad, setThemeRoad] = useState(initialTheme.colors?.road ?? '');
  const [themeWater, setThemeWater] = useState(initialTheme.colors?.water ?? '');
  const [themeLabel, setThemeLabel] = useState(initialTheme.colors?.label ?? '');
  const [markerStyle, setMarkerStyle] = useState<MapMarkerStyle>(initialTheme.markerStyle.style);
  const [markerSize, setMarkerSize] = useState<MapMarkerSize>(initialTheme.markerStyle.size);

  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Checkpoint 1B.8 — Draft Preview modal open/closed. The modal is only
  // ever mounted while open (see the JSX below), so opening/closing it
  // never leaves a second, hidden `MapPreview`/Google Maps instance alive.
  const [previewOpen, setPreviewOpen] = useState(false);

  // Checkpoint 1B.8 — publication status, sourced from real Firestore data
  // (`initialMap.publication`, resolved server-side by `getOwnedMapContext()`),
  // never fabricated. Updated locally only once `handlePublish()` itself
  // receives a real server response for THIS publish action.
  const [publication, setPublication] = useState(initialMap.publication);
  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [publishError, setPublishError] = useState<string | undefined>(undefined);
  const [justPublished, setJustPublished] = useState(false);

  const isSaving = saveState === 'saving';
  const isPublishing = publishState === 'publishing';
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

  // Checkpoint 1B.8 — the same "only a fully-valid hex reaches a live
  // preview" gate applied to branding, for the Draft Preview modal's accent
  // header (see DraftPreviewModal's own doc comment). Branding colors don't
  // feed the basemap itself (MapBranding is admin/tourist-chrome branding,
  // not `MapTheme` — see that interface's own doc comment, shared-types/src/map.ts),
  // so this is the one place they get a genuine "live preview" role this
  // checkpoint.
  const previewBranding = useMemo(() => {
    const primary = toValidHexOrUndefined(primaryColor);
    const secondary = toValidHexOrUndefined(secondaryColor);
    if (!primary && !secondary && !logoUrl.trim()) {
      return undefined;
    }
    return {
      ...(logoUrl.trim() ? { logoUrl: logoUrl.trim() } : {}),
      ...(primary ? { primaryColor: primary } : {}),
      ...(secondary ? { secondaryColor: secondary } : {}),
    };
  }, [logoUrl, primaryColor, secondaryColor]);

  // Checkpoint 1B.7 — the single source of truth for both the live preview
  // (no Save required — §8) and `payload`'s `theme` field (Save persists
  // the exact same value). `colors` is only included when at least one hex
  // field is actually a FULLY VALID `#RRGGBB` value (checkpoint 1B.8 fix —
  // see this file's header comment) — an absent field means "use the
  // provider's own default for that element," never a forced or
  // partially-typed value.
  const previewTheme = useMemo<MapTheme>(() => {
    const colors: { background?: string; road?: string; water?: string; label?: string } = {};
    const background = toValidHexOrUndefined(themeBackground);
    const road = toValidHexOrUndefined(themeRoad);
    const water = toValidHexOrUndefined(themeWater);
    const label = toValidHexOrUndefined(themeLabel);
    if (background) colors.background = background;
    if (road) colors.road = road;
    if (water) colors.water = water;
    if (label) colors.label = label;

    return {
      preset: themePreset,
      visibility: {
        businessPois: visBusinessPois,
        transit: visTransit,
        schools: visSchools,
        hospitals: visHospitals,
        parks: visParks,
        roadLabels: visRoadLabels,
        transitLabels: visTransitLabels,
        roads: visRoads,
        buildings: visBuildings,
        placeLabels: visPlaceLabels,
        landmarkPois: visLandmarkPois,
      },
      ...(Object.keys(colors).length > 0 ? { colors } : {}),
      markerStyle: { style: markerStyle, size: markerSize },
    };
  }, [
    themePreset,
    visBusinessPois,
    visTransit,
    visSchools,
    visHospitals,
    visParks,
    visRoadLabels,
    visTransitLabels,
    visRoads,
    visBuildings,
    visPlaceLabels,
    visLandmarkPois,
    themeBackground,
    themeRoad,
    themeWater,
    themeLabel,
    markerStyle,
    markerSize,
  ]);

  /**
   * Selecting a preset POPULATES `visibility`/`colors`/`markerStyle` from
   * `MAP_THEME_PRESET_DEFAULTS` — it does not lock them (§9 of checkpoint
   * 1B.7: no `CUSTOM` auto-relabeling; see `MapThemePreset`'s doc comment
   * for the full reasoning). Hand-editing any field afterward simply leaves
   * `themePreset` exactly as selected.
   */
  function handleThemePresetChange(newPreset: MapThemePreset): void {
    const defaults = MAP_THEME_PRESET_DEFAULTS[newPreset];
    setThemePreset(newPreset);
    setVisBusinessPois(defaults.visibility.businessPois);
    setVisTransit(defaults.visibility.transit);
    setVisSchools(defaults.visibility.schools);
    setVisHospitals(defaults.visibility.hospitals);
    setVisParks(defaults.visibility.parks);
    setVisRoadLabels(defaults.visibility.roadLabels);
    setVisTransitLabels(defaults.visibility.transitLabels);
    setVisRoads(defaults.visibility.roads ?? true);
    setVisBuildings(defaults.visibility.buildings ?? true);
    setVisPlaceLabels(defaults.visibility.placeLabels ?? true);
    setVisLandmarkPois(defaults.visibility.landmarkPois ?? defaults.visibility.businessPois);
    setThemeBackground(defaults.colors?.background ?? '');
    setThemeRoad(defaults.colors?.road ?? '');
    setThemeWater(defaults.colors?.water ?? '');
    setThemeLabel(defaults.colors?.label ?? '');
    setMarkerStyle(defaults.markerStyle.style);
    setMarkerSize(defaults.markerStyle.size);
  }

  /**
   * checkpoint 1B.17A — toggles a language's SUPPORTED state. The `defaultLanguage`
   * checkbox itself is rendered `disabled` for exactly this case (see the JSX
   * below), so this guard against unchecking the current default is defense
   * in depth, not the only thing preventing it.
   */
  function handleToggleSupportedLanguage(code: PublicContentLanguage, checked: boolean): void {
    if (!checked && code === defaultLanguage) {
      return;
    }
    setSupportedLanguages((current) => (checked ? sortByRegistryOrder([...current, code]) : current.filter((existing) => existing !== code)));
  }

  /** checkpoint 1B.17A — the radio for a language that isn't currently supported is rendered `disabled` (see the JSX below); this guard mirrors that. */
  function handleSetDefaultLanguage(code: PublicContentLanguage): void {
    if (!supportedLanguages.includes(code)) {
      return;
    }
    setDefaultLanguage(code);
  }

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
    setDefaultLanguage(initialMap.defaultLanguage);
    setSupportedLanguages(initialMap.enabledLanguages);
    setThemePreset(initialTheme.preset);
    setVisBusinessPois(initialTheme.visibility.businessPois);
    setVisTransit(initialTheme.visibility.transit);
    setVisSchools(initialTheme.visibility.schools);
    setVisHospitals(initialTheme.visibility.hospitals);
    setVisParks(initialTheme.visibility.parks);
    setVisRoadLabels(initialTheme.visibility.roadLabels);
    setVisTransitLabels(initialTheme.visibility.transitLabels);
    setVisRoads(initialTheme.visibility.roads ?? true);
    setVisBuildings(initialTheme.visibility.buildings ?? true);
    setVisPlaceLabels(initialTheme.visibility.placeLabels ?? true);
    setVisLandmarkPois(initialTheme.visibility.landmarkPois ?? initialTheme.visibility.businessPois);
    setThemeBackground(initialTheme.colors?.background ?? '');
    setThemeRoad(initialTheme.colors?.road ?? '');
    setThemeWater(initialTheme.colors?.water ?? '');
    setThemeLabel(initialTheme.colors?.label ?? '');
    setMarkerStyle(initialTheme.markerStyle.style);
    setMarkerSize(initialTheme.markerStyle.size);
    setFormError(undefined);
    setFieldErrors([]);
    setSaveState('idle');
  }

  // Checkpoint 1B.8 repair round — wrapped in `useCallback` (previously a
  // plain function declaration referenced from inside the `payload`
  // `useMemo` below) purely to give that memo's dependency array a STABLE,
  // lint-clean thing to depend on: `react-hooks/exhaustive-deps` correctly
  // flags a memo that calls a freshly-redeclared-every-render function
  // without listing that function itself as a dependency, since it can't
  // prove the function's own closure is covered by the memo's other deps.
  // `useCallback`'s own dependency list below is the SAME primitive state
  // values `buildPayload` actually reads — so `buildPayload` itself is now
  // provably stable exactly when those values are unchanged, and `payload`
  // depending on `[buildPayload]` alone is both correct and warning-free.
  // This is a lint/stability fix only — the values `buildPayload` reads and
  // returns are byte-for-byte unchanged from before.
  const buildPayload = useCallback((): unknown => {
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
      // Checkpoint 1B.7 — always included, unlike `branding` above: every
      // `MapTheme` value always has a fully-populated `preset`/`visibility`/
      // `markerStyle` (only `colors` is ever partial), so there is no
      // "nothing to send yet" state the way an unset branding field has.
      theme: previewTheme,
      // checkpoint 1B.17A — always included, same reasoning as `theme`
      // above: every map always has a real `defaultLanguage`/
      // `enabledLanguages` pair, never "nothing configured yet."
      languages: { defaultLanguage, supportedLanguages },
    };
  }, [
    name,
    provider,
    style,
    areaType,
    centerLat,
    centerLng,
    defaultZoom,
    north,
    south,
    east,
    west,
    logoUrl,
    primaryColor,
    secondaryColor,
    previewTheme,
    defaultLanguage,
    supportedLanguages,
  ]);

  // Checkpoint 1B.8 — "Unsaved Map Settings" tracking (§15: explicitly
  // permitted as LOCAL state, scoped only to this form). `payload` is
  // recomputed whenever `buildPayload` itself changes identity, which
  // happens exactly when one of ITS OWN dependencies (every current field
  // value, listed above) changes — so this is equivalent to depending on
  // each field directly, just funneled through one stable reference.
  // `savedPayloadJson`'s `useState` initializer runs exactly once, on
  // mount, BEFORE any field has been touched — so it captures precisely
  // "what is currently saved" at that moment. It is updated again only when
  // a Save actually succeeds (see `handleSubmit`), never on every
  // keystroke, so it always reflects the last known-saved snapshot, not a
  // moving target.
  const payload = useMemo(() => buildPayload(), [buildPayload]);
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
  const [savedPayloadJson, setSavedPayloadJson] = useState(() => payloadJson);
  const hasUnsavedMapSettingsChanges = payloadJson !== savedPayloadJson;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    setFormError(undefined);
    setFieldErrors([]);
    setSaveState('idle');

    const parsed = mapSettingsUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setSaveState('saving');
    try {
      const response = await fetch(`/api/maps/${mapId}/settings`, {
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
      setSavedPayloadJson(payloadJson);
      router.refresh();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
      setSaveState('idle');
    }
  }

  /**
   * Publish — checkpoint 1B.8 §7/§14. Sends no body at all: the server
   * derives every byte of the published snapshot itself from the SAVED
   * Firestore draft (`POST /api/maps/{mapId}/publish`'s own doc comment).
   * Disabled (see the JSX below) whenever `hasUnsavedMapSettingsChanges` is
   * true, `!canEdit`, or a publish/save is already in flight — the guard
   * here is defense in depth, not the only enforcement.
   */
  async function handlePublish(): Promise<void> {
    if (isPublishing || isSaving || !canEdit || hasUnsavedMapSettingsChanges) {
      return;
    }

    setPublishError(undefined);
    setJustPublished(false);
    setPublishState('publishing');
    try {
      const response = await fetch(`/api/maps/${mapId}/publish`, { method: 'POST' });

      if (!response.ok) {
        let message = 'Could not publish this map. Please try again.';
        try {
          const body = (await response.json()) as { message?: unknown };
          if (typeof body.message === 'string' && body.message.length > 0) {
            message = body.message;
          }
        } catch {
          // Body wasn't JSON — fall back to the generic message above.
        }
        setPublishError(message);
        setPublishState('idle');
        return;
      }

      const body = (await response.json()) as { publicationId: string; version: number };
      setPublication((current) => ({
        currentPublicationId: body.publicationId,
        version: body.version,
        // The exact server timestamp isn't known client-side the instant
        // this response arrives (it resolves server-side via
        // `FieldValue.serverTimestamp()`) — `justPublished` below drives the
        // "Published just now" copy for this session; `router.refresh()`
        // then re-fetches the real, resolved value for any FUTURE render
        // (e.g. a reload), same as `current?.publishedAt` did before this
        // publish.
        publishedAt: current?.publishedAt ?? { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        publishedByUid: current?.publishedByUid ?? '',
      }));
      setJustPublished(true);
      setPublishState('idle');
      router.refresh();
    } catch {
      setPublishError('Could not reach the server. Please check your connection and try again.');
      setPublishState('idle');
    }
  }

  const publishDisabled = !canEdit || isPublishing || isSaving || hasUnsavedMapSettingsChanges;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/admin' },
          { label: 'Maps', href: '/admin/maps' },
          { label: initialMap.name, href: `/admin/maps/${mapId}` },
          { label: 'Map Settings' },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Map Settings</h1>
          <p className="page-description">
            Configure how your map is displayed. Save keeps your changes as a draft; Publish makes the saved draft the
            live public map.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPreviewOpen(true)} data-testid="preview-button">
            Preview
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={controlsDisabled}>
            Discard changes
          </button>
          <button type="submit" className="btn btn-primary" disabled={controlsDisabled}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePublish}
            disabled={publishDisabled}
            data-testid="publish-button"
          >
            {isPublishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="publication-status" data-testid="publication-status">
        {publication ? (
          <span className="badge badge-success">
            {justPublished ? 'Published just now' : `Published — version ${publication.version}`}
          </span>
        ) : (
          <span className="badge badge-neutral">Never published</span>
        )}
        {publication && !justPublished ? (
          <span className="publication-status-meta">Last published {formatPublishedAt(publication.publishedAt)}</span>
        ) : null}
        {hasUnsavedMapSettingsChanges ? (
          <span className="badge" data-testid="unsaved-map-settings-badge">
            Unsaved Map Settings
          </span>
        ) : null}
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

      {publishError ? (
        <div className="alert alert-danger" role="alert">
          {publishError}
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

      {hasUnsavedMapSettingsChanges && canEdit ? (
        <p className="field-hint" data-testid="publish-disabled-hint" style={{ marginTop: `calc(-1 * var(--space-2))`, marginBottom: 'var(--space-4)' }}>
          Save changes before publishing.
        </p>
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

          <div className="card" data-testid="public-languages-card">
            <div className="card-title">Public Languages</div>
            <p className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>
              Choose which languages this map&apos;s public tourist content is offered in. This does not change the
              Admin language — only your public map. Translating content itself is not available yet.
            </p>

            <div className="field">
              <span className="field-label" id="publicLanguagesLabel">
                Supported languages / Default
              </span>
              <div role="group" aria-labelledby="publicLanguagesLabel">
                {listPublicContentLanguages().map((entry) => {
                  const isSupported = supportedLanguages.includes(entry.code);
                  const isDefault = defaultLanguage === entry.code;
                  return (
                    <div key={entry.code} className="checkbox-field" data-testid={`public-language-row-${entry.code}`}>
                      <input
                        id={`publicLanguageSupported-${entry.code}`}
                        type="checkbox"
                        checked={isSupported}
                        onChange={(event) => handleToggleSupportedLanguage(entry.code, event.target.checked)}
                        disabled={controlsDisabled || isDefault}
                        data-testid={`public-language-checkbox-${entry.code}`}
                      />
                      <label htmlFor={`publicLanguageSupported-${entry.code}`}>
                        {entry.englishLabel} ({entry.nativeLabel})
                      </label>
                      <label style={{ marginLeft: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}>
                        <input
                          type="radio"
                          name="defaultPublicLanguage"
                          checked={isDefault}
                          onChange={() => handleSetDefaultLanguage(entry.code)}
                          disabled={controlsDisabled || !isSupported}
                          data-testid={`public-language-default-${entry.code}`}
                        />
                        Default
                      </label>
                    </div>
                  );
                })}
              </div>
              <span className="field-hint">
                The default language is used whenever a visitor&apos;s requested language isn&apos;t available. To
                remove the current default, first choose a different default from an already-supported language.
              </span>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Map Appearance</div>
            <p className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>
              See changes in the live preview to the right as you go — Save is still required to keep them. Most
              maps only need a preset: pick TOURISM and you&apos;re done.
            </p>

            <div className="field">
              <label className="field-label" htmlFor="themePreset">
                Preset
              </label>
              <select
                id="themePreset"
                name="themePreset"
                className="select"
                value={themePreset}
                onChange={(event) => handleThemePresetChange(event.target.value as MapThemePreset)}
                disabled={controlsDisabled}
              >
                {MAP_THEME_PRESETS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="field-hint">Picking a preset fills in everything below — you can still adjust any of it afterward.</span>
            </div>

            <div className="field-row">
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
                  {MAP_PROVIDER_NAMES.filter((value) => value === provider || LIVE_PREVIEW_MAP_PROVIDERS.includes(value)).map((value) => (
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
              <div className="field">
                <label className="field-label" htmlFor="markerStyle">
                  Marker style
                </label>
                <select
                  id="markerStyle"
                  name="markerStyle"
                  className="select"
                  value={markerStyle}
                  onChange={(event) => setMarkerStyle(event.target.value as MapMarkerStyle)}
                  disabled={controlsDisabled}
                >
                  {MAP_MARKER_STYLES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="markerSize">
                  Marker size
                </label>
                <select
                  id="markerSize"
                  name="markerSize"
                  className="select"
                  value={markerSize}
                  onChange={(event) => setMarkerSize(event.target.value as MapMarkerSize)}
                  disabled={controlsDisabled}
                >
                  {MAP_MARKER_SIZES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <details className="disclosure">
              <summary className="disclosure-summary">Customize map information</summary>
              <p className="field-hint" style={{ margin: 'var(--space-3) 0 var(--space-4)' }}>
                Fine-grained base-map layers most clients never need to touch — hide provider clutter like default
                business pins, or tune exactly which labels show.
              </p>

            {/* checkpoint 1B.16 — "Map Information": the contextual base-map
                layers a client turns on/off. All are `MapTheme.visibility`
                fields (no second display-settings model); the four 1B.16
                fields are optional on the type but the form always persists
                an explicit boolean once the map is saved. */}
            <div className="field">
              <span className="field-label" id="themeMapInfoLabel">
                Map Information
              </span>
              <div role="group" aria-labelledby="themeMapInfoLabel">
                <div className="checkbox-field">
                  <input
                    id="themeVisRoads"
                    type="checkbox"
                    checked={visRoads}
                    onChange={(event) => setVisRoads(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisRoads">Roads</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisRoadLabels"
                    type="checkbox"
                    checked={visRoadLabels}
                    onChange={(event) => setVisRoadLabels(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisRoadLabels">Road names</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisTransit"
                    type="checkbox"
                    checked={visTransit}
                    onChange={(event) => setVisTransit(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisTransit">Railway / Transit</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisTransitLabels"
                    type="checkbox"
                    checked={visTransitLabels}
                    onChange={(event) => setVisTransitLabels(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisTransitLabels">Transit labels</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisParks"
                    type="checkbox"
                    checked={visParks}
                    onChange={(event) => setVisParks(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisParks">Parks &amp; nature</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisBuildings"
                    type="checkbox"
                    checked={visBuildings}
                    onChange={(event) => setVisBuildings(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisBuildings">Buildings</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisPlaceLabels"
                    type="checkbox"
                    checked={visPlaceLabels}
                    onChange={(event) => setVisPlaceLabels(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisPlaceLabels">Area / place names</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisLandmarkPois"
                    type="checkbox"
                    checked={visLandmarkPois}
                    onChange={(event) => setVisLandmarkPois(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisLandmarkPois">Tourist landmarks</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisBusinessPois"
                    type="checkbox"
                    checked={visBusinessPois}
                    onChange={(event) => setVisBusinessPois(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisBusinessPois">Businesses</label>
                </div>
              </div>
            </div>

            <div className="field">
              <span className="field-label" id="themeMorePoisLabel">
                Additional POIs
              </span>
              <div role="group" aria-labelledby="themeMorePoisLabel">
                <div className="checkbox-field">
                  <input
                    id="themeVisSchools"
                    type="checkbox"
                    checked={visSchools}
                    onChange={(event) => setVisSchools(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisSchools">Schools</label>
                </div>
                <div className="checkbox-field">
                  <input
                    id="themeVisHospitals"
                    type="checkbox"
                    checked={visHospitals}
                    onChange={(event) => setVisHospitals(event.target.checked)}
                    disabled={controlsDisabled}
                  />
                  <label htmlFor="themeVisHospitals">Hospitals</label>
                </div>
              </div>
            </div>

            <div className="field-row">
              <ColorField id="themeBackground" label="Background" value={themeBackground} onChange={setThemeBackground} disabled={controlsDisabled} />
              <ColorField id="themeRoad" label="Road colour" value={themeRoad} onChange={setThemeRoad} disabled={controlsDisabled} />
              <ColorField id="themeWater" label="Water" value={themeWater} onChange={setThemeWater} disabled={controlsDisabled} />
              <ColorField id="themeLabel" label="Labels" value={themeLabel} onChange={setThemeLabel} disabled={controlsDisabled} />
            </div>
            </details>
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
            <ColorField id="primaryColor" label="Primary color" value={primaryColor} onChange={setPrimaryColor} disabled={controlsDisabled} />
            <ColorField
              id="secondaryColor"
              label="Secondary color"
              value={secondaryColor}
              onChange={setSecondaryColor}
              disabled={controlsDisabled}
            />
          </div>
        </div>

        <div className="workspace-grid-sticky-col">
          <div className="card" id="map-preview-card">
            <div className="card-title">Map Preview</div>
            <MapPreview
              provider={provider}
              style={style}
              center={previewCenter}
              zoom={previewZoom}
              bounds={previewBounds}
              theme={previewTheme}
              onCenterChange={handleMapCenterChange}
              onZoomChange={handleMapZoomChange}
            />
            <MapPreviewInfo center={previewCenter} zoom={previewZoom} bounds={previewBounds} theme={previewTheme} />
          </div>
        </div>
      </div>

      {previewOpen ? (
        <DraftPreviewModal
          mapName={name}
          provider={provider}
          style={style}
          center={previewCenter}
          zoom={previewZoom}
          bounds={previewBounds}
          theme={previewTheme}
          branding={previewBranding}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </form>
  );
}
