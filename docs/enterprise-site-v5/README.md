# Enterprise site model — v5 (full site)

`index.html` is the standalone design model Ali supplied on **2026-11-15**.

## Provenance

| | |
|---|---|
| Source | `C:\Users\ali_m\Downloads\colaberry-enterprise-site.html` |
| Size | 1,185,952 bytes |
| md5 | `8fc9d341ff16009f3c29be510b3bf901` |
| Downloaded | 2026-11-15 09:21 (a second copy at 09:28 is byte-identical) |
| `file:///` references | **0** — this is the original download, not a "Save page, complete" capture |

**What changed from the download: nothing.** `index.html` is byte-identical to the
file Ali downloaded; the md5 above verifies it. Nothing in this folder is edited to
match the live site, and the live site is never edited to match this folder
automatically. See "How this file is used" below.

## How this file is used

Per Ali, 2026-11-14, about the preceding v4 model:

> "I want the updates of the site to be modeled off that but it is not a replacement"

That still governs. This is a **design model**: updates to enterprise.colaberry.ai are
modeled off it, section by section, with each change reviewed on its own. It is never
dropped in wholesale, and it is never deployed.

## What this is, and how it differs from v4

`docs/enterprise-site-v4/` is a **single-page** model (the home page only). This v5 file
is the **whole site** — 11 hash routes, of which 10 are pages and one is the artifact's
own site-map recommendation.

| Route | H1 | Height @1280px | Sections |
|---|---|---|---|
| `#/home` | We build, guide and train your company into AI. | 7,713px | 7 |
| `#/services` | Build. Guide. Train. | 4,978px | 5 |
| `#/services-build` | Build. | 5,211px | 7 |
| `#/services-guide` | Guide. | 5,192px | 7 |
| `#/services-train` | Train. | 4,422px | 6 |
| `#/how-it-works` | Find the ROI. Prove it. Roll it out, leader by leader. | 5,675px | 6 |
| `#/platform` | See your company move to AI, department by department. | 5,863px | 4 |
| `#/pricing` | One simple shape for each service. | 3,960px | 5 |
| `#/book` | Trust before intelligence. | 3,637px | 4 |
| `#/demo-pilot` | See AI run on one of your processes. | 1,687px | 1 |
| `#/sitemap` | 10 pages to change. Everything else stays. | 3,596px | 3 |

Measured off the live DOM on 2026-11-15 via Playwright (`channel: msedge`): **0 page
errors, 0 horizontal overflow, 8/8 images loaded on every route.**

## The site map the artifact itself proposes

The `#/sitemap` route is not decoration — it is an instruction list, reproduced here so
it is readable without opening the file:

| Current URL | New page | Action |
|---|---|---|
| `/` | Home | Rewrite |
| `/services` | Services | Rewrite |
| `/services/ai-opportunity-sprint`, `/services/claude-production-pilot`, `/services/enterprise-build-modernization` | Build | New — 3 merge into 1 |
| `/services/embedded-ai-operations` | Guide | New — replaces |
| `/services/workforce-architect-accelerator`, `/accelerator` | Train | New — 2 merge into 1 |
| `/how-it-works` | How it works | Rewrite |
| `/platform` | Platform | Rewrite |
| `/pricing` | Pricing | Rewrite |
| — | The book | New |
| `/contact`, `/lab` | Book a demo pilot | New — replaces both |

Explicitly **not** in this round: `/proof` (keep as is, per Ali), `/free-workspace` and
`/try` (keep), `/demo` (keep, restyle later), `/privacy` (keep). The segment pages
(`/higher-education`, `/enterprise`, `/workforce`, `/ecosystem`) are named as phase 2.

The artifact also requires **301 redirects from every merged or replaced URL**.

## Where the artifact's assumptions meet the real route tree

Checked against `frontend/src/App.tsx` and `frontend/src/config/v2Services.ts` on
2026-11-15, because a model's idea of the codebase is not evidence about it:

- **The five service pages are not five page components.** They are five data rows in
  `frontend/src/config/v2Services.ts`, all rendered by one dynamic route
  `/services/:slug` → `ServiceDetailV2`. Merging five into three is a config edit plus
  redirects, not three new page builds. The artifact's "3 pages merge into 1" overstates
  the work.
- **`/accelerator` is a real separate route** (`AcceleratorV2`), so folding it into Train
  genuinely does retire a page component.
- **`/lab` is a real separate route** (`OpportunityLabV2`), likewise.
- **`/start` already redirects to `/try`**, so the redirect pattern the artifact asks for
  already has precedent in this file.

## Conflict with what already shipped

PR #4043 (merged `482675229`, 2026-11-14) rebuilt `/pricing` around Build/Guide/Train
from the **v4** model, and deliberately **kept the license ladder** on that page, because
the `pricing.team` and `pricing.department` claims are approved in the claim registry for
`/pricing` only — declaring that route is what makes them publishable.

**This v5 `/pricing` has no prices on it at all.** Its subhead reads "No license fees
disguised as transformation", and its FAQ leads with "Why are there no prices on this
page?". Adopting it removes approved, governed prices from the site.

That is a positioning decision, not a layout one, and it is Ali's to make. It is raised
rather than resolved here.
