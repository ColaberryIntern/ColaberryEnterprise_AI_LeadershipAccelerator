# Career Pathways Network — Design System

CPN is a nonprofit (501(c)(3), separate legal entity from Colaberry) offering scholarships and career pathways. Three audiences: scholarship applicants, church/community partners, donors. The design stance: **dignity and access, not charity** — confident and warm, institutional enough for a donor deck, human enough for a scholarship form. It is built for cheap phones in poor lighting: highest contrast, no thin weights, large type and 44px+ tap targets.

## Source

Extracted verbatim from the multi-brand token project "Multi-Brand Tokens" (https://claude.ai/design/p/2b2c2e9d-f3d5-4194-a08b-e9f5b7e6af47?file=Multi-Brand+Tokens.dc.html&via=share), CPN brand only (per request; the other four brands — Refactored.ai, Colaberry Enterprise, Colaberry Training, AI Flotation — were deliberately excluded). Original artifacts preserved under `exports/`: `cpn.tokens.json` (token source of truth), `cpn.a.payload.json` / `cpn.b.payload.json` (contracts with measured contrast ratios).

Two approved directions ship as one system:
- **Grove (cpn-a, default)** — deep green `#1D6A4C`, Bitter headings, Atkinson Hyperlegible body, scale 17×1.333.
- **Vestry (cpn-b, `data-variant="vestry"`)** — violet `#6D4CA3`, Source Serif 4 headings, Public Sans body, scale 17×1.3.

Dark mode in both: `data-theme="dark"` on `<html>`. All five WCAG AA pairs are guaranteed in every scope (measured, see `guidelines/contrast.html`).

## Content fundamentals

- **Voice: dignified, plain language, direct — never charity tropes.** No pity imagery or language (no hands, hearts, outlines of people), no urgency theater, no exclamation marks.
- Plain declaratives with concrete commitments: "We will review it within 10 days. You can update your documents any time before review begins."
- First person for the reader's things ("My application", "View my application", "Start my application"); "we" for CPN's actions.
- Sentence case everywhere — headings, buttons, labels. No title case, no all-caps except tiny meta labels.
- Statuses are short and factual: "Saved." / "Heads up." / "Failed." — one bold word, then the fact.
- **No emoji, ever.**

## Visual foundations

- **Color:** warm off-white ground (`#FFFDF8`), one green accent used only for the primary action, active state and links. `accent-soft` (`#DFF0E6`) for badges, banners, hovers on secondary/ghost. Semantic green/amber/red reserved for alerts. Max surfaces: `bg` + `bg-elevated`; no other background colors, no gradients, no imagery system (none defined — flag before adding photography).
- **Dark mode** is tinted, not inverted: green-cast darks, `bg-elevated` *lighter* than `bg`, accents brightened to keep ≥3:1.
- **Type:** Bitter 700 for headings (slab, sturdy, real x-height), Atkinson Hyperlegible 400/700 for body at 17px/1.55. Scale: 14 / 17 / 23 / 30 / 40 / 54. Nothing below 14px, no thin weights.
- **Spacing:** 4px base — 4, 8, 12, 16, 24, 32, 48, 64. Page padding `clamp(16px, 4vw, 32px)`.
- **Shape:** one radius, 12px (cards 16px, badges pill). Borders are 1px `line` (`#DDD8CB`).
- **Elevation:** exactly one shadow, `0 1px 4px rgba(28,27,24,0.14)`, on cards and the primary button. No layered shadow system, no inner shadows, no blur/transparency effects.
- **Motion: "Steady — calm and unhurried; nothing startles."** fast 170ms (hover/press/toggles), base 280ms (menus/toasts/accordions), slow 420ms (modals/view changes). Enters rise 10px on `--ease-enter`; exits run at fast on `--ease-exit`; press scales to 0.985. `prefers-reduced-motion` collapses all motion (guaranteed in `tokens/motion.css`).
- **States:** hover darkens accent (88% mix black; lightens in dark mode), press darkens further (78%) and shrinks to 0.985; focus is a 3px 40%-accent ring; secondary/ghost hover fills `accent-soft`.
- **Layout:** fluid, single-column-first; grids `minmax(min(Npx,100%),1fr)`; breakpoints 640/768/1024/1280. One filled primary action per view.

## Iconography

The source defines **no icon set** — no icon font, no sprite, no emoji, no unicode-as-icon. The only mark is the logo (`assets/cpn-mark.svg`: three ascending pill steps + summit dot, drawn in token green; `assets/cpn-mark-mono.svg` is a currentColor derivative for dark/on-accent use). If icons become necessary, pick one open set with sturdy strokes (e.g. Lucide at stroke-width 2, sized ≥20px) and record the choice here first — do not mix sets or hand-draw glyphs.

## Components

Inventory is exactly the source's `.b-*` component contract (nothing invented): **Button** (primary / secondary / ghost / danger), **Field**, **Input**, **Card**, **Badge**, **Alert** (success / warning / danger), **Skeleton**. CSS classes live in `components/components.css` (verbatim from the generated stylesheets); React wrappers in `components/<group>/`.

Intentional additions: none. (Field/help/error are one source contract split across `Field` + `Input` for composability.)

## Index

- `index.html` — **start here**: landing + interactive explorer (specimen board, logos, login, email, live contrast audit, raw tokens, kit with one-click copies of CSS/guide/prompt/SKILL, UX laws). Vanilla HTML/JS, no build.
- `styles.css` — single import consumers link; pulls tokens, fonts, base, component CSS.
- `tokens/` — `colors.css` (all 4 scopes), `typography.css`, `spacing.css`, `motion.css`, `base.css`, `fonts.css` (Google Fonts, OFL — no binaries in repo).
- `components/` — `components.css` + `actions/Button`, `forms/Field`, `forms/Input`, `surfaces/Card`, `surfaces/Badge`, `feedback/Alert`, `feedback/Skeleton` (each with `.d.ts` + `.prompt.md` + specimen card).
- `guidelines/` — specimen cards: colors (accent, neutrals, semantic, dark, Vestry, contrast), type (headings, body, Vestry), spacing (scale, shape, responsive), motion, brand (mark, voice).
- `ui_kits/scholar-portal/` — interactive apply → status flow (demonstration composition; no product UI existed in the source — see its README).
- `emails/cpn-transactional.html` — table-based email identity (buttonHex `#1D6A4C`; Vestry `#6D4CA3`).
- `assets/` — `cpn-mark.svg` (token green), `cpn-mark-mono.svg` (currentColor), `cpn-mark-c2pa.svg` (original upload with provenance metadata — metadata breaks CSS masks, so pages use the clean copies).
- `exports/` — original token JSON + payload contracts from the source project.
- `SKILL.md` — agent-facing usage instructions.

## Rules (from the source contract)

1. Reference semantic tokens (`--bg`, `--accent`, …), never raw hex.
2. One filled primary action per view; accent marks only the primary action and active state.
3. Touch targets ≥ 44px; `fg-muted` is the lightest text allowed on `bg`.
4. Motion only via `--motion-*` / `--ease-*` (or `.b-enter`, `.b-pop`, `.b-skeleton`); never hand-pick durations.
5. Support `data-theme="dark"`; never ship light-only.
