# CC-20261115-w8q3 — Colaberry Enterprise brand, and the government page

Two pieces of work from one session, in order.

---

## 1. The public site was painting the wrong brand

`enterprise.colaberry.ai` was rendering the career school's accent. Every
primary button, pill, active state and accent rule on the public site was cherry
`#FB2832`, which is the **Colaberry Training** accent.

The Colaberry Enterprise design system says the opposite in its own file,
`apps/colaberry-enterprise-design/src/assets/design/tokens/colors.css`:

> "Brand constants — logo artwork only; UI surfaces never use these directly"
> "Accent marks only the primary action + active state."

with `#2E6A86` as that accent.

### Why it had never been applied

The system is vendored and kept current automatically by
`.github/workflows/design-system-sync.yml`, but it lands outside `frontend/src`,
and the frontend is plain `react-scripts` 5.0.1 with no craco config, so
`ModuleScopePlugin` refuses the import. The sync registry records this exact
problem and leaves it open, ending: *"The CRA question is untouched."*

### What was built

`frontend/src/styles/enterprise-brand.css`, one scoped block, **introducing no
new hex value**. The blue ramp in the Colaberry token layer the app already
loads *is* the enterprise accent family, step for step:

| Colaberry ramp | value | Enterprise role |
|---|---|---|
| `--blue-600` | `#2E6A86` | `--accent` |
| `--blue-50` | `#EAF2F6` | `--accent-soft` |
| `--blue-300` | `#6F9DB6` | dark-theme `--accent` |

Scoped to `.cbv2-shell`, the wrapper `PublicLayoutV2` renders around every
public V2 page and nothing else, so the portal and admin keep cherry.

### It is also a contrast upgrade

Cherry is 3.85:1 on white and fails AA for normal text, which is why a
`--cherry-text` workaround existed. The enterprise accent is 5.96:1, so one
accent serves both jobs. On dark bands `#6F9DB6` beat the light cherry it
replaced on every ground measured (5.95 vs 5.56 on `#1a1a1a`, 6.55 vs 6.12 on
`#0b0f18`).

### Two places that were not a find-and-replace

`platformV2` encoded *who acts* as berry blue for the human and cherry for the
AI — and berry **is** the enterprise accent, so re-pointing the cherry would
have painted human and AI identically and destroyed the distinction the row
exists to make. The AI kept the accent, the human moved to strong ink,
`.is-system` kept muted grey. Same collision on the `.is-accent` / `.is-blue`
pills. On the home department map, "Demo pilot" took the accent and "Next
leader" moved to neutral, because the accent on dark and that light blue were
near neighbours and accenting work that has not started implied otherwise.

### Deliberately untouched

Status colours (function, not brand identity, and the enterprise success 4.26:1
and warning 4.10:1 steps do not reach AA for normal text on white), focus tokens
(a rebrand should not quietly thin a focus ring), and the logo, which stays
cherry exactly as the enterprise system prescribes.

### Verification

- `enterpriseBrandTokens.test.ts`, 9 tests, every guard mutation-tested until
  red: import removed, scope widened to `:root`, a mapping dropped, a bare
  cherry hex written, the upstream accent moved.
- The first draft of the import check **passed while the import was commented
  out** — `toContain` matched the text inside the comment. It strips comments
  now. Same defect this repo already found in `shell.test.tsx`, where two footer
  assertions passed while both links 404'd.
- Frontend `tsc` clean; `CI=true react-scripts build` clean.
- Computed colours read from a real browser on the built bundle and then on
  production: inside the public shell every brand token resolves to `#2e6a86`,
  while at the document root on `/portal/login` and `/admin` they are all still
  `#fb2832`. Same document, two brands, correctly separated.
- `docs/screenshots/2026-11-15-enterprise-brand/` — nine before/after pairs and
  `BRAND_REVIEW.html`.

PR #4072, merged, deployed and verified live.

---

## 2. The government page

Ali supplied `colaberry-government-page.zip`: a public page for contracting
officers that shows the services from Admin › Our Services by NAICS code,
capability and industry.

### The premise in the request was wrong, and it mattered

> "When our services are updated, they automatically update here similar to
> Case Studies."

**Case studies do not auto-update.** They pin an approved snapshot and show
nothing until someone republishes. `caseStudyPublicStore.ts` says so in as many
words: *"a sync that wrote a new draft snapshot this morning is invisible until
somebody republishes."*

So "automatically" and "similar to Case Studies" pointed in opposite directions.
Asked as a standout question rather than assumed. **Ali chose live reads, gated
by the link he confirms.**

### Phase 1 — `GET /api/public/services` (PR #4074, merged)

No publish button: the page reads the catalog on every load. What keeps
unfinished work off it is that a service earns a **card** only when it is
`active` **and** at least one case-study link is `confirmed` — already a
deliberate act in the admin. Services with no confirmed proof still appear in a
quieter "in preparation" list.

A separate router rather than an admin route with the guard removed, because the
admin payload carries the evidence score, the inside/outside split and the
Gov-match counts. The tenant comes from `lookupGovContractsContainer()`, which
resolves the fixed slug `refactored`, creates nothing and fails closed.

**Measured against production first, read-only. The design package was wrong in
four places, each of which would have shipped:**

| Package assumed | Production holds |
|---|---|
| 4 families | **6** — plus Consulting and Training. A hardcoded four would have hidden four services. |
| "inside" studies open in a tab | **None of the 36** linked studies is published on the enterprise surface. That was 36 dead links. |
| scope bullets and past performance exist | No scope column; `past_performance` empty on all 14. |
| PSC codes are a placeholder | Already populated for **7** services. |

Also found: production holds `Energy` **and** `energy` as separate industry
values, which would have rendered as two entries in one filter. Grouping is
case-insensitive with counts summed.

No second lead endpoint: `POST /api/leads` already exists, is rate limited,
dedupes by email and records consent, so the request form uses it with a
`form_type`, exactly as `/demo-pilot` does.

### Phase 2 — the page (this change)

Hosted as a real file at `frontend/public/government/index.html` and served at
`/government/` by the existing SPA `try_files $uri $uri/` rule, so **no nginx
change was needed** — which also keeps this out of escalate-tier config changes.

The design package's renderer is kept intact. It runs top-level and
synchronously while the catalog arrives over the network, so rather than
restructure 165 lines of working rendering code it became `GOV_RENDER()`, called
once the data is in. That keeps the diff against the package readable, which
matters because the package is the design reference.

**There is no sample-data fallback, deliberately.** If the request fails the page
says so and offers an email address. A government page that quietly rendered
invented case studies would be a fabricated proof claim, which is worse than an
outage.

Fifteen scripted edits, each asserting its anchor occurs exactly once so a
silent no-op is impossible.

### Placeholders: removed, not filled

The package shipped ten visible `[Add]` / `[Confirm]` chips. UEI, CAGE, SAM.gov
status, business size, set-aside certifications, contract vehicles and state
registrations are legally consequential claims that nobody here can source, and
a bracketed to-do in front of a contracting officer is worse than one fewer row.

- UEI and CAGE chips removed from the hero, with a restore note.
- Contract vehicles / set-asides / state registrations replaced by one honest
  line: "Sent with the capability statement, matched to your solicitation."
- "Firm-fixed-price, T&M or milestone-based `[Confirm]`" softened to "Contract
  structure discussed per solicitation", because which contract types Colaberry
  accepts is a commercial commitment nobody confirmed.
- `GOV_REGISTRATION` near the foot of the page is empty; fill a value and its
  row appears in the capability statement.
- PSC codes come from the database, so they were never a placeholder.

**Still needed from Ali:** UEI, CAGE, SAM.gov status and expiry, business size,
set-aside certifications, contract vehicles, state and local registrations, and
the contract types offered.

### The nav item is an anchor, not a Link

`V2_NAV` gained an `external` flag. A `<Link to="/government/">` would be
handled by react-router, match no `<Route>`, and render the 404 for a page that
exists on disk — broken nav while typing the same URL works.

`linkIntegrity.test.tsx` holds external items to the stronger version of the
same promise: the file must exist on disk under `public/`. The dead-link sweep's
exemption is granted by the **filesystem**, not a hardcoded list, so it cannot
excuse a typo. Mutation-tested: changing the path to `/goverment/` fails both
tests.

### Verification

Browser run against the page served with a stub whose payload is built by the
**real** `buildPublicCatalog`, from fixtures shaped like production:

- 8 cards on the grid (its own page size), 5 in preparation
- families from the API: All, AI, Consulting, Data, IT, Staffing, Training
- all four public tier labels render, so the re-keyed `TIER` map is correct
- the family filter really filters: AI 2, Data 4, IT 2, Staffing 1, and
  Consulting and Training 0 — which is right, since neither has a service with
  confirmed proof yet, and the page's own empty state handles it
- no sample data, no bracketed placeholder, no prototype wording
- 0 dead links, 0 page errors, 0 horizontal overflow at 1440px
- the consent box is present and required, and submitting posts a real lead
- every case study renders as `gated`, matching production, with no link to a
  page that does not exist

The live endpoint was curled after deploy: 14 services, 6 families, 9 proven,
36 gated case studies, no internal fields in the payload.

### Known gaps, not fixed here

- No scope-bullet column on `service_offerings`, so the detail panel has no
  scope list. `past_performance` exists but is empty on all 14.
- `service_offerings` has no slug column; the key is derived from the name. Zero
  collisions across the 14 active services today, and it is never a public URL,
  but a rename changes it.
- Nothing is published on the enterprise case-study surface, so every case study
  is request-only. Publishing one in the admin makes it open by itself.
