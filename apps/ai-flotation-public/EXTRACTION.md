# EXTRACTION.md — AI Flotation

What must travel with this application if it is ever lifted out of the ecosystem
repository. Source code is the easy half; the database rows below are the half teams
forget, and an app whose `lead_sources.slug` nobody remembers becomes un-extractable.

## App-owned source

```
apps/ai-flotation-public/
├── package.json
├── brand.config.js
├── build.js
├── src/index.html
└── EXTRACTION.md
```

## Workspace dependencies

| Package | Why |
|---|---|
| `packages/app-build` | static build (copy + token substitution + tracker inline) |
| `packages/brand-system` | brand config contract and its validator |
| `packages/tracking-sdk` | v2 tracker, inlined into `dist/assets/` at build time |

No dependency on `apps/*`, `frontend/*` or `backend/*`. Enforced by
`scripts/validate-app-boundaries.js`.

## Backend API contracts consumed

| Endpoint | Use |
|---|---|
| `POST /api/leads/ingest?source=ai-flotation&entry=<entry>` | lead capture |
| `POST /api/t/event` | pageview, cta_click, form_start, form_submit |
| `POST /api/t/identify` | signed `jx` cross-domain journey token |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `PLATFORM_API_BASE` | `https://enterprise.colaberry.ai` | moves to the neutral tracking host with no code change |

## Database rows this app depends on

**Tenant**

| slug |
|---|
| `ai-flotation` |

**Brand**

| tenant | slug |
|---|---|
| `ai-flotation` | `ai-flotation` |

**Lead source**

| slug | notes |
|---|---|
| `ai-flotation` | must carry `tenant_id` + `brand_id`; `slug` is the stable identifier the tracker sends |

**Entry points**

| slug | entry_type | relationship_type |
|---|---|---|
| `workflow_intake` | form | `b2b_build_prospect` |
| _(none yet)_ | | |

**Brand domains**

| hostname | purpose |
|---|---|
| `aiflotation.com` | web |

**Sender profile**

Seeded as `draft`. Promotion to `active` requires the domain health check to pass;
until then `assertCanSendLive` blocks live sends for this brand.

## Deployment assumptions

- Static hosting. `npm run build` emits `dist/` with no server-side runtime.
- The shared platform backend is deployed **once** for the whole ecosystem. Extracting
  this app does not mean extracting a backend.
- DNS is not pointed by the foundation project. The domain's `activation_state` tracks
  readiness; nothing here fakes DNS success.

## Tests required after extraction

1. `npm run build` succeeds with no workspace `node_modules` present.
2. `npm run validate:boundaries` passes.
3. A form submission creates one canonical `Lead` and one `LeadTenantContext` for
   `ai-flotation`/`ai-flotation`.
4. Submitting an email that already exists under another brand does **not** create a
   second canonical lead.
5. An operator of another tenant cannot read this brand's leads (expect 404).
