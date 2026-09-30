# EXTRACTION.md — Career Pathways Network

What must travel with this application if it is ever lifted out of the ecosystem
repository. Source code is the easy half; the database rows below are the half teams
forget, and an app whose `lead_sources.slug` nobody remembers becomes un-extractable.

## App-owned source

```
apps/cpn-public/
├── package.json
├── brand.config.js
├── build.js
├── README.md
├── EXTRACTION.md
└── src/
    ├── index.html
    ├── scholarships/index.html      form: scholarship_interest
    ├── how-funds-work/index.html
    ├── partners/index.html          form: community_partner_interest
    ├── support/index.html           form: champion_interest
    ├── about/index.html
    ├── privacy/index.html
    └── assets/
        ├── site.css                 imports design/, holds page styling
        ├── forms.js                 shared ingest handler for all three forms
        └── design/                  vendored CPN token set + DESIGN_SYSTEM.md
```

Routes are directories because nginx resolves them that way
(`try_files $uri $uri/ $uri.html`). A page added as `src/<slug>.html` rather than
`src/<slug>/index.html` will resolve, but at `/slug` without the trailing slash, which is
not the URL the rest of the site links to.

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
| `POST /api/leads/ingest?source=cpn&entry=<entry>` | lead capture |
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
| `cpn` |

**Brand**

| tenant | slug |
|---|---|
| `cpn` | `cpn` |

**Lead source**

| slug | notes |
|---|---|
| `cpn` | must carry `tenant_id` + `brand_id`; `slug` is the stable identifier the tracker sends |

**Entry points**

| slug | entry_type | relationship_type |
|---|---|---|
| `scholarship_interest` | form | `scholarship_prospect` |
| `community_partner_interest` | form | `community_partner_prospect` |
| `champion_interest` | form | `champion_or_donor_prospect` |

**Brand domains**

CPN's domain is `opportunitylift.org`, **not** `cpn.org`. The nonprofit does not own
`cpn.org` — it resolves to a different Cloudflare account — and mail as `@cpn.org` could
never have authenticated, because SPF and DKIM can only be published for a domain you
control. `opportunitylift.org` was registered under CPN's own Cloudflare account on
2026-08-31, kept separate from Colaberry's and AI Flotation's because the nonprofit's
independence is a donor and grant commitment.

| hostname | purpose |
|---|---|
| `opportunitylift.org` | web |

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
   `cpn`/`cpn`.
4. Submitting an email that already exists under another brand does **not** create a
   second canonical lead.
5. An operator of another tenant cannot read this brand's leads (expect 404).
