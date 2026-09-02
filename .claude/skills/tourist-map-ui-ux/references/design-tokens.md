# Tourist-web design tokens

Everything below is extracted from `apps/tourist-web/app/globals.css` and `apps/tourist-web/lib/public-map/category-icon-meta.ts` as of this skill's writing. There is no design-token file or theme object in this app — these values are the tokens, expressed directly in CSS. Reuse them by value; don't invent nearby-but-different numbers for a new component.

A concrete pair of examples from this skill's own benchmark, to make "nearby-but-different" tangible: implementing a favorites feature without this reference in hand produced a brand-new `#e0245e` accent color for the favorited state (this app has exactly one accent color, `#2f6fed`, reused below); a mobile touch-target fix produced a new 48px tap target where every other control in the app is exactly 44px. Neither was wrong on its own — both were reasonable-looking choices in isolation — but both quietly forked the token set. Check this file before picking a value, even one that seems obviously fine.

## Color

| Token | Value | Used for |
|---|---|---|
| Surface (solid) | `#fff` | Floating cards (POI detail, page overlay, search overlay), menu item background |
| Surface (translucent, on-map) | `rgba(255, 255, 255, 0.92)` – `rgba(255, 255, 255, 0.95)` | Branding header, bottom menu bar, status pills — chrome that sits directly on the map canvas |
| Accent / focus | `#2f6fed` | Focus-visible outline (all overlay controls); default/`SIGHTSEEING` category marker color |
| Selected / pressed | `#111827` bg, `#fff` text | Active bottom-menu item (`aria-pressed="true"`) |
| Border, subtle | `rgba(0, 0, 0, 0.08)` | Hairline dividers (branding header bottom border, bottom-menu top border, search result rows) |
| Border, control | `rgba(0, 0, 0, 0.15)` – `rgba(0, 0, 0, 0.2)` | Menu item / input borders |
| Text, secondary | `rgba(0, 0, 0, 0.6)` – `rgba(0, 0, 0, 0.75)` | Category labels, hint text, attribution, message-state body text |
| Shadow | `rgba(0, 0, 0, 0.15)` – `rgba(0, 0, 0, 0.2)` | See "Shadow" below |

### Category / marker palette (`lib/public-map/category-icon-meta.ts`)

A small fixed, accessible-contrast palette — one color+emoji pair per `CategoryIcon` enum value. Not a per-tenant setting; don't add a per-map color override at the UI layer.

| Category | Emoji | Color |
|---|---|---|
| FOOD | 🍴 | `#e2622a` |
| SHOPPING | 🛍️ | `#a24fc4` |
| SIGHTSEEING | 📍 | `#2f6fed` |
| HOTEL | 🏨 | `#0f8f7c` |
| STATION | 🚉 | `#5a5f66` |
| MUSEUM | 🏛️ | `#8a6d3b` |
| NATURE | 🌳 | `#2e8b3d` |
| ACTIVITY | 🎫 | `#d6a621` |
| INFORMATION | ℹ️ | `#1f78b4` |
| OTHER | 🔖 | `#6b7280` |

## Radius

| Value | Used for |
|---|---|
| `999px` (pill) | Bottom-menu items, small status pills (empty state, "my location" banner) |
| `12px` | Floating cards on desktop/tablet (POI detail, page overlay, search overlay) |
| `16px 16px 0 0` | Same cards, mobile bottom-sheet variant (top corners only) |
| `50%` | Round icon-only close buttons |
| `4px`/`8px` | Small inline controls — language selector, search input |

## Shadow

| Value | Used for |
|---|---|
| `0 4px 16px rgba(0, 0, 0, 0.2)` | Elevated floating cards (POI detail, page overlay, search overlay) |
| `0 1px 4px rgba(0, 0, 0, 0.15)` | Small on-map pills (empty state, location banner) |

## Type scale

Body font is the system stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. No webfont is loaded.

| Size | Weight | Used for |
|---|---|---|
| `1.05rem` | 700 | Card titles (POI name, page title) |
| `1rem` | 600 | Branding map name (`<h1>`), search input text |
| `0.95rem` | 600 | Search result name |
| `0.9rem` | 400 | Body copy — description, address, page content (`line-height: 1.4–1.5`) |
| `0.85rem` | 400/600 | Category label, hint text, search label, menu item text |
| `0.75rem` | 400 | Attribution footer, search result category, diagnostics |

## Spacing / sizing

- Card padding: `1rem 1.25rem` (desktop cards), `0.75rem 1rem 1rem` (search overlay).
- Card max width: `min(340px, calc(100% - 2rem))` for POI/page cards, `min(420px, calc(100% - 2rem))` for search — always leaves at least `1rem` of map visible on each side on desktop, goes full-bleed under the mobile breakpoint.
- Interactive control minimum: `44px × 44px` (WCAG-style tap target), even when the visible icon/box is drawn smaller (e.g. a 32×32px visual close button still has `min-width/min-height: 44px`).
- Breakpoints: `640px` (overlay layout: floating card ↔ bottom/top sheet), `480px` (branding/attribution padding only — not an overlay-layout breakpoint).

## Z-index stack

See the main SKILL.md "Layering" section — this is a behavioral model, not just numbers, so it's documented there rather than duplicated here. Quick reference: `1` branding header, `2` status pills + bottom menu, `3` POI/page detail card, `4` search overlay.
