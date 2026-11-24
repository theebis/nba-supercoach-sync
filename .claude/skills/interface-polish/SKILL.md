---
name: interface-polish
description: Detailed interface polish rules (spacing, radii, shadows, typography, animation, accessibility, copy). Use whenever building, changing or reviewing any UI.
---

# Interface polish rules

Source: https://interfaces.dev/cheat-sheet (Jakub Krehel). Condensed into a checklist; open the source for the interactive demos.

## Surfaces and shape
- Nested rounded elements use concentric radii: outer radius = inner radius + the padding between them.
- Align optically, not just geometrically (icons, play triangles, text next to icons).
- A button with an icon gets slightly less padding on the icon side.
- Prefer a layered, low-opacity box-shadow for depth over hard borders where it reads cleaner.
- Images get a 1px outline offset -1px: white at ~8% opacity on dark themes, black at ~8% on light.
- Icon stroke weight matches the weight of the text beside it.

## Motion
- Animate from the trigger: set `transform-origin` toward the element that opened it (popovers, menus).
- Menus opened very often: no enter animation, animate only the close.
- Exits are subtler than entrances: shorter travel, fade with opacity (and a small blur, ~4px).
- Never `transition: all`; list the exact properties.
- Pressed buttons scale to 0.95-0.98 with `transition: scale 200ms ease-out` (or transform).
- Swapping icons: cross-fade, new icon scales 0.25 -> 1 with opacity 0 -> 1 and blur 4px -> 0.
- Use CSS transitions for interactive state (they can reverse mid-way); keyframes only for one-shot sequences.
- Disable transitions while switching theme.
- 1-2px jitter during animation: add `will-change: transform`.
- Stagger entering content in small groups, not one giant block and not item-by-item forever.
- No animation on page load unless it is deliberate.
- Frequent interactions (hover colour, row highlight) are instant or near-instant.
- Respect `prefers-reduced-motion`: wrap motion in `@media (prefers-reduced-motion: no-preference)`.

## Typography
- Web fonts as .woff2.
- `font-variant-numeric: tabular-nums` for prices, scores, counters and tables (skip if already monospace).
- Long text measure 60-75 characters.
- `text-wrap: balance` for headings, `text-wrap: pretty` for short descriptions.
- `overflow-wrap: break-word` for long IDs/links; `white-space: nowrap` for labels and badges.
- Root: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale`.
- Write copy in normal case; use `text-transform` for display uppercase.
- Smart punctuation: curly quotes, en dash for ranges (R6–R8), em dash for asides, a real ellipsis (…).
- Underlines: `text-underline-position: from-font; text-decoration-skip-ink: auto`.
- Anything truncated with an ellipsis must be readable in full via tooltip or expanded view.

## Colour
- Every palette step has a job (page bg, hover, border, solid fill, body text). No unused steps.
- Components use semantic tokens (`--text-secondary`, `--accent-solid`), never raw primitives.
- Name tokens by purpose, not by hue or location.
- Accent is reserved for the brand/primary action, never for body text.
- Check contrast against the surface directly behind the text.
- Dark mode is its own palette, not an inversion. Pick one theme switch mechanism.
- Gradients: `in oklab` for even brightness, `in oklch` for vivid middles.

## Accessibility
- Native elements: `<button>` for actions, `<a href>` for navigation.
- Style `:focus-visible`; never remove an outline without a replacement.
- `tabindex` only 0 or -1.
- Icon-only buttons need an `aria-label`; never `aria-hidden` on something focusable.
- Meaningful alt text; decorative images `alt=""`.
- Every input has a visible `<label>` and the right `type`/`inputmode`. Never block paste.
- Keep submit enabled until the request starts; validate on submit, `aria-invalid`, `aria-describedby`, focus first error.
- Hit areas at least 24x24px; 40x40 desktop / 44x44 touch where possible; never overlapping.
- Decorative glows get `pointer-events: none`.
- Hover styles inside `@media (hover: hover)`.
- `role="status"` for routine updates, `role="alert"` only for urgent errors.
- Never rely on colour alone for state; add an icon, label or sign (+/−).

## Layout
- `scroll-margin-top` on anchor targets under sticky headers.
- Space between groups is at least double the space between items in a group (e.g. 8px vs 16px+).

## Writing
- Buttons start with a verb ("Add to squad", "Run optimiser"); confirmations say what happens ("Remove player" / "Cancel").
- Use one label for "next step" throughout a flow.
- Links describe their destination.
- Consistent sentence case for buttons, headings and labels.
- Toggles are named for their ON state ("Show DNPs", not "Disable DNPs").
- Empty states explain what belongs there and offer one action to start.
- Speak to "you", not "the user".
