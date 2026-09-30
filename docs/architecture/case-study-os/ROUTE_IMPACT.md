# Case Study OS — Route Impact

**Gate 0 deliverable.** Every route this build touches, on both sides of the wire, and the
registration checklists that make each one actually work. Observed against `origin/main` =
`cfd016d9`, 2026-08-22.

Two facts dominate this document:

1. **A new frontend route is not "one line in `App.tsx`". It is six files.** Two of them are
   existing tests that will fail the moment the Stories page links to an unregistered route.
2. **A new public backend route mounted below `backend/src/server.ts:150` returns 401, not 404,
   and will look like a routing bug for hours.** That failure has already shipped once.

---

## 1. Frontend routes

### 1.1 Current state

| Route | Element | Declared at | Change |
|---|---|---|---|
| `/stories` | `StoriesV2` | `frontend/src/App.tsx:110` | **REWRITE** — becomes API-backed (spec §22, §26) |
| `/stories/:slug` | — | **does not exist** | **NEW** — spec §23 |
| `/case-studies` | `<Navigate to="/stories" replace />` | `frontend/src/routes/publicRoutes.tsx:44` | **KEEP UNCHANGED** |
| `/demo-day` | `<Navigate to="/stories" replace />` | `frontend/src/routes/publicRoutes.tsx:45` | **KEEP UNCHANGED** |
| `*` (404) | `NotFoundPage` | `frontend/src/routes/publicRoutes.tsx:70` | unchanged |

### 1.2 The two redirects — both stay

`/case-studies` and `/demo-day` **both** land on `/stories`. It is easy to notice only the first.
Neither may be removed, and neither may be turned into a real page:

- Nginx is a plain SPA fallback (`nginx/nginx.conf:183` — `try_files $uri $uri/ /index.html;`).
  **There are no server-level redirects.** All redirect logic is client-side React Router. If
  the React route disappears, the URL 404s.
- The sitemap header (`frontend/public/sitemap.xml:2-14`) deliberately excludes redirect
  *sources*. They must stay excluded.
- `/case-studies` is the legacy inbound path that still exists in the wild, and it is the key
  already present in `categorizePagePath` — see §5.

### 1.3 Where `/stories/:slug` goes, exactly

`frontend/src/App.tsx`, **immediately after line 110**, mirroring the services precedent:

```tsx
<Route path="stories" element={<StoriesV2 />} />
<Route path="stories/:slug" element={<StoryDetailV2 />} />   // ← new line 111
```

Three conventions to honour:

- **Child paths carry no leading slash.** They are relative to the `<Route path="/">` parent at
  `App.tsx:68`. `path="/stories/:slug"` also works in React Router 6 but breaks the file's
  convention.
- **The detail component is a named export from the same file as the list page**, exactly as
  `frontend/src/pages/publicV2/ServicesV2.tsx` does (`export function ServicesV2` at `:26`,
  `export function ServiceDetailV2` at `:115`), imported together at `App.tsx:12`.
- **Do not lazy-load it.** Every V2 page is a static top-of-file import (`App.tsx:11-19`), and
  `frontend/src/pages/publicV2/proofV2.css:5-13` records that this is *load-bearing*: shared
  `cbv2-` primitives live in **page** stylesheets (`.cbv2-card`, `.cbv2-lede`, `.cbv2-grid`,
  `.cbv2-section`, `.cbv2-eyebrow` in `homeV2.css`; `.cbv2-note`, `.cbv2-grid--2` in
  `servicesV2.css`) and resolve only because every V2 stylesheet lands in one bundle.
  Introducing `React.lazy` for a story detail route would silently break layout on other pages
  unless those primitives are first relocated into `publicV2.css`.

The V2 block must also stay **above** the legacy `<Route element={<PublicLayout />}>` block at
`App.tsx:112-114`, per the comment at `App.tsx:55-67`, so `/` resolves to V2.

### 1.4 THE SIX-FILE ROUTE REGISTRATION CHECKLIST

A new public V2 route is registered in six places. Files 2 and 3 are **existing tests that will
fail** the moment `/stories` links to a detail page that is not in their route tables.

| # | File | What to add | Consequence of skipping |
|---|---|---|---|
| **1** | `frontend/src/App.tsx:111` | The actual `<Route path="stories/:slug" element={<StoryDetailV2 />} />` | The URL 404s. |
| **2** | `frontend/src/components/publicV2/__tests__/linkIntegrity.test.tsx:38-51` (`V2_ROUTES`) | The detail routes, e.g. `...slugs.map(s => '/stories/' + s)` | **The existing suite fails.** `internalHrefs()` (`:73-83`) extracts every `href="/..."` from every page in `PAGES` (`:58-70`) and asserts each resolves to a route in `ALL_ROUTES` (`:56`). A card linking to `/stories/foo` is a dead link by that test's definition. |
| **3** | `frontend/src/components/publicV2/__tests__/consentAndSeo.test.tsx:29-49` (`DECLARED_ROUTES`) | The same list | **The existing suite fails.** The footer-link resolution test reads this array. |
| **4** | `frontend/public/sitemap.xml` | One `<url>` block per published story | Detail pages are never crawled. Service detail pages are enumerated individually at `sitemap.xml:26-50`, which is the precedent to follow. See §1.6 — this is the hard one. |
| **5** | `frontend/src/components/publicV2/PublicHeaderV2.tsx:38` (`V2_NAV`) | `{ label: 'Stories', to: '/stories' }` — **only if** Stories should enter the primary nav | Stories stays discoverable only from the footer. `isCurrent()` (`:74-78`) already highlights correctly on `/stories/:slug`, so no other change is needed if the entry is added. |
| **6** | `frontend/src/components/publicV2/PublicFooterV2.tsx:39-73` (`GROUPS`) | `/stories` already exists at `:63` under the "Proof" group; add detail entries only if desired | No breakage; `FOOTER_LINKS` is exported at `:76` for the resolution test. |

**A seventh, non-negotiable item that is not route registration but behaves like it:**
`StoriesV2` is currently **absent** from the `PAGES` array in `linkIntegrity.test.tsx:58-70`, so
its links are not dead-link-checked today. Add it. The slug-route describe block at `:112-137`
is the pattern — it renders through a **real** `<Route path="/services/:slug">` and carries a
"guard the guard" assertion at `:124-125` proving the page did not silently fall through to the
not-found branch. The comment at `:99-110` records that an earlier version of that test tested
nothing but the not-found page for months.

### 1.5 Nav decision (item 5) — call it explicitly

`V2_NAV` (`PublicHeaderV2.tsx:38-44`) is currently Services · Platform · Pricing · Proof · Start
Free. `/stories` is reachable only from the footer (`PublicFooterV2.tsx:63`, "Builder stories")
and from cross-links.

If the Case Study OS is meant to be discoverable — and spec §22's "enterprise public index" with
a dynamic ledger, filters and proof badges reads as a destination, not a footnote — the nav needs
an explicit change, and `linkIntegrity.test.tsx:141-145` will validate it. **Record the decision
either way**; a shipped index nobody can find is a silent failure.

### 1.6 The sitemap problem (item 4)

`frontend/public/sitemap.xml` is a **static, hand-maintained file**. A repo-wide search for
`sitemap` returns 10 files and **none of them is a generator**: the file itself, comments in
`App.tsx` / `publicRoutes.tsx` / `claimsRegistry.ts`, `directives/marketing-site.md`,
`PROGRESS.md`, an unrelated RSS parser (`backend/src/services/blog/blogFeedParser.ts`), an
unrelated issue-cluster engine, and two spec docs.

**A database-backed `/stories` breaks the static sitemap model.** Spec §28 asks for the
lowest-risk way to include dynamic published Case Study URLs. The three options, with their real
costs in this repo:

| Option | What it means here | Risk |
|---|---|---|
| **A. Hand-maintain** | Add a `<url>` block per published story, as service detail pages already do | Zero new machinery; drifts the moment anyone publishes without editing the file. Acceptable at Phase 1 volumes if the publish runbook says so. |
| **B. Build-time generation** | A script that reads published slugs and writes `sitemap.xml` before `npm run build:frontend` | Requires DB access at build time; the CI `frontend-build` job has none. Would need a committed snapshot file. |
| **C. Dynamic `/sitemap.xml` from Express** | A public route above `server.ts:150` serving XML from `case_study_publications` | Cleanest correctness; requires an nginx location change so `/sitemap.xml` reaches the backend rather than the SPA static fallback (`nginx/nginx.conf:183`). That is an infrastructure edit. |

**Neither B nor C exists today.** Whichever is chosen must be recorded in
`IMPLEMENTATION_DEVIATIONS.md`, and spec §45's rule stands regardless: **test fixtures must
never be hardcoded into the production sitemap.**

**Related pre-existing defect (D-5):** `frontend/public/robots.txt:3` points crawlers at
`https://www.colaberry.com/sitemap.xml`, while the sitemap itself lists
`https://enterprise.colaberry.ai/*`. A build that cares about Case Study SEO should fix the host.

### 1.7 SEO per route

`SeoV2` (`frontend/src/components/publicV2/SeoV2.tsx`) is the only mechanism, and its whole API
is `{ title, description, route? }` (`:33-38`) — where **`route` is accepted and ignored** (the
destructured signature is `({ title, description })`).

| Requirement (spec §28) | Status today |
|---|---|
| Unique title per detail page | **Works.** Pass `title`; the ` \| Colaberry Enterprise AI` suffix is appended at `SEOHead.tsx:14` — do not include it yourself. |
| Unique description | **Works**, with a caveat: `SEOHead.tsx:16-19` **only updates an existing `meta[name=description]` tag and never creates one**. It relies on `frontend/public/index.html` shipping the tag. |
| Canonical URL | **Works for free.** `SeoV2.tsx:56-62` derives it from `window.location.origin + location.pathname`, so `/stories/claims-triage` self-canonicalises. |
| OpenGraph when approved media exists | **GAP.** `SeoV2` sets `og:title`, `og:description`, `og:url` and nothing else — **no `og:image`, no `og:type`, no Twitter cards, no JSON-LD**. Extending `SeoV2` is required if approved artifact media should drive link previews. |
| 404 for unpublished / unknown slugs | **NEW WORK.** The detail component must render the not-found branch when the API returns 404, and the `linkIntegrity` "guard the guard" assertion (`:124-125`) is what proves the happy path did not silently fall through to it. |

Two more `SeoV2` behaviours worth knowing: `PREVIEW_NOINDEX` is `false` (`SeoV2.tsx:31`) since
the 2026-08-13 cutover, so V2 is indexable; and unmount resets `robots` to `index, follow`
(`:66-70`) but **does not reset canonical**.

All meta handling is client-side `useEffect` DOM mutation — no SSR, no prerender, no
react-helmet. Crawlers that do not execute JS see only `frontend/public/index.html`.

### 1.8 Frontend component boundaries

Spec §32 is explicit: **do not put the whole implementation in `StoriesV2.tsx`.** Root
`CLAUDE.md` caps a file at 500 lines hard / ~300 soft. The suggested split lives under
`frontend/src/components/caseStudy/` with the API client at
`frontend/src/services/caseStudyApi.ts`.

The API client should follow shape (a) from the repo's two coexisting conventions — a thin typed
wrapper over the shared `frontend/src/utils/api.ts` instance
(`frontend/src/services/capeApi.ts:17-47` is the model: a header comment naming the backend
schema file that is the source of truth, one interface per response shape, one async function per
endpoint, no try/catch) — **not** a fresh `axios.create()` with a duplicated interceptor
(`intelligenceApi.ts:3-18` is that other shape; it exists, and it is the weaker one).

Note that `StoriesV2` and `ProofV2` currently make **zero** network calls, and there is no
`services/publicApi.ts` or unauthenticated-public client module anywhere. This build establishes
that pattern for the public site.

---

## 2. Backend public routes

### 2.1 The new family

Spec §19 names four read-only public endpoints. All resolve `surface=enterprise` internally in
Phase 1:

```text
GET /api/public/case-studies
GET /api/public/case-studies/:slug
GET /api/public/case-study-taxonomy
GET /api/public/case-study-collections/:slug
```

**Prefix reality check.** `/api/public/*` is **not** an established convention in this repo. The
census of literal prefixes declared across `backend/src/routes/**/*.ts`:

| Prefix | Declarations |
|---|---|
| `/api/admin` | 1014 |
| `/api/portal` | 655 |
| `/api/webhook` | 8 |
| `/api/referrals` | 7 |
| `/api/chat` | 6 |
| `/api/v1` | 5 |
| `/api/t` | 4 |
| `/api/sponsor` | 4 |
| **`/api/public`** | **1** — `backend/src/routes/publicPortfolioRoutes.ts:12` |

Using `/api/public/case-studies` is defensible (it matches the spec and extends the one existing
occurrence into a real namespace) but it is a **choice, not an inherited convention**. Record it.
What is *not* optional is that the router declares its **full** path inside `router.get()` and is
mounted prefix-less — every route file in this repo does that, with `app.use('/preview', …)` at
`server.ts:108` the single exception.

### 2.2 THE HARD CONSTRAINT — mount above `server.ts:150`

`backend/src/server.ts:138-145`, verbatim:

> *"PUBLIC API routes — MUST stay mounted BEFORE adminRoutes. adminRoutes is mounted with no path
> prefix and chains many admin sub-routers that call `router.use(requireAdmin)` with no path
> scope. Because of that, any request that doesn't match an earlier route falls into adminRoutes
> and is 401'd ("Authentication required") by the first requireAdmin guard before it can ever
> reach these public routes. Mounting them ahead of adminRoutes lets their specific paths
> (/api/calendar/*, /api/strategy-prep/*, /api/t/*, /api/chat/*) match first. This was the cause
> of the strategy-call booking 401 bug (see reference_calendar_booking_401_bug). DO NOT move
> these below adminRoutes."*

The current mount block, with the lines that matter:

```text
server.ts:132   app.use(publicPortfolioRoutes);   ← existing public route
server.ts:136   app.use(v1Routes);
server.ts:138-145  ← the comment above
server.ts:146   app.use(calendarRoutes);
server.ts:147   app.use(strategyPrepRoutes);
server.ts:148   app.use(trackingRoutes);
server.ts:150   app.use(adminRoutes);             ← THE LINE
```

**`app.use(publicCaseStudyRoutes)` goes above line 150.** The natural home is beside
`publicPortfolioRoutes` at `:132`, or in the explicitly-labelled public block at `:146-148`.

**The failure mode if this is missed is not a 404.** It is a 401 with the message
"Authentication required", from a guard in a completely unrelated admin sub-router. It looks like
an auth bug, not a mounting bug. This exact failure previously shipped as the strategy-call
booking 401.

**Corollary — the 401-masks-a-404 trap.** `backend/src/routes/admin/organizationRoutes.ts:26-34`
and `backend/src/routes/admin/__tests__/organizationRoutes.paths.test.ts:20-32`:

> *"a 401 does not prove a route exists. An unauthenticated request to `/api/admin/organizations`
> returns 401 whether or not the route is mounted, because anything under `/api/` reaches
> adminRoutes and is rejected by the first `requireAdmin` guard it encounters. A smoke test that
> reads 401 as 'mounted and guarded' is reading a false positive."*

The mitigation is to read `router.stack` directly (`organizationRoutes.paths.test.ts:36-70`). See
`TEST_PLAN.md` §3.

### 2.3 Public route file requirements

Copy the **good half** of `backend/src/routes/publicPortfolioRoutes.ts` and the **whole** of
`backend/src/routes/explorerSignalRoutes.ts`:

| Property | Source | Required? |
|---|---|---|
| Full absolute path inside `router.get()` | `publicPortfolioRoutes.ts:12` | **Yes** — mounting is prefix-less |
| **No** bare `router.use(<guard>)` | `explorerSignalRoutes.ts:44-46` (*"NEVER a bare `router.use(requireParticipant)` — that has caused two production outages here"*) | **Yes** |
| Uniform 404 for absent-vs-unpublished | `publicPortfolioRoutes.ts:8-10`; enforced by folding the predicate into the WHERE (`portfolioShareService.ts:48`) | **Yes** — a draft and a typo must be indistinguishable |
| `error_class` → status mapping, generic 500 message | `publicPortfolioRoutes.ts:16-24` | **Yes** — never return `err.message` on a public surface |
| Dynamic `await import()` of the service in the handler | `publicPortfolioRoutes.ts:14` | House style |
| Inline **Zod v4** validation of params and query | `explorerSignalRoutes.ts:49-66` | **Yes** — spec §19 requires runtime validation of every filter. Use `.issues`, not `.errors`. |
| Rate limiter degrading to 204 | `explorerSignalRoutes.ts:34`, `trackingRoutes.ts:13-41` | **Yes** — `publicPortfolioRoutes` has none, and that is a gap, not a precedent |
| An **allow-list projection** before `res.json()` | **does not exist anywhere in this repo** | **Yes — new work.** See `DATA_SOURCE_MAP.md` §4 |
| `Cache-Control` on published reads | none exists | Recommended — spec §29 forbids the public page waiting on GitHub, and the existing public route performs a full multi-table read plus an LLM call per anonymous hit |

**Filters to validate** (spec §19): `capability`, `industry`, `stack`, `program`, `built_by`,
`verification`, `method`, `deliverable`, `status`, `repo_visibility`, `collection`, `featured`,
`sort`, `page`, `limit`. Use `z.coerce.number().int().min().max()` for the paging params, the
idiom already in `backend/src/schemas/adminOrgSchema.ts`.

---

## 3. Backend admin routes

### 3.1 The new family

```text
/api/admin/case-studies/**
```

Capabilities required by spec §20: list/search, create from Project, create from repo collection,
read/edit, attach/update/remove repo sources, sync, read sync runs, approve snapshot, preview the
Enterprise projection, publish, unpublish, archive.

### 3.2 The registration chain — three files, and skipping any one is a silent half-failure

| # | File | Edit | Consequence of skipping |
|---|---|---|---|
| **1** | `backend/src/routes/admin/caseStudyAdminRoutes.ts` (new) | Full `/api/admin/case-studies/...` paths, **per-route** `requireAdmin` or `requireSection(...)`, and any literal segment (`/stats`, `/candidates`) declared **before** `/:id` | `/:id` eats the literal path; unguarded routes fail `scripts/lint-route-auth.js` |
| **2** | `backend/src/routes/adminRoutes.ts` | `import caseStudyAdminRoutes from './admin/caseStudyAdminRoutes';` + `router.use(caseStudyAdminRoutes);` | Every route 404s |
| **3** | `backend/src/middlewares/mgmtSectionGate.ts:21-41` | `['/api/admin/case-studies', '<section>']` in `PATH_SECTION` | **403 for every scoped mgmt role.** Legacy admins still work, so this passes local testing and fails for real operators. |

### 3.3 Why item 3 is easy to miss and expensive to miss

`mgmtSectionGate` runs globally at `backend/src/routes/adminRoutes.ts:100`, before every admin
sub-router, and is **deny-by-default for scoped roles** (`mgmtSectionGate.ts:58-92`). With no
`PATH_SECTION` row for `/api/admin/case-studies`:

| Identity | Result |
|---|---|
| legacy `admin` / `super_admin` | works |
| mgmt `owner` | works |
| mgmt `admin` | works — unmapped is allowed for the broad role |
| mgmt `curriculum` | **403 on every call** |
| mgmt `revenue` | **403** |
| mgmt `admissions` | **403** |
| mgmt `support` | **403** |
| mgmt `community_organizer` | **403** |

`AGNOSTIC` (`mgmtSectionGate.ts:44`) exempts only `/api/admin/me`, `/api/admin/login`,
`/api/admin/logout`.

**And no automated check catches it.** `scripts/lint-route-auth.js` scans only
`backend/src/routes/admin/` (`:18`), and it is a **substring check, not a per-route check**
(`:19`, `:29-39`) — one guarded route anywhere in the file satisfies it. It cannot see
`mgmtSectionGate` at all. `backend/src/middlewares/__tests__/mgmtRbac.test.ts` covers the gate,
but that suite is **excluded from CI** (`backend/jest.ci.config.ts:73`).

**Which section?** Prefer an existing key from `backend/src/services/access/mgmtRoles.ts:15-21` —
`program` is the natural fit and is already granted to `curriculum` and `owner`
(`MGMT_ROLE_DEFS`, `:38-58`). Introducing a new `SECTION_KEY` means changing the server's
authoritative role vocabulary **and** the frontend `adminNav.ts` in lockstep (`mgmtRoles.ts:1-10`:
*"Keep this list in step with the frontend `adminNav.ts` section keys — the server is the
authority."*). Reuse beats invention here.

---

## 4. Frontend admin routes

| # | File | Edit | Consequence of skipping |
|---|---|---|---|
| **1** | `frontend/src/routes/adminRoutes.tsx` | `const AdminCaseStudiesPage = lazy(() => import('../pages/admin/AdminCaseStudiesPage'));` at the top, plus `<Route>` entries **inside the `<AdminLayout />` block**, **list before detail** (comment at `adminRoutes.tsx:85-87`) | Page unreachable; or `/:id` eats the list path |
| **2** | `frontend/src/components/Layout/adminNav.ts:38-92` | A link in the matching `NAV_GROUPS` entry, e.g. `{ path: '/admin/case-studies', label: 'Case Studies', icon: 'file-text-line' }` under the `program` group | **Invisible in the sidebar for every identity, and unreachable for a `sales` login** |
| **3** | `frontend/src/__tests__/adminNavRbac.test.ts` | Optionally extend | No CI impact — there is no frontend unit-test job |

Why item 2 has teeth: `ProtectedRoute` (`frontend/src/components/ProtectedRoute.tsx:28-55`)
resolves the path via `sectionForPath()` (`adminNav.ts:117-126`, longest-prefix, `/`-delimited).
An unmapped path returns `null`, so `allowed = !isScopedRep` — a `sales` login is bounced to
`firstAccessiblePath()` and everyone else renders through but sees no sidebar entry. The header
at `ProtectedRoute.tsx:18-19` is explicit that this is *"a UX boundary, not a security one.
`requireSection` on the backend is what actually protects the data."*

**Icons are RemixIcon names without the `ri-` prefix** (`adminNav.ts:4-5`, rendered as
`` `ri-${link.icon}` `` at `AdminLayout.tsx:13`). Bootstrap Icons are not the admin icon set.

Note `.github/CODEOWNERS` assigns `frontend/src/routes/adminRoutes.tsx`,
`frontend/src/pages/admin/`, `frontend/src/components/admin/` and several
`backend/src/routes/admin/*.ts` to `@workstream-admin`, and covers `frontend/src/App.tsx`,
`backend/src/server.ts` and `backend/src/routes/adminRoutes.ts` in a shared-file section. Whether
those handles resolve to real GitHub teams is not determinable from the worktree, but expect
review routing on this PR.

---

## 5. Tracking route impact — the categorisation defect

This is not a new route, but it is a routing-shaped bug and it belongs here.

`backend/src/services/visitorTrackingService.ts:20` maps `'/case-studies'` → `'case_studies'`.
The canonical public route is **`/stories`**, and `/case-studies` merely *redirects* to it. A
redirect means the tracked `page_path` is `/stories`, which matches no `categoryMap` entry and
falls through to `'other'` (`:53`). There is no `/stories` key and no `/stories/` prefix rule —
the only prefix rules at `:49-51` are `/referrals`, `/portal`, `/admin`.

**Six live consumers are therefore already dead code in production:**

| Consumer | What never fires |
|---|---|
| `backend/src/services/behavioralSignalService.ts:170` | `deep_scroll_case_study` lead signal, **strength 20** |
| `backend/src/services/admissionsMayaService.ts:305` | Maya's "reviewing success stories" greeting |
| `backend/src/services/agents/admissions/admissionsPageContextAgent.ts:32` | the `case_studies` page-context branch |
| `backend/src/services/chatService.ts:73` | case-studies chat context |
| `backend/src/services/admissionsKnowledgeService.ts:104` | `case_studies` → `outcomes` knowledge routing |
| `backend/src/services/reporting/visitorFlowGraphService.ts:88` | the "Case Studies" node in the visitor flow graph |

**Required fix (Gate 7):** add `'/stories': 'case_studies'` to the map **and** a
`cleaned.startsWith('/stories')` prefix rule so `/stories/:slug` categorises too, proved by a unit
test on `categorizePagePath`. **Keep the `/case-studies` key** — a direct hit on the legacy URL,
before the client-side redirect resolves, must categorise identically.

Without this, `page_category` stays `'other'`, `inferStage()`
(`backend/src/services/journeyTimelineService.ts:69-96`) can never promote a case-study visit past
Awareness, and Gate 7 cannot honestly claim that Case Study behaviour reaches the lead journey.

---

## 6. Full route-impact summary

### Frontend

| Route | Action |
|---|---|
| `/stories` | rewrite (API-backed index, filters, ledger, proof badges) |
| `/stories/:slug` | **new** |
| `/case-studies` | unchanged redirect |
| `/demo-day` | unchanged redirect |
| `/admin/case-studies` | **new** |
| `/admin/case-studies/:id` | **new** (declared after the list route) |

### Backend

| Route | Action |
|---|---|
| `GET /api/public/case-studies` | **new**, mounted above `server.ts:150` |
| `GET /api/public/case-studies/:slug` | **new**, same |
| `GET /api/public/case-study-taxonomy` | **new**, same |
| `GET /api/public/case-study-collections/:slug` | **new**, same |
| `/api/admin/case-studies/**` | **new**, via `adminRoutes.ts` + a `PATH_SECTION` row |
| `POST /api/t/event` | unchanged route; `VALID_EVENT_TYPES` extended (`trackingController.ts:36-64`) |
| `POST /api/webhook/github` | **unchanged** — Phase 1 does not register a second webhook |

### Files touched for routing alone

```text
frontend/src/App.tsx
frontend/src/routes/adminRoutes.tsx
frontend/src/components/publicV2/__tests__/linkIntegrity.test.tsx
frontend/src/components/publicV2/__tests__/consentAndSeo.test.tsx
frontend/src/components/publicV2/PublicHeaderV2.tsx        (decision)
frontend/src/components/publicV2/PublicFooterV2.tsx        (optional)
frontend/src/components/Layout/adminNav.ts
frontend/public/sitemap.xml
backend/src/server.ts                                      (above line 150)
backend/src/routes/adminRoutes.ts
backend/src/middlewares/mgmtSectionGate.ts
backend/src/services/visitorTrackingService.ts             (categorizePagePath)
backend/src/controllers/trackingController.ts              (VALID_EVENT_TYPES)
```

Plus deletions prescribed by `claimsRegistry.ts:610`:

```text
frontend/src/pages/CaseStudiesPage.tsx                     (delete)
frontend/src/routes/publicRoutes.tsx:8                     (remove the unused import)
```

### Regression surface (spec §43)

These routes must still work after the change and belong in the Playwright/manual sweep:
`/`, `/services`, `/services/:slug`, `/platform`, `/proof`, `/lab`, `/pricing`, `/contact`,
`/try`, `/free-workspace`, `/privacy`, the `/case-studies` and `/demo-day` redirects,
`/portfolio/share/:token`, and the admin shell.
