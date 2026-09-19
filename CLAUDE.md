# Mendly

A stroke recovery and rehabilitation platform. It must feel like a thoughtfully made healthcare product, not a SaaS dashboard: calm, restrained, legible to someone working with limited motor control, cognitive fatigue, or visual processing difficulty.

Users may have hemiparesis, aphasia, reduced contrast sensitivity, or fatigue easily. Every decision below follows from that.

## Where the design system lives

The design system is a published artifact: https://claude.ai/code/artifact/8f349a7b-d790-4281-9aca-2cc363c746b1 (brand book at `project/README.md`, token reference at `project/api/tokens.md`, one README per component under `project/components/`).

- `src/styles/tokens.css` and `src/styles/bundle.css` are copied **verbatim** from the artifact's `project/tokens.css` and `project/components/bundle.css`. Do not edit them; re-copy them when the artifact changes.
- `src/styles/globals.css` holds page defaults and the few deliberate departures from `bundle.css` (listed below). Anything the product needs on top of the system goes there, not into the copied files.
- `bundle.css` is imported before `tokens.css` in `src/app/layout.tsx`, so the type classes win the font-family tie against `.rs-btn`. `tokens.json` is the source of truth for type.

## Non-negotiables

- Tokens are the only source of color, spacing, radius, shadow and type. Never write a raw hex, px gap, or font-size in a component. If a value seems missing, you are solving the problem wrong.
- Never add a color. If one is needed, the design system artifact changes first.
- Every interactive target is at least 48px tall.
- Every focusable element shows the focus ring: 3px solid `var(--focus-ring)`, offset 2px, set globally on `:focus-visible` in `globals.css`. Never write `outline: none`. Hover alone is never sufficient; this app will be driven by keyboard and switch access.
- Status is never color alone. It is a word, plus an icon with a distinct shape, plus color.
- No component library (no MUI, shadcn, Chakra). Components are written against the tokens and the `rs-*` classes.
- No emoji anywhere in the product UI. Icons are Lucide, regular weight, functional only.

## Palette

Two hue families on one warm neutral ramp.

- `canvas` grounds every screen. Most of the interface is `ink-900` on plain `canvas`.
- `surface-raised` + `radius-lg` + `shadow-resting` appear together exactly once per screen, on the primary session panel. Nothing else is elevated. (`shadow-resting` also sits on the top navigation.)
- Teal carries the product: `teal-900` for the nav and teal text at body size, `teal-700` for fills and large marks, `teal-600` for hover, `teal-100` for a pale positive or selected tint.
- Coral is spent on **one element per screen, maximum**: the featured action (`coral-600`, via `rs-btn-featured`). `coral-100` + `coral-700` is the attention tint for a genuine alert. If you can point to a second coral element on a screen, one of them is wrong.
- `coral-500` never carries text. `teal-700` never carries body-size text on a light ground; use `teal-900`.
- `border-divider` is decorative only (row hairlines, progress track). The moment a border carries meaning, such as an input edge, it is `border-control`.
- There is no caution family. "Attention, not alarm" is drawn in ink and told apart by its word and icon.

Test for any screen: delete coral from it entirely. It should still read as calm, complete and unmistakably Mendly.

## Typography

Families as `tokens.json` names them: Poppins for `display`, `h2`, `h3`, the body styles and the labels; Times New Roman for `h1`, which is why no page uses `.h1`: page headings use `.display` so no serif heading appears in a sans product; Public Sans (`--font-sans`) for `.rs-btn`, which loses the tie to `.label`. Poppins and Public Sans load through `next/font` in `layout.tsx`, at weights 400 and 600 only. Times New Roman is a system font and is not loaded.

Apply the type classes from `tokens.css` (`.display`, `.h1`, `.h2`, `.h3`, `.body-lg`, `.body`, `.body-sm`, `.caption`, `.label`, `.label-sm`). Never set an ad hoc font-size.

- Exactly one `.display` or `.h1` per page.
- Body text is never below `.body` (16px). `.body-lg` for anything a person must read to know what to do next. When unsure, pick it.
- 600 marks a heading or a label, never emphasis mid-sentence.

## Layout

Single column wherever possible, `max-width` around 720px for reading content. Today is the exception: 1080px, two columns (session on the left, week and today's exercises on the right) so all four answers sit above the fold, stacking below 900px. Spacing is the structuring device: reach for a larger `space-*` step before a border, a tint or a container. `--space-7`/`--space-8` between sections. Do not turn every piece of information into a card. No cards nested in cards, no card grids, no colored left borders.

## Motion

Transitions under 200ms, only on state changes the person triggered. Nothing animates on page load. Nothing bounces, pulses or loops. `prefers-reduced-motion` is handled in `globals.css`; do not override it.

## Voice

Write to the person, not about them. "You" and "your session," never "the patient." Short instructional sentences, present tense, one idea each. Numbers over adjectives: "3 of 5 exercises done" beats "great progress." A missed day is stated as fact, never as a lapse. Sentence case everywhere.

## Component inventory

The system defines six components (`Button`, `TopNav`, `ProgressBar`, `SessionCard`, `ActivityRow`, `Alert`), drawn by `rs-*` classes in `bundle.css`. The product wraps them in React and adds the ones the practitioner tool and the session need.

| Component | Notes |
|---|---|
| `Button` | `rs-btn-featured` (coral, one per screen, ever), `rs-btn-primary` (teal, the ordinary action), `rs-btn-secondary` (outlined), `rs-btn-text` (lowest emphasis). |
| `TopNav` | `rs-topnav` on `teal-900`, max five items, same order and place on every screen. Active item is marked with an `on-teal` underline, not the system's `coral-500`, so the featured action stays the only coral. |
| `SessionCard` | `rs-session-card`: the one raised panel. Eyebrow `body-sm` `teal-900`, title `h3`, description `body-lg`, one action. Accepts `action.href`, rendering the action as a link styled as the button, so a server-rendered card can start a flow. |
| `ActivityRow` | `rs-activity-row`. Rows, never a grid of cards. Filled teal circle with a tick when done, empty ring when pending; the status line says the state in words. |
| `ProgressBar` | `rs-progress`. One teal fill on one track, always with a count in words. At most one per screen. |
| `StatusTag` | Product addition. `positive` (teal), `alert` (coral), `caution` and `neutral` (ink), each with its own icon shape. |
| `Input`, `Select` | Product additions. 48px tall, `border-control` edge, label always visible above the field. |
| `Choice` | Product addition for the questions after a session and the rule editor. A radio group drawn as full-width rows; selected state is a tick plus a fill. |
| `AlertCard` | Product addition for the practitioner's alert feed. A row, severity as a word plus an icon shape, evidence always shown. |

Do not add components speculatively. No Toast, Avatar, Tabs, Modal, Skeleton or Card wrapper until a real screen needs one, and say so when you add it.

## Departures from bundle.css (all in `globals.css` or the component's module)

- Focus ring applied globally, not only to `.rs-focusable`.
- `.rs-btn-text` raised from 44px to 48px.
- TopNav active underline `on-teal` instead of `coral-500`.

## Interface profiles

Each patient account has a `ui_profile` (`patients.ui_profile`): `standard`, `aphasia` or `motor_visual`. Every patient page wraps itself, nav included, in `ProfileScope`, which sets `data-profile`. One set of components serves all three; never fork a component per profile.

- `standard` is the design system as drawn. It has no rules.
- `aphasia`: type one step up, more room between sections, an icon beside nav labels and section headings, and shorter copy (numbers, not clauses). Copy changes live in the page, keyed off the profile.
- `motor_visual`: type one step up, 64px (`space-8`) full-width targets, `ink-600`/`ink-700` re-pointed to `ink-900`, dividers drawn in `border-control`.

Global adaptations are in `src/styles/profiles.css`. Styles owned by a component module adapt in that module with `:global([data-profile="..."])`. Profiles re-use existing tokens only; they never add a value. The practitioner patient page shows which interface a patient sees.

## The practitioner side

Everything under `/practitioner` is a working tool rather than a calm surface: someone scanning a caseload between appointments needs density the patient app deliberately refuses. It is wider (1080px, with `TopNav wide`), uses tables, and puts several things on a screen. It uses the same tokens throughout, and the rules that exist for access rather than for calm (48px targets, focus rings, status never by color alone) apply there unchanged.

## Routes

`/` is Today for a signed-in patient and the public landing page (`src/app/Landing.tsx`) for anyone signed out. The sign-in form lives at `/sign-in`; `/login` permanently redirects there. Every protected page redirects a signed-out visitor to `/sign-in`. On teal grounds (the nav, the sign-in brand panel, marked `data-ground="teal"`) the focus ring is drawn in `on-teal`, since `ink-900` vanishes on `teal-900`.

## The dashboard

It answers four questions in this order and then stops:

1. What should I do today
2. How is my week going
3. What have I already done
4. What is next

No analytics, no stat grids, no charts. The rehabilitation session is the product; a dashboard is not.

@AGENTS.md
