# Refactored.ai — public site

The public product site for Refactored.ai: the operating platform for the agentic
workforce. Ten pages, no dependencies, no bundler.

## Build

```bash
npm run build          # emits dist/
```

`packages/app-build` copies `src/` to `dist/`, inlines the v2 tracker, substitutes
`{{brand.*}}` tokens and content-hashes every asset reference. No bundler — see the
comment at the top of `packages/app-build/index.js` for why that is a decision rather
than an omission.

## What is here

| Route | Purpose |
|---|---|
| `/` | The whole story: what the platform is, who it is for, how it is governed |
| `/platform/` | The operating model in business terms |
| `/ai-workforce/` | Managed AI employees, their limits, the accountability loop |
| `/software-factory/` | Customer problem to operated application |
| `/learning/` | Paths, projects, certification, portfolio |
| `/trust-before-intelligence/` | How Ram's book shapes the product |
| `/about/` | Origin, mission, recognition |
| `/contact/` | The one form on the site |
| `/privacy/`, `/terms/` | Legal |

## Where it is served

**`refactored-preview.colaberry.ai`**, and only there for now.

`refactored.ai` itself is not served from this repository and cannot be. The shared nginx
container terminates no TLS — every hostname in it listens on port 80 because Cloudflare
handles HTTPS in front — and `refactored.ai` is the one Colaberry domain that is *not*
behind Cloudflare. Pointing it at that container would refuse every HTTPS request.

The production path is S3 plus CloudFront with an ACM certificate, which gets TLS without
putting a Hetzner box in front of the domain. See
`docs/architecture/multi-tenancy/REFACTORED_CUTOVER.md`.

## Claims

`claims.json` records every public capability claim, its status and what it rests on.
**Only `verified` claims ship in the present tense.** `qualified` claims ship with their
hedge attached, `roadmap` must be visibly marked, and `prohibited` must not appear at all.

The register exists because a false capability claim is the one defect on a marketing
site that no test catches — the page renders perfectly and every check stays green.

Notably absent by policy: customer counts, revenue, placement or completion rates, market
size, performance benchmarks, security certifications, and named customers or logos.

## Conventions

- Every page is a directory with `index.html`. Every internal link must resolve to a
  shipped page — `backend/src/__tests__/appInternalLinks.test.ts` fails the build otherwise.
- **Adding a route means adding it to `backend/src/services/pageCategoryMaps.ts`.**
  A page missing from that map is categorised `other`, which is indistinguishable from a
  page nobody visited: no error, no warning, and the funnel silently scores zero.
  `brandPageCategories.test.ts` enforces it.
- Design tokens live in `src/assets/design/`. Colours come from tokens only, never
  literals, so both themes stay correct.
- `brand.config.js` carries stable slugs only. Never a tenant ID, brand ID or secret.
