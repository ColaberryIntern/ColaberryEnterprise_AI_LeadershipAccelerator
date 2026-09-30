# Colaberry Design System

**Make the best UI the easiest UI for an agent to generate.**

A working design system that humans, developers, and AI coding agents can all read from — built
end-to-end for **Colaberry, the School of Data Science & Analytics**. Not a static style guide, but a
running, branded system where every token, color, and component in the docs is the same code that
ships to production.

[Live landing](index.html) · [Living docs](design-system.html) · [Brand guide](BRAND.md) · [Implement](IMPLEMENTATION.md) · [Deploy](DEPLOY.md)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS Variables](https://img.shields.io/badge/CSS-Custom_Properties-1572B6?logo=css3&logoColor=white)
![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![GSAP](https://img.shields.io/badge/GSAP-ScrollTrigger-88CE02?logo=greensock&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-WebGL-000000?logo=three.js&logoColor=white)
![WCAG 2.2](https://img.shields.io/badge/WCAG-2.2_audited-77BB4A)
![Built with Claude](https://img.shields.io/badge/Built_with-Claude-D97757)
![License: MIT](https://img.shields.io/badge/License-MIT-FB2832)

---

## What this is

This repo turns the Colaberry brand into an **executable UI language**.

A designer owns the source of truth (brand, logo, voice); a developer imports one stylesheet and a
component bundle; an AI agent reads the same files through a documented skill and generates UI that
snaps to the system on the first try. The docs site you see is built from the very tokens and
components it documents — change a token, every surface updates.

It walks the full pipeline end-to-end:

```
Brand style guide + logo  →  Claude  →  vector logo + token foundation
                                      →  20 React components + living docs
                                      →  GSAP / Three.js landing  →  static host
```

---

## How it was built (the AI-driven workflow)

Strategy, brand direction, and every design decision were **owned and directed by the designer**;
**Claude (Anthropic)** ran as the executing agent for each step.

| # | Step | What happened |
|---|---|---|
| 1 | **Source brand** | Colaberry School style guide + logo PNGs (cherry mark, wordmark) |
| 2 | **Rebuilt the mark** | Traced the raster logo into clean art + a full favicon / app-icon / OG export set |
| 3 | **Token foundation** | palette → neutral → semantic → typography → spacing → radius → motion → data-viz → breakpoints (245 tokens, light + dark) |
| 4 | **Real components** | 20 React primitives wired to those tokens, each with `.d.ts` types + usage prompt |
| 5 | **Applied the brand** | Cherry `#FB2832` · Leaf `#77BB4A` · Berry `#367895` · Roboto + Roboto Mono + Quicksand |
| 6 | **Living docs + landing** | Scroll-spy docs site, WCAG audit, and an awwwards-style GSAP + Three.js landing page |
| 7 | **Shipped** | MIT license, GitHub Pages workflow, hand-off + prompting guides |

---

## The three-layer architecture

**1 · Design layer (source of truth)**
`BRAND.md` + `assets/` (logo lockups, marks, favicons, OG cards, fonts). Where the designer edits;
token names map 1:1 to CSS variables.

**2 · Code layer (developer-consumable)**
- `styles.css` — single entry point; `@import`s the token + font layers.
- `tokens/colors.css` — Cherry / Leaf / Berry 10-step ramps + neutrals + semantic aliases + **data-viz palette** + dark theme.
- `tokens/typography.css` — Roboto / Roboto Mono / Quicksand ramps, weights, line-heights.
- `tokens/spacing.css` — 4px grid, radius, shadow, motion, **breakpoints + 12-col grid**.
- `tokens.json` — all 245 tokens (+ dark overrides) for Style Dictionary / Figma Tokens / Tailwind.
- `components/core/*` — 20 primitives (`.jsx` + `.d.ts` + usage prompt + live card), bundled to `_ds_bundle.js`.

**3 · Agent layer (LLM-consumable)**
`SKILL.md` + the living docs + `IMPLEMENTATION.md` + the built-in prompt templates. What an AI agent
reads to generate on-brand UI — start any request with *"Using the Colaberry design system, …"*.

---

## What's inside

- **245 design tokens** — light + dark, every value a semantic CSS variable; exported as `tokens.json` for tooling.
- **Data-visualization palette** — categorical (8) + sequential + diverging chart scales, color-blind safe, theme-aware.
- **Design principles**, responsive **breakpoints + 12-col grid**, and accessibility guidance beyond contrast (keyboard, focus, touch, semantics).
- **20 accessible components** — Accordion, Avatar, Badge, Breadcrumb, Button, Card, Carousel,
  Checkbox, Dialog, Drawer, Input, Pagination, Popover, Progress, Skeleton, Switch, Table, Textarea,
  Toast, Tooltip.
- **Full logo system** — color / mono-white / mono-black marks + lockups, app-icon tile, `favicon.ico`,
  apple-icon, 192/512 icons, square + OG / GitHub social cards.
- **A marketing-website UI kit** — Home · Program · Enroll, composed only from the components.
- **WCAG 2.2 contrast audit**, logo do/don't rules, and **hand-off + prompting guides** for marketing,
  designers, and developers.

---

## Repo structure

```
index.html              Awwwards-style landing (GSAP + Three.js)
design-system.html      Living docs — tokens, live components, a11y audit, logo rules, hand-off
styles.css              Global entry point (@imports only)
landing.css / landing.js  Landing-page styles + motion engine

tokens/
├── colors.css            Cherry / Leaf / Berry ramps + neutrals + semantic + data-viz + dark theme
├── typography.css        Roboto + Roboto Mono + Quicksand ramps
├── spacing.css           4px grid · radius · shadow · motion · breakpoints · layout grid
├── fonts.css             @font-face / font loading
└── base.css              Element defaults built on the tokens

components/core/         20 primitives — <Name>.jsx + .d.ts + .prompt.md + card HTML
guidelines/cards/        Foundation specimen cards (color, type, spacing, brand)
templates/               Fork-ready starting points, grouped by use-case:
                         Web      — Web Page
                         Social   — Social Post
                         Deck     — Deck Slide
                         Print    — Brochure · One-Pager · Comparison Sheet · Certificate
                         Sales    — Case Study · Proposal/Quote · Business Card
                         Email    — Email Newsletter
                         Event    — Event Poster · Standee
ui_kits/marketing-website/  Home · Program · Enroll click-through

assets/
├── logo/                 Marks, lockups, mono variants + export/ (favicons, app icons, OG)
├── fonts/                Font licenses (Apache-2.0 / OFL-1.1)
└── avatars/              Sample portraits

BRAND.md                Brand rules, voice, color, type, motion, accessibility, prompting
IMPLEMENTATION.md       Developer install guide (HTML · React / Vite / Next)
DEPLOY.md               Push & host (GitHub Pages · Netlify · Vercel · Cloudflare)
SKILL.md                Agent-Skill wrapper for Claude / Claude Code
_ds_bundle.js           Generated UMD bundle of all components
```

---

## Running locally

Any static server works — there's **no build step**.

```bash
git clone https://github.com/<your-account>/colaberry-design-system.git
cd colaberry-design-system
npm start            # → http://localhost:3000   (alias for: npx serve .)
```

### Routes

| Route | What you'll see |
|---|---|
| `index.html` | Landing — animated hero, color, type, components, examples, get-started |
| `design-system.html` | The full living system (scroll-spy nav + light/dark toggle) |
| `design-system.html#colors` | Color ramps + semantic tokens (click to copy) |
| `design-system.html#components` | All 20 components, live & interactive |
| `design-system.html#a11y` | WCAG 2.2 contrast audit |
| `design-system.html#handoff` | Hand-off + prompting guides |
| `ui_kits/marketing-website/index.html` | Marketing site recreation (Home · Program · Enroll) |

---

## Using it in a project

```html
<link rel="stylesheet" href="styles.css">      <!-- tokens + fonts -->
<script src="_ds_bundle.js"></script>           <!-- components on window.ColaberryDesignSystem_098454 -->
```

Reference **semantic tokens** (`var(--brand-accent)`, `var(--surface-page)`, `var(--text-strong)`),
never raw hex. Set `data-theme="dark"` on `<html>` for dark mode — the cherry accent stays constant.
Full steps (plain HTML, React/Vite/Next): [`IMPLEMENTATION.md`](IMPLEMENTATION.md).

---

## Brand foundations (at a glance)

| | |
|---|---|
| **Cherry Red** `#FB2832` | Primary action / the constant accent |
| **Leaf Green** `#77BB4A` | Growth / secondary |
| **Berry Blue** `#367895` | Trust / links / the wordmark |
| **Type** | Roboto (display + body) · Roboto Mono (data) · Quicksand (logotype only) |
| **Shape** | Rounded & friendly — pill buttons, 12–32px card radii, 4px grid |
| **Voice** | Warm, inclusive, emoji-free; speak to "you"; lead with proof |

Full brand rules, motion, and accessibility live in [`BRAND.md`](BRAND.md).

---

## Deploy

Push to GitHub and enable Pages — a workflow is included at `.github/workflows/deploy.yml`:

```bash
git init && git add . && git commit -m "Colaberry Design System v1.0"
git branch -M main
git remote add origin https://github.com/<your-account>/colaberry-design-system.git
git push -u origin main
```

Then **Settings → Pages → Source: GitHub Actions**. Works equally on Netlify, Vercel, or Cloudflare
Pages with no build step. Full guide: [`DEPLOY.md`](DEPLOY.md).

---

## What's next — the 30-60-90 roadmap

**30 days · Foundation** ✅ *shipped in this repo*
- ✅ Token foundation (palette + neutral + semantic + type + space + motion), light + dark.
- ✅ Vector logo system + full favicon / app-icon / OG export set.
- ✅ 20 accessible components with `.d.ts` types and usage prompts.
- ✅ Living docs, WCAG 2.2 audit, awwwards-style landing, hand-off + prompting guides.

**60 days · Build**
- Add Storybook for component-by-component browsing.
- Extract `tokens/` + `components/` into a publishable `@colaberry/design-system` npm package.
- **LLM component manifest** — machine-readable JSON of every prop, state, and import path.
- Self-host fonts; add a second UI kit (the LMS / course dashboard).

**90 days · Integrate & govern**
- **MCP server** exposing the manifest so any Claude / agent session can pull the system in-IDE.
- Quality gates: token lint, axe for a11y, visual-regression, dependency scanning.
- Contribution workflow — RFC → PR → designer signoff → release.
- Pilot integration with a first Colaberry product app.

---

## Quality gates (five-gate model)

| Gate | Tool | Catches |
|---|---|---|
| Token lint | Style Dictionary / Tokens Studio | Hardcoded hex / spacing values |
| A11y | axe + Playwright | Contrast, focus, semantic labels |
| Visual regression | Chromatic / Percy | UI drift across components |
| Security | SAST + dependency scan | Unsafe inputs, vulnerable deps |
| Designer signoff | PR review | Pattern fit, UX intent |

---

## License

| What | License |
|---|---|
| Source code in this repo | **MIT** — see [`LICENSE`](LICENSE) |
| Roboto + Roboto Mono fonts | Apache License 2.0 |
| Quicksand font | SIL Open Font License 1.1 |
| Colaberry logo & brand assets | © Colaberry, Inc. — use outside Colaberry requires permission |

---

## Credits

**Designed & directed by Mohammad Abdul Aleem** — AI/UX Designer & Analyst · 12+ years in UI/UX,
product strategy, and design-to-code workflows.
[behance.net/uxaleem](https://behance.net/uxaleem) · Hyderabad, India · He/Him

Brand, design direction, and review owned by the designer; code execution via **Claude (Anthropic)**
as the executing agent — built as a working demonstration that the canvas is becoming executable:

```
Brand + voice  →  Claude  →  CSS tokens + React components  →  living docs + landing  →  static host
```

> *Designers aren't cooked. They're cooking.*
