# Mendly

A stroke recovery and rehabilitation platform. It must feel like a thoughtfully made healthcare product, not a SaaS dashboard: calm, restrained, legible to someone working with limited motor control, cognitive fatigue, or visual processing difficulty.

Users may have hemiparesis, aphasia, reduced contrast sensitivity, or fatigue easily. Every decision below follows from that.

## Non-negotiables

- `src/styles/tokens.css` is the only source of color, spacing, radius, elevation and type size. Never write a raw hex, px gap, or font-size in a component. If a value seems missing, you are solving the problem wrong.
- Never add a color. The palette is derived, not picked, so a new hex will not belong to it.
- Every interactive target is at least 48px tall.
- Focus is `var(--focus-ring)` on every interactive element, always, including custom controls. Hover alone is never sufficient; this app will be driven by keyboard and switch access.
- Status is never color alone. It is a word, plus an icon with a distinct shape, plus color.
- No component library (no MUI, shadcn, Chakra). Components are written against the tokens.
- No emoji anywhere in the product UI.

## Palette structure

Four hue families, derived in OKLCH. Three rules explain the whole thing:

1. **One temperature.** Every neutral is cut from one warm linen ramp at hue 88. There is no cool grey in this product. A cool grey will look broken here even at correct contrast.
2. **Loudness tracks rarity.** Chroma is a deliberate ladder: linen ~0.02, brand teal 0.065, caution ochre 0.09, clay accent 0.16. The loudest color is used least. Reaching for `accent` claims "most important thing on this screen," and two of those on one screen means one is wrong.
3. **Every family has the same three jobs.** `-wash` is a pale background that holds text, the base is a fill that carries no text, `-deep` carries text and icons and borders on light grounds.

Spending them: `surface` grounds every screen. `surface-raised` is spent on exactly one element per screen, almost always the session card. `brand` carries the product (nav, progress, completed marks, large headings). `accent-deep` is the single primary action per screen. `caution-deep` covers "attention, not alarm" so it never borrows the accent.

Test for any screen: delete `accent` and `caution` from it entirely. It should still read as calm, complete and unmistakably Mendly. If it falls apart, structure was leaning on color.

### Two footguns

- **`accent` carries no text at any size.** At its lightness neither `ink` nor `inverse` reaches 4.5:1 against it. Anything with a label uses `accent-deep`.
- **`line` is decorative only.** The moment a border carries meaning, such as an input edge, it is `line-strong`.

## Typography

One family, Libre Franklin, loaded from Google Fonts. Apply the type classes from `tokens.css` (`.display`, `.h1`, `.h2`, `.h3`, `.body-lg`, `.body`, `.body-sm`, `.label`, `.caption`). Never set an ad hoc font-size.

- Exactly one `.display` or `.h1` per page.
- `.body-lg` for anything read during a session. When unsure, pick it over `.body`.
- Avoid making everything bold. A screen with three bold elements has zero.

## Layout

Single column wherever possible, `max-width` around 720px for reading content. Whitespace is the structuring device, so use spacing before reaching for a border or a background change. `--space-6`/`--space-7` between sections. Do not turn every piece of information into a card.

Elevation: `--shadow-card` exists once, on the session card. Nothing else lifts. `--radius-lg` is reserved for that same card.

## Motion

Transitions under 200ms, only on state changes the person triggered. Nothing animates on page load. Nothing bounces, pulses or loops. `prefers-reduced-motion` is already handled in `tokens.css`; do not override it.

## Voice

Write to the person, not about them. "You" and "your session," never "the patient." Short instructional sentences, present tense, one idea each. Numbers over adjectives: "3 of 5 exercises done" beats "great progress." A missed day is stated as fact, never as a lapse. Sentence case everywhere.

## Component inventory

The design system defines exactly these, and they are the whole first release:

| Component | Notes |
|---|---|
| `Button` | `primary` (accent-deep fill, accent-press hover), `secondary` (brand outline), `ghost`. One `primary` per screen, ever. |
| `TopNav` | Flat brand bar, max five items. Active item is `inverse` text with an `inverse` underline. The accent stays out of navigation. |
| `SessionCard` | The core of the dashboard. `surface-raised`, `radius-lg`, `shadow-card`. Holds exactly one Button. |
| `ExerciseRow` | Rows, never a grid of cards. Number on `brand-wash` when pending, check on solid `brand` when complete. Separated by `line`. |
| `ProgressBar` | Track `brand-wash`, fill `brand`. Always prints its value as text. `milestone` switches the fill to `accent` and is honored only at 100. |
| `StatusTag` | One structure for four tones: `-wash` fill, `-deep` border, `-deep` text, distinct icon per tone. `positive` / `caution` / `alert` / `neutral`. |
| `Input` | 48px tall, visible 2px `line-strong` border, label always visible above the field, never a placeholder as label. |

Do not add components speculatively. No Toast, Avatar, Tabs, Modal, Skeleton or Card wrapper until a real screen needs one, and say so when you add it.

## The dashboard

It answers four questions in this order and then stops:

1. What should I do today
2. How is my week going
3. What have I already done
4. What is next

No analytics, no stat grids, no charts. The rehabilitation session is the product; a dashboard is not.

@AGENTS.md
