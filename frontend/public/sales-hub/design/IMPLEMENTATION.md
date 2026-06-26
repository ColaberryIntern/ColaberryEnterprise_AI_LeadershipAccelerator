# Implementing the Colaberry Design System

A practical install-and-build guide for developers. Pair it with `BRAND.md` (rules &
voice) and the live `design-system.html` (token reference + WCAG audit).

> **TL;DR** — Link `styles.css` for tokens + fonts. Use the components from
> `_ds_bundle.js` (plain HTML) or by importing `components/core/*` (React build).
> Reference **semantic tokens**, never raw hex. Toggle dark with `data-theme="dark"`.

---

## 1 · What you're installing

| Path | What it is | Required? |
|---|---|---|
| `styles.css` | Entry point — `@import`s all tokens + fonts | **Yes** |
| `tokens/` | The CSS custom properties (color, type, spacing, motion) | yes (via styles.css) |
| `assets/logo/` | Logo lockups, marks, favicons, OG cards | as needed |
| `components/core/` | 20 React primitives (`.jsx` + `.d.ts`) | for React builds |
| `_ds_bundle.js` | Auto-generated UMD bundle of all components | for plain-HTML use |
| `BRAND.md` | Brand rules, voice, motion, accessibility | reference |

The component public API lives on the global **`window.ColaberryDesignSystem_098454`**
(plain HTML) or as named exports (React import).

---

## 2 · Install

Copy the design-system files into your project (e.g. into a `colaberry/` folder):

```bash
# from the design-system project root
cp -r styles.css tokens assets components/core  your-project/src/colaberry/
# plain-HTML projects also want the generated bundle:
cp _ds_bundle.js  your-project/public/colaberry/
```

> Tip: you only need `components/core/` **or** `_ds_bundle.js`, depending on the path below.

---

## 3 · Path A — Plain HTML / no build step

```html
<!doctype html>
<html lang="en" data-theme="light">
<head>
  <link rel="stylesheet" href="colaberry/styles.css">
  <!-- React (pinned) + the component bundle -->
  <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
  <script src="colaberry/_ds_bundle.js"></script>
</head>
<body>
  <div id="app"></div>
  <script>
    const { Button, Card, Badge } = window.ColaberryDesignSystem_098454;
    const e = React.createElement;
    ReactDOM.createRoot(document.getElementById('app')).render(
      e(Card, { padded: true },
        e(Badge, { tone: 'green', dot: true }, 'Enrolling'),
        e('h3', null, 'Data Analytics'),
        e(Button, null, 'Apply now')
      )
    );
  </script>
</body>
</html>
```

No React at all? You can still use just the **tokens + CSS classes** — link `styles.css`
and style your own markup with the custom properties (see §6).

---

## 4 · Path B — React + a bundler (Vite, CRA, Next.js)

The components are plain `.jsx` with `import React from 'react'` and a **named export** —
drop them straight into your `src/`:

```jsx
import 'colaberry/styles.css';                 // tokens + fonts (once, at app root)
import { Button } from 'colaberry/components/core/Button';
import { Card }   from 'colaberry/components/core/Card';
import { Input }  from 'colaberry/components/core/Input';

export function Enroll() {
  return (
    <Card padded accent="red">
      <h3>Apply to Colaberry</h3>
      <Input label="Email" type="email" placeholder="ada@email.com" />
      <Button fullWidth>Request info</Button>
    </Card>
  );
}
```

- **Types:** each component ships a `.d.ts`, so props autocomplete in TypeScript.
- **No CSS imports needed per component** — each injects its own styles on first render,
  all driven by the tokens in `styles.css`.
- **Next.js:** import `styles.css` in `app/layout.tsx` (App Router) or `_app.tsx` (Pages).
  Components are client components — add `"use client"` where you use them.

---

## 5 · Available components

`Button` · `Badge` · `Card` · `Avatar` · `Input` · `Textarea` · `Checkbox` · `Switch` ·
`Accordion` · `Breadcrumb` · `Pagination` · `Tooltip` · `Popover` · `Progress` ·
`Skeleton` · `Toast` · `Table` · `Dialog` · `Drawer` · `Carousel`

Props for each are in its `components/core/<Name>.d.ts`; live demos are in the
**Components** section of `design-system.html`.

---

## 6 · Use semantic tokens (never raw hex)

```css
.my-panel {
  background: var(--surface-card);
  color: var(--text-body);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  padding: var(--space-6);
}
.my-panel h2 { color: var(--text-strong); font-family: var(--font-display); }
.my-cta     { background: var(--brand-accent); color: var(--text-on-accent); }
```

Key semantic tokens: `--surface-page/-card/-sunken`, `--text-strong/-body/-muted`,
`--border-subtle/-default/-strong`, `--brand-accent` (cherry, constant), `--status-*`,
`--space-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--dur-*`. Full list: open
`design-system.html` → **Color / Spacing** (click any token to copy).

---

## 7 · Dark mode

Every token re-points automatically. Flip one attribute on `<html>`:

```js
document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
```

The cherry accent stays constant; foreground/surfaces invert. No component changes needed.

---

## 8 · Motion & accessibility (build it in)

- Use the motion tokens for transitions: `transition: background var(--dur-fast) var(--ease-out);`
  Components already do this and respect `@media (prefers-reduced-motion: reduce)`.
- **Body text:** use `--neutral-800` / `--text-muted` on light. Cherry and leaf are
  **accent / large-text** colors — for small text use `--red-600+` / `--green-700+`, or
  dark text on a tint. (See the WCAG audit in `design-system.html`.)
- Keep the visible focus ring (`--focus-ring`) — it's on by default via `:focus-visible`.

---

## 9 · Text & wrapping

Linking `styles.css` gives you sensible wrapping out of the box — no extra work for normal copy:

- **Headings** use `text-wrap: balance` (even line lengths) and break long words.
- **Paragraphs & list items** use `text-wrap: pretty` (no orphans / ragged last lines).
- **Long words & URLs** wrap instead of overflowing (`overflow-wrap: break-word` on `body`).
- **Media** (`img`, `svg`, `video`) is capped at `max-width: 100%` so it never overflows.

Opt-in helper classes for the cases the defaults don't cover:

| Class | Use it for |
|---|---|
| `cb-balance` | Force balanced wrapping on a hero headline |
| `cb-pretty` | Pretty wrapping on a specific block |
| `cb-nowrap` | Keep something on one line (labels, badges) |
| `cb-break` | Force-break an unbroken string (long token / ID) |
| `cb-truncate` | Single-line ellipsis (`…`) |
| `cb-clamp-2` / `cb-clamp-3` | Clamp to 2 / 3 lines with ellipsis |
| `cb-min0` | On a flex/grid child so its text wraps instead of overflowing |

> **The #1 landing-page wrapping bug:** a flex row whose text child won't shrink. Flex items
> default to `min-width: auto`, so long text overflows. Add `cb-min0` (or `min-width: 0`) to the
> flex child and the text wraps correctly.

```jsx
<h1 className="cb-balance">Future-proof your career in data &amp; AI</h1>
<div style={{ display: 'flex', gap: 12 }}>
  <Avatar name="Mika R." />
  <p className="cb-min0">Long description that should wrap, not overflow its flex row…</p>
</div>
```

---

## 10 · Fonts

Roboto + Roboto Mono + Quicksand load from Google Fonts via `tokens/fonts.css`. To
**self-host** (recommended for production): drop the `.woff2` files into `assets/fonts/`
and replace the `@import` in `tokens/fonts.css` with local `@font-face` rules. Licenses:
`assets/fonts/LICENSES.md` (Apache-2.0 / OFL-1.1).

---

## 11 · Build it with Claude (optional but fast)

Point **Claude Code** (or a Claude chat with this project attached) at the folder and ask:

> *"Using the Colaberry design system, build [a page / a section / a component] —
> [describe it]. Use the Button/Card/etc. components and semantic tokens, link
> `styles.css`, and support dark mode."*

Claude reads the tokens, components, and `BRAND.md` and scaffolds on-brand UI.

---

## Install checklist

- [ ] `styles.css` linked once at the app root (tokens + fonts load)
- [ ] Components available — `_ds_bundle.js` (HTML) **or** imported from `components/core/` (React)
- [ ] UI references **semantic tokens**, not raw ramp values
- [ ] `data-theme="dark"` wired to your theme toggle
- [ ] Body text passes contrast (red-600+/green-700+ for small text)
- [ ] Fonts self-hosted for production (optional)
- [ ] Logo + favicons pulled from `assets/logo/` (+ `export/`)
