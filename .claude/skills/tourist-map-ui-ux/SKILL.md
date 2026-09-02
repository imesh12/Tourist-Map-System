---
name: tourist-map-ui-ux
description: >-
  Guidance for UI/UX design and implementation on apps/tourist-web, the public
  tourist-facing map app — a map-first, premium-tourism experience where
  visitors browse POIs, search, filter by category, switch language, and read
  published pages as floating overlays on one persistent map. Use whenever you
  touch tourist-web UI: overlays/cards/panels, the bottom menu, search, POI or
  page detail, branding, marker/category styling, mobile/responsive layout,
  multilingual behavior, Figma-to-code translation, or accessibility — even
  when the request doesn't say "UI" explicitly, e.g. "add a favorites button",
  "the search overlay looks broken on mobile", "implement this Figma design".
  Captures conventions already established in the code, the product blueprint
  (§14–24), and this app's multilingual/publication architecture — read it
  before inventing a new pattern or touching language/publish behavior.
---

# Tourist-web UI/UX

`apps/tourist-web` is the public, unauthenticated map a tourist opens on their phone or a kiosk screen. It is the one app in this repo explicitly designed to feel *nothing* like the admin CMS (`apps/admin-web`) — no cards-and-shadows dashboard chrome, no dense forms, no deep navigation. The map fills the screen; everything else is a light, temporary layer on top of it. Keep that framing in mind for every change: the map is the interface, not the background for the interface.

## Product & design direction

This is a premium, modern Japanese tourism product — built for railway operators, hotels, municipalities, and destination organizations to put in front of their own visitors. It should read that way, not as an internal SaaS dashboard:

- **Map-first, mobile-first.** Most real visitors are on a phone, often one-handed, often outdoors. Design and test for that case first; large-display/kiosk is the secondary case, not the primary one.
- **Not a SaaS/admin aesthetic.** Avoid excessive cards, gradients, glassmorphism, drop shadows stacked on drop shadows, and general visual clutter — `apps/admin-web` is where that idiom belongs, not here (see the "Visual language" section below for the actual restrained token set already in use).
- **Strong hierarchy, deliberate whitespace.** One clear focal point per screen state (the map, or the one open overlay) rather than competing panels.
- **One-handed usability.** Primary actions (menu, search, close) should be reachable by a thumb near the bottom/edges of the screen, matching the existing floating-bottom-menu and bottom-sheet patterns.
- **The pieces should feel like one experience, not bolted-together features.** Search, categories, the bottom menu, POI/page detail, and the language selector should feel like different views into the same map, not five separate mini-apps — consistent visual language (see "Visual language" below) is what makes that true.
- **Excellent mobile bottom-sheet and desktop panel/card behavior** for whichever overlay shape a feature uses (see "Layering" and "Responsive pattern" below) — smooth open/close, correct focus handling, no layout jank, at both ends of the size range.
- **Respect device chrome.** Account for safe areas (notches, home indicators), the browser's own UI (address bar showing/hiding on scroll), and landscape orientation — a floating panel or bottom sheet that assumes a fixed viewport height will visibly break on a real phone.
- **Motion is subtle and optional.** Any transition/animation should be small, fast, and purposeful (e.g. a panel sliding in), and must respect `prefers-reduced-motion` — never a decorative animation a visitor can't turn off.
- **Accessible by default, not as an afterthought.** WCAG-conscious color contrast, semantic controls, full keyboard/focus behavior, and real screen-reader labels apply to every piece of this product — see "Touch and accessibility baseline" below for the concrete rules this app already follows.

## Before you build something new

1. Skim `apps/tourist-web/app/globals.css` and the component it's paired with — most new UI is a variation on an existing pattern (floating pill, floating card, bottom sheet, dialog overlay), not a new one.
2. Check whether the data you want to render actually exists on the published snapshot types (`shared-types`: `PublishedPoi`, `PublishedCategory`, `PublicationMenuItem`, etc.). See "Only use real data" below — this trips people up more than any visual detail.
3. If you're placing a new floating element, decide its z-index and screen position using the layering model below, don't guess a number.
4. If the task starts from a symptom ("X feels broken," "Y is hard to tap") rather than a specific change, read "Diagnose before you fix" below before writing anything.

## Design principles (blueprint §15)

The interface should be: **map-first, touch-friendly, simple, visual, multilingual, suitable for large public displays, responsive, fast, low-learning-curve.**

Avoid: complex navigation, deep page hierarchies, small controls, excessive text, admin-like UI, unnecessary map controls.

Concretely, that means: no new full-page routes for map-browsing features (overlays instead), no dense text blocks (short labels + icons), no control smaller than a comfortable tap target, and no feature that requires the tourist to learn a menu structure — everything reachable from the bottom menu or the map itself.

## Layering: everything floats over one map

`.tourist-map-body` (in `PublicMapShell`) is the positioning root — `position: relative`, and every overlay inside it is `position: absolute` relative to *that*, not the viewport. This is why the map stays visible and interactive behind every panel (blueprint §16: "avoid overlays covering the entire map unnecessarily"). Preserve this model — it's what keeps the product feeling like "one map," not a stack of separate screens.

Established z-index stack, low to high:

| z-index | What lives there |
|---|---|
| 1 | Branding header (`.tourist-map-branding`) — not inside `.tourist-map-body`, but establishes the header sits above the map canvas |
| 2 | Small status pills (empty state, "locating you…" banner) and the bottom menu — informational, always-present chrome |
| 3 | POI detail card / published page overlay — the "something is selected" layer |
| 4 | Search overlay — the one true modal-ish dialog (`aria-modal="true"`), so it sits above everything else |

When you add a new overlay, place it in this stack by what it *is*: a persistent status indicator → 2, a "the user selected something, show its detail" panel → 3, a focused task that should block interaction with the rest of the UI until closed → 4 (and treat it like the search overlay: real dialog semantics, Escape closes it).

New floating elements should size themselves relative to the map body (`min(340px, calc(100% - 2rem))` is the established pattern for cards, so they never touch the viewport edge on desktop but go full-bleed on narrow screens) rather than a fixed pixel width.

## Responsive pattern: CSS adapts, markup doesn't fork

Every existing overlay is **one component, one JSX tree**, with a single `@media (max-width: 640px)` block in `globals.css` that repositions it — a floating top-right card becomes a bottom sheet, a centered top panel becomes a full-width top sheet. There is no separate mobile component and no conditional rendering based on viewport width.

```css
/* Desktop/tablet: floating card, top-right */
.poi-detail-card { position: absolute; top: 1rem; right: 1rem; width: min(340px, calc(100% - 2rem)); border-radius: 12px; }

/* Mobile: same markup, becomes a bottom sheet */
@media (max-width: 640px) {
  .poi-detail-card { top: auto; right: 0; left: 0; bottom: 4rem; width: 100%; border-radius: 16px 16px 0 0; }
}
```

Follow this for any new panel: write the desktop floating-card rule first, then add the mobile override in the existing `@media (max-width: 640px)` block rather than opening a new breakpoint or a new component variant. It keeps behavior (focus handling, ARIA, event handlers) identical across screen sizes, which is what actually matters for a tourist switching between a phone and a kiosk.

Keep this pattern **unless it's genuinely impossible** for what you're building — e.g. an interaction that has no sane mobile analog at all, not just "the mobile CSS is a little fiddly." If you hit that case, say so explicitly rather than quietly forking a second component.

The narrower `@media (max-width: 480px)` block exists only for the always-present branding/attribution chrome (tightened padding) — it's a separate, smaller concern from the 640px overlay-layout breakpoint.

## Visual language

Full token reference (colors, radii, shadows, type scale, with the reasoning behind each) lives in `references/design-tokens.md` — read it before hand-picking a new color or spacing value. The short version:

- Plain CSS in `app/globals.css`, no Tailwind, no component library, no CSS-in-JS. Class names are `.component-part` (e.g. `.public-search-input`, `.poi-detail-close`) — dashes, prefixed by the owning component, matching the existing file.
- **Reuse an existing token before introducing a new one.** Colors, radii, shadows, spacing, tap-target sizes, and breakpoints are all a small, closed set today (see the reference doc) — before writing a new value, check whether one already does the job. This is the single most consistent gap seen between careful and careless changes here: a new accent color where the existing one would do, a new 48px tap-target size where 44px was already the rule, a duplicated CSS block where an existing class already matched. None of these are hard failures on their own, but each one is a small crack in "one consistent map experience."
- White or near-white surfaces (`#fff` solid for cards, `rgba(255,255,255,0.92–0.95)` for translucent chrome sitting directly on the map).
- Pills (`border-radius: 999px`) for anything transient/status-like sitting on the map (bottom menu items, empty-state banner). `12px` for floating cards. `16px` on the top corners only for mobile bottom sheets.
- One accent color, `#2f6fed` — used for the focus ring (`outline: 2px solid #2f6fed; outline-offset: 2px` on every focusable overlay control) and as the default/sightseeing marker color. Don't introduce a second accent color for a new feature (including things that "feel like they should be red," like a favorite/heart control); reuse this one or pick from the existing category palette in `lib/public-map/category-icon-meta.ts`.
- Selected/pressed state uses a dark neutral pill (`#111827` background, white text), not the accent color — that's reserved for focus and default markers.
- System font stack only (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`) — no webfont has been introduced, and none should be without a reason (load cost matters more here than in the admin app: this is what a tourist's phone loads over hotel wifi).
- Don't duplicate CSS when an established reusable class already produces the same visual result — extend or reference the existing rule (e.g. reuse `.public-search-result` for another "row in a list you tap to select" UI) rather than writing a parallel, near-identical rule set under a new name.

## Touch and accessibility baseline

Every interactive control in tourist-web hits a real accessibility bar, not just a visual one — because the actual user is often on a phone, in sunlight, sometimes not a fluent reader of the map's default language. Match these on anything new:

- **44×44px is the established minimum tap target**, on every button/control, even when the visible glyph is smaller (`min-width`/`min-height: 44px` alongside a smaller visual size — see `.poi-detail-close`, `.public-search-close`, `.public-search-input`, `.public-menu-item`). Treat it as a floor, not a starting point to vary from by feel: going larger needs an actual UX reason tied to the specific control (e.g. a documented mis-tap problem in that exact spot), not "a bit bigger seemed nicer" — an unexplained 48px where every sibling control is 44px is a new, undocumented sub-token, not a real design decision.
- **Real semantic elements**, never a styled `<div>` standing in for one: headings are `<h1>`/`<h2>`, triggers are `<button type="button">`, selects are `<select>`, form fields have a `<label htmlFor>`.
- **Dialog roles matched to actual blocking behavior**: the POI detail card and page overlay use `role="dialog" aria-modal="false"` (the map behind them is still usable) with `aria-labelledby` pointing at the real heading. Search uses `role="dialog" aria-modal="true"` because it's the one overlay meant to hold focus, plus `Escape` to close.
- **Focus moves on open** to the control that makes sense first — the close button for a detail card (so a keyboard user immediately has an escape hatch), the input for search (so they can start typing).
- **`aria-pressed`** is reserved for genuine toggle/filter state (the bottom menu's category buttons, including "All"). One-shot actions (opening search, requesting location, opening a page) never get `aria-pressed` — don't add it just because a button is inside the same menu.
- **Focus-visible ring** (`#2f6fed`, 2px, 2px offset) on every overlay control — it's centralized as one selector list in `globals.css`; add new selectors to that list rather than writing a one-off `:focus` rule.
- **Color contrast is a real constraint, not a visual afterthought** — check new text/icon-on-background combinations against WCAG AA before shipping them, especially anything translucent sitting directly on map imagery.
- Decorative icons (category emoji) are `aria-hidden="true"` and always paired with real visible text — never an icon-only control.

## Diagnose before you fix

When a task is framed as a symptom rather than a code change — "the close button is hard to tap," "search feels broken on mobile," "this looks off" — read the actual current implementation before changing anything. Don't assume you already know the cause from the description alone, and don't rewrite or re-derive working behavior (a tap-target rule, a focus-visible ring, a responsive breakpoint) from scratch just because a symptom was reported near it — check whether it's already correct first, and if it is, look for what's *actually* still wrong instead.

A reported symptom can have more than one real, independent cause — e.g. "hard to tap" can be an actual undersized/shrinkable target on one hand, and a target that's the right size but visually has no boundary (fully transparent background, so a user can't see what to aim at) on the other. Both are real; fixing only the one you guessed first and stopping isn't the same as diagnosing the report. Prefer the smallest change that addresses the actual observed defect over broad, speculative rewrites of working code.

## Only use real data — never fake it

This rule is about honesty with data, not about refusing to build features. Follow this order when a task involves showing something that might not exist yet:

1. **Never fabricate, hardcode, simulate, or visually imply data that isn't real production data** — no invented rating stars, opening hours, phone numbers, review counts, wait times, gallery images, etc., and no disabled/dead button implying a capability that doesn't exist either. "So the layout looks complete" is never a reason to fake something.
2. **Inspect the actual published/public data contract first**, before writing any UI for a field — `PublishedPoi`, `PublishedCategory`, `PublicationMenuItem`, etc. in `shared-types`. Don't assume a field exists just because a request or a mockup implies it should.
3. **If the field genuinely doesn't exist yet**, decide whether a proper end-to-end implementation is in scope for what's being asked:
   - **If it is in scope** — extend the real system: `shared-types` → `validation` → the admin form → the admin API route → the publish-snapshot builder → the public component, the same way `address`/`description` are already threaded through today. This is the *correct*, encouraged outcome when a request implies real new capability — it makes the data genuinely real instead of faking it, and doing nothing when a proper implementation was reasonably in scope is not actually the safer choice.
   - **If the extension is out of scope** for the current checkpoint/request (e.g. a UI-only task, or a change that needs a product/data-ownership decision beyond what was asked), stop and explain the dependency — say specifically what's missing and roughly what a real implementation would require — rather than silently doing nothing, and never fake the field instead.
4. **Never render fake placeholder production data just to make a UI look finished.** A visibly absent field, or an explicit note that the capability isn't built yet, is always more honest than a fabricated value.

The bottom menu follows the same spirit structurally: it renders *exactly* the published menu projection (already ordered, already enabled/disabled-filtered) plus the one "All" reset control this app adds itself — never a second, independently-computed filter UI alongside it. If a new feature wants "browse by category," it almost certainly belongs as a `PublicationMenuItem` the admin configures, not a new hardcoded control.

## Multilingual & public-architecture invariants

These are contract guarantees the tourist-facing app depends on, not just UI conventions — treat them as invariants to preserve, not defaults to casually change. If a task seems to genuinely require touching one of these, say so explicitly and flag the tradeoff rather than changing it as a side effect of an unrelated UI task.

- **Supported public content languages**: `ja`, `en`, `zh-CN`, `zh-TW`, `ko`, `fr`, `es` — the closed registry in `shared-types/src/language.ts` (`PUBLIC_CONTENT_LANGUAGE_CODES`). Any new UI text must read correctly in all seven, not just English.
- **Design for length, never a fixed width.** Translated strings vary substantially in length and glyph width across these seven languages — never hardcode a pixel width sized to English text; use flexible layout (`min()`, `flex`, `overflow-wrap`, wrapping labels) the way every existing overlay already does, and sanity-check a new UI element against a noticeably longer label, not just the English string you tested with.
- **Language resolution order is fixed**: an explicit, valid `?lang=` → the visitor's browser-preferred language (`Accept-Language`) → the publication's own `defaultLanguage` — implemented once, in `lib/public-map/language-selection.ts` (`resolveInitialLanguage`). Never re-derive this order ad hoc elsewhere; call the existing function.
- **`supportedLanguages`/`defaultLanguage` always come from the immutable publication snapshot, never the live map draft.** `LanguageSelector`'s own doc comment is explicit about this — tourist-web has no code path that reads draft language configuration at all, and none should be added.
- **Draft changes stay invisible to tourists until Publish, and a published snapshot is immutable once created.** Publishing again creates a new version; it never mutates the one a tourist might already have open (`docs/architecture/PUBLISHING_ARCHITECTURE.md`; the publication type's own doc comment: "A publication document is immutable after creation... must create version 2, not modify version 1").
- **Tenant isolation is structural, not something UI code re-implements.** Every server mutation resolves its target map through the caller's own trusted context, never a client-supplied id — there is no tourist-web code path that reads or could leak another tenant's data. Never accept a `mapId`/`customerId` from a query param or prop and trust it for anything beyond routing.
- **Never render private/internal identifiers.** `sourceType`, `providerPlaceId`, `customerId`, `mapId`, Firestore paths, and internal timestamps are not present on `PublishedPoi`/`PublishedCategory` to begin with — if a task seems to need one of these on the public side, that's a sign it needs a product decision, not a quick UI addition.
- **`GOOGLE_PLACES`-imported POIs are immutable except `status`** (the admin POI form's `readOnlyExceptStatus`). This doesn't directly change tourist-web UI, but it means an imported POI's other fields (name, address, hours, etc.) can't be admin-edited — a public-side feature that assumes every POI field is freely admin-curated may not hold for imported ones.

## Content safety

Any user/admin-authored free text (page content, descriptions) renders as plain text — `white-space: pre-wrap` on escaped text is the established way to preserve authored line breaks. Never `dangerouslySetInnerHTML`, regardless of how the content is stored upstream.

## Testing hook

Every interactive or structurally meaningful element carries a `data-testid` (component-scoped, e.g. `public-menu-category-${categoryId}`, `poi-detail-close`). Add one to anything new in the same style — tests and future components rely on being able to select by these rather than CSS classes or text content.

## Working from Figma

Figma MCP is connected for this project. Use it when there's an approved Figma frame/design to work from — it's the visual source of truth for that design, not a screenshot to eyeball.

- Read structured layout/component/token data through MCP (design context, variables, etc.) rather than approximating from a screenshot — the actual spacing/color/type values in the file matter more than a visual guess at them.
- Never paste MCP-generated markup directly into `apps/tourist-web`. Translate the approved design into this app's existing conventions — plain CSS in `globals.css`, the class-naming/layering/responsive/token patterns described above — the same way any other new UI here gets built. Figma output is a reference to translate from, not a diff to apply.
- Before implementing, compare the proposed design against current functionality (search, categories, menu, POI/page detail, language selection, the accessibility behavior above) so nothing quietly disappears in the translation — a redesign that drops a working feature is a regression, even if that wasn't the point of the change.
- A design proposal may be created or refined *in* Figma when explicitly requested (e.g. "mock this up in Figma first") — don't push changes to Figma just because the MCP connection happens to be available and the task touches UI.
- For a request that amounts to a major visual redesign with no existing approved design to work from, stop after research and a design proposal, and get explicit approval before changing any application UI — "make it feel more premium" is a design conversation to have first, not license to start rewriting components.

## Process: respect tool/permission denials

If an action is blocked by a security or permission guardrail — a tool refuses a write, a command is denied — don't route around it through a different tool to achieve the same effect; that defeats the guardrail regardless of intent. Stop and ask for approval, or use an explicitly permitted method instead. (This came directly out of this skill's own benchmark: a `Write` call was refused for a filename that looked like a self-generated report, and the run worked around the refusal via a shell heredoc rather than stopping — even though the file was a legitimate, explicitly requested deliverable, tunneling around a denial through another tool is the wrong response regardless of how reasonable the underlying goal is.)

## Where the "why" comes from

Deeper product rationale for tourist-web's UI lives in the blueprint (`Tourist Map System — Final System Blueprint v1.0.md`, §14 "Tourist Web UI/UX" through §24 "Place Search/Import"), `docs/architecture/PUBLISHING_ARCHITECTURE.md` for publish/versioning behavior, and in the component doc comments themselves, which cite specific checkpoint/spec sections (e.g. "checkpoint 1B.10 §11"). Those doc comments are usually the fastest way to find *why* a given constraint exists — read the nearest one before overriding an existing pattern. If you can't find a rationale and a change seems like it'll fight one of these conventions, flag the tension to the user rather than silently picking a side (e.g. the blueprint's §18 mockup shows a left-side 35–40%-width detail panel on large screens, while the shipped code uses a top-right floating card instead — that's a real, already-made product decision, not an oversight, so match the shipped pattern unless told otherwise).
