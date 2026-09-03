# AI Flotation Design System

AI Flotation LLC is an AI consulting service: **workflow intake to delivered system**. A client books a scoping call, the team maps the workflow and names the bottleneck, then ships an automated system. The brand sells competence, not inspiration. Support: support@aiflotation.com.

This system was extracted from the **Multi-Brand Tokens** project (https://claude.ai/design/p/2b2c2e9d-f3d5-4194-a08b-e9f5b7e6af47?file=Multi-Brand+Tokens.dc.html — five brands; only AI Flotation was taken, per user instruction). The source shipped two token variants for this brand; both are included here:

- **Forge (Option A, default)** — Space Grotesk headings / Archivo body, rust accent `#BA430E`, radius 2px, near-flat sharp shadow. `:root` default.
- **Harbor (Option B)** — Manrope throughout, teal accent `#0E6E63`, radius 6px, softer shadow. Opt in with `data-variant="harbor"` on `<html>`.
- **Dark mode** — both variants: `data-theme="dark"` on `<html>`. All five AA contrast pairs are guaranteed in every mode (measured ratios lived in the source `exports/` payloads: e.g. Forge light fg-on-bg 16.3, accent-on-bg 5.0).

Source artifacts consumed: `tokens/ai-flotation.json`, `dist/ai-flotation-a.css`, `dist/ai-flotation-b.css`, `dist/ai-flotation-{a,b}.brand.md`, `exports/ai-flotation.{a,b}.payload.json`, `emails/ai-flotation.html`, `assets/logo/ai-flotation-mark.svg`. The source project's github repo (aleemcolaberry/Colaberry-DS-School-Final) fed only the Colaberry brands, not this one.

## CONTENT FUNDAMENTALS

Voice: **confident, spare, concrete; sells competence, not inspiration.**

- Short declarative sentences. No exclamation marks, no hype adjectives, no filler.
- Concrete specifics over abstractions: "30 minutes, Thursday 2:00 CT. We will map the workflow and name the bottleneck." — times, counts, deliverables.
- First person plural "We" for the company; direct address "you" for the client.
- Sentence case everywhere — headings, buttons, badges. Never Title Case or ALL CAPS (badges may use caps only as a 12px label style).
- Button labels are verbs or verb phrases: "See prep notes", "Book a scoping call".
- Headlines state facts or outcomes, not slogans: "Scoping call booked", "Workflow intake to delivered system".
- **No emoji.** No decorative punctuation. Ellipses and em dashes used sparingly.
- Body copy stays under ~2 lines per block; the layout carries the rest.

## VISUAL FOUNDATIONS

- **Color:** one accent per variant (Forge rust / Harbor teal) doing all the work. Warm paper-grey background (`--bg`), white elevated surfaces (`--bg-elevated`), near-black warm ink (`--fg`). **One filled primary action per view; accent marks only the primary action + active state.** `--accent-soft` is the only tint — hover washes, badges, selected states. Semantic green/gold/red reserved for status. Reference semantic tokens (`--bg`, `--accent`, …), never raw hex.
- **Type:** Forge pairs Space Grotesk (headings, 700) with Archivo (body 400/500/600); Harbor is all Manrope. Scale 16px × 1.3: 13 / 16 / 21 / 27 / 35 / 46. Body line-height 1.55, headings 1.2. Display type may clamp() between the h1/h2 steps in fluid layouts.
- **Spacing:** 4px base steps (4, 8, 12, 16, 24, 32, 48, 64). Page padding `clamp(16px, 4vw, 32px)`. Breakpoints 640/768/1024/1280. Grids use `minmax(min(Npx,100%),1fr)`. Touch targets ≥ 44px always.
- **Shape:** Forge is sharp — 2px radius on controls, 6px on cards (`calc(var(--radius) + 4px)`); Harbor rounds to 6px/10px. Badges are the one pill (999px).
- **Elevation:** a single hairline-and-shadow system: 1px `--line` border + one small shadow (`0 1px 2px rgba(20,18,16,0.30)` Forge; softer for Harbor). No layered/inner shadows, no glows.
- **Backgrounds:** flat token colors only. No images, gradients (except the skeleton shimmer), textures, patterns, or illustration. No blur/transparency effects; overlays use color-mix washes.
- **Cards:** elevated white surface, hairline border, small shadow, radius+4, 20×22px padding.
- **Motion:** decisive — crisp, immediate, no flourish. fast 80ms (hover/press/toggles), base 140ms (menus/toasts/accordions), slow 210ms (modals/view changes). Easing standard `cubic-bezier(0.3,0,0,1)`, enter `(0.16,0,0,1)`, exit `(0.4,0,1,1)`; exits run at fast with the exit curve. Enter = 5px rise + fade (`.b-enter`, `.b-pop`). Never hand-pick durations — use the tokens. `prefers-reduced-motion` collapses all motion (guaranteed in `tokens/motion.css`).
- **Hover:** filled controls darken (`--accent-hover`, 88% mix toward black; toward white in dark mode); quiet controls wash with `--accent-soft`. **Press:** darken further (`--accent-press`) + scale 0.99 at 40ms. **Focus:** 3px soft accent ring (`--focus-ring`), `:focus-visible` only.
- **Imagery:** none in the source. No photography direction exists — leave image slots out rather than inventing.

## ICONOGRAPHY

The source defines **no icon system**: no icon font, no SVG set, no emoji anywhere (email and components are icon-free). The only mark is the logo (see below). Until the brand adopts a set, follow the source: communicate with text, color, and the badge/alert components; unicode glyphs (·, →, ×) may serve as functional affordances. If an icon set becomes unavoidable, use Lucide at 1.5px stroke (closest neutral match to the brand's geometry) and flag it — that is a substitution, not brand canon.

**Logo:** the "float over waterline" mark — a circle above two rounded rules — proposed in the source round (no prior logo existed). Color only via tokens: rust on light (`assets/ai-flotation-mark.svg`), or `currentColor`/white variants (`-current`, `-white`). Lockup: mark + "AI Flotation" wordmark in the heading font, 700. Never redraw or distort the geometry.

## Index

- `index.html` — **the token explorer + docs**: Start here, Specimen, Logos, Login, Directions, Contrast audit, Tokens, Kit, Email, UX laws — the full source experience, AI Flotation only.
- `styles.css` — global entry (@imports only); link this one file.
- `tokens/` — `colors.css` (Forge/Harbor × light/dark), `typography.css`, `spacing.css`, `motion.css` (+ `.b-enter`/`.b-pop`/`.b-skeleton`), `fonts.css` (Google Fonts @import — OFL; source ships no binaries).
- `base/` — `base.css` (body/headings/links), `components.css` (the source's `.b-*` classes: btn, field, input, card, badge, alert).
- `assets/` — `ai-flotation-mark.svg` (rust), `-current.svg`, `-white.svg`.
- `components/core/` — React primitives mirroring the `.b-*` inventory: Button, Field, Input, Card, Badge, Alert, Skeleton.
- `guidelines/cards/` — foundation specimen cards (Design System tab).
- `ui_kits/marketing/` — landing page. `ui_kits/portal/` — client intake portal.
- `emails/` — transactional email (recreated verbatim from source).
- `SKILL.md` — agent skill entry point.

**Intentional additions** (not in source): the `data-variant="harbor"` switching attribute (source shipped two separate stylesheets; one file with a scope keeps both usable), and the React wrappers themselves (source was CSS-only). The component inventory adds nothing beyond the source's `.b-*` classes.

**Caveats:** fonts load from Google Fonts CDN (OFL) exactly as the source instructs — no binaries were shipped to copy. The UI kit screens are new compositions (the source contained no product screens); they use only source components, tokens, and voice.
