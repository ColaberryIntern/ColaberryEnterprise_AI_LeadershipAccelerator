# frontend/CLAUDE.md
**Local conventions for the React + CRA + TypeScript frontend.** Root rules in `/CLAUDE.md` apply additively. This file covers only what is specific to working inside `frontend/`.

## Stack
- React 18 with hooks, TypeScript strict, CRA (`react-scripts`), Bootstrap 5 via CDN, react-router v6.
- Entry: `src/index.tsx`. Top-level layout: `src/App.tsx`.
- Run dev: `npm start` (from `frontend/`). Type-check: `npx tsc --noEmit`. Build: `npm run build`.

## Use the design skills
**Before writing any UI, invoke one of these:**

| Skill | When |
|---|---|
| `/baseline-ui` | Output the full design system reference (colors, tokens, component patterns) |
| `/frontend-design` | Generate any new page, component, or layout |
| `/fixing-accessibility` | WCAG 2.1 AA audit or fix |
| `/fixing-motion-performance` | Animation jank, slow renders, bundle bloat |
| `/ui-ux-design` | Strategic UX: research, wireframes, design review |

The skills encode the full design system (Bootstrap 5 utility-first, navy/blue palette, card patterns, accessibility rules). Do not reinvent them in CLAUDE.md.

## Directory map
| Path | Purpose |
|---|---|
| `src/pages/` | Top-level route components. One file per route. |
| `src/pages/admin/` | Admin-only pages (gated by `requireAdmin` middleware on the backend). |
| `src/pages/portal/` | Logged-in participant portal pages. |
| `src/components/` | Reusable UI. Folder per feature. |
| `src/components/Layout/` | Page chrome (sidebar, header, footer, breadcrumbs). |
| `src/routes/` | JSX fragment route trees: `publicRoutes.tsx`, `adminRoutes.tsx`, `portalRoutes.tsx`. Standalone routes go in `App.tsx`. |
| `src/services/` | Frontend API clients (axios-based). One file per backend feature area. |
| `src/contexts/` | React contexts (auth, theme, etc.). |
| `src/hooks/` | Custom hooks. One file per hook. |
| `src/utils/` | Pure utility functions, no React. |
| `src/styles/` | Global CSS, tokens. **Never hardcode hex values; use `var(--color-*)`.** |
| `src/features/` | Vertical-slice feature modules (newer pattern). |
| `public/` | Static assets served as-is. Includes `v1/track.js` (cross-site visitor tracker). |

## Required patterns
- **All props typed.** No `any`. Use `interface Props { ... }` above every component.
- **No custom CSS unless the class already exists in `global.css`.** Bootstrap utility classes first, then a tokenized custom class, never inline styles with hex values.
- **Accessibility is non-negotiable.** Focus indicators, 44×44px touch targets, reduced-motion respect, screen-reader text on icon-only buttons. See `/fixing-accessibility` skill.
- **No `dangerouslySetInnerHTML` without written justification.** Triggers a security review.
- **Use the existing axios client in `src/services/`** for backend calls. Do not call `fetch` directly from components.
- **Auth gating happens in `requireAdmin` / route guards**, not inside components.

## Forbidden
- **Never use `// eslint-disable-line react-hooks/exhaustive-deps`.** Production eslint config doesn't have the `react-hooks` plugin, so the disable comment itself causes a build failure. Use a stable derived value (e.g., a `filterKey` string) in the dependency array instead. See memory `Build Gotchas (CRITICAL)`.
- **Never call `process.env.SOMETHING`** outside `src/services/`. Env values flow through the api client.
- **Never import from `backend/`.** Frontend stands alone.
- **No new top-level src subdirs** without DRI sign-off.

## Testing
- Type-check (`tsc --noEmit`) is the minimum gate.
- Playwright E2E coverage lives in `/tests/systemV2` (root-level, not frontend-local).
- Component unit tests are aspirational; happy-path testing of new pages is encouraged but not gated.

## SPA routing gotcha
- `BrowserRouter` with **no basename**. Standard setup. `App.tsx` mounts the router; route trees are JSX fragments imported from `routes/`.
- Standalone routes (outside `PublicLayout`) go directly in `App.tsx`, NOT inside the fragment. Example: `/alumni-ai-champion`.

## Build manifest
Frontend changes that alter routes, components, or services should emit a `BuildManifest` to the portal. See root CLAUDE.md > Telemetry Synchronization Contract.

## Production build gotcha
Production CRA build runs `react-scripts build` with stricter eslint than local `tsc --noEmit`. Things that pass locally can fail in prod. The most common bite: see the "Forbidden" section above.
