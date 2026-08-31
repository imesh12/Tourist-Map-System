/**
 * packages/map-theme-adapter — checkpoint 1B.9.
 *
 * Provider-neutral `MapTheme` -> Google Maps `styles` array translation,
 * shared between `apps/admin-web` (live Map Settings preview, checkpoint
 * 1B.7) and `apps/tourist-web` (public tourist map, checkpoint 1B.9). See
 * `google-theme-adapter.ts`'s own doc comment for the full reasoning and
 * `docs/architecture/MAP_THEME_ARCHITECTURE.md` for the architecture this
 * implements. A future `MapboxThemeAdapter` (not implemented yet) would live
 * alongside this file as a sibling module with the identical
 * `MapTheme -> <provider format>` signature.
 */
export * from './google-theme-adapter.js';
