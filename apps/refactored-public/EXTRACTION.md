# Extracting refactored-public

What would have to move with this app if it were lifted into its own repository.

## Code it depends on

| Dependency | What for | On extraction |
|---|---|---|
| `packages/app-build` | The whole build: copy, token substitution, asset fingerprinting | Vendor it, or replace with any static toolchain |
| `packages/brand-system` | Validates `brand.config.js` | Vendor, or drop and validate inline |
| `packages/tracking-sdk` | `track-v2.js`, inlined into `dist/assets/` at build time | Ships *with* the app already, so an extracted copy keeps working |

`scripts/validate-app-boundaries.js` enforces that this list stays short: an app may
import from `packages/*` and nothing else. Not from `frontend/`, not from `backend/`, not
from another app.

## Runtime services it calls

Only the platform HTTP API, and only by URL — never by import.

| Call | Used by |
|---|---|
| `POST /api/leads/ingest?source=refactored&entry=platform_interest` | The contact form |
| Tracker endpoints in `track-v2.js` | Pageviews and CTA events |
| `/login`, `/signup` on `platformApiBase` | Workspace handoff links |

`platformApiBase` is a single config value. Repointing it at a different origin is the
whole of the work required to move the app off this platform's host.

## What stays behind

- `backend/src/services/pageCategoryMaps.ts` — behavioural categorisation of these routes
- `backend/src/seeds/seedLeadSources.ts` — the `refactored` source and its entry points
- `nginx/refactored-preview.conf` — hosting, which an extracted app would replace anyway

## What is not portable

Nothing. The app has no dependencies, no bundler, no framework and no build step beyond
copying files and substituting six tokens.
