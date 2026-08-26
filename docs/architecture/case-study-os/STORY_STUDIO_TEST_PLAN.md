# STORY_STUDIO_TEST_PLAN

**How each checkpoint of the Case Study OS workstream is proved.**

Status: PLAN. Companion to `STORY_STUDIO_PLAN.md`. Written at Checkpoint B, before any
Checkpoint B code.

This is not a list of tests to write. It is the standard those tests have to meet, derived
from the specific ways this repository has been fooled before.

---

## 1. The three failures this plan is written against

### 1.1 A test that cannot fail

Seven assertions written earlier in this workstream could not fail. `storyDetailV2Contract.
test.ts:96-118` records the mechanism in the case that was caught: the regex
`/lazy\([^)]*StoryDetailV2/` was shipped to prove the route is not lazy-loaded, and `[^)]*`
stops at the first `)` — which in `lazy(() => import(...))` is the one closing the empty
parameter list, long before the module path. It was *verified false against a genuinely lazy
App.tsx*. It guarded nothing, and it was green.

**The standard, and it is not optional: every behaviour added anywhere in this workstream is
proved by mutating the behaviour, watching a named test go red, and restoring the source
byte-exact.** A test that has never been seen red is a test whose failure mode is unknown.
The report for each checkpoint names the mutation and the failing test.

The repository already knows this and writes the countermeasure into its own suites as
"non-vacuity" assertions — `expect(legacyOnly.length).toBeGreaterThan(20)`,
`expect(referenced.length).toBeGreaterThan(10)`, *"so the ban below is not vacuous"*. Every
new source-reading assertion carries one.

### 1.2 A scoped run mistaken for coverage

A rubric change in this workstream passed 197 scoped tests and failed CI at 14,010. A
scoped run is a selection, not coverage.

**The standard: no checkpoint is green until the full frontend suite has run.** Additionally,
`--testPathPattern="caseStudy"` matches the worktree path itself (`casestudy-os-wt`) and
therefore selects everything; patterns must be anchored to a directory or a filename.

### 1.3 A page that passed every check and was invisible

Three separate contrast failures have shipped on this exact surface — 1.06:1, 1.03:1 and
1.00:1 — and every token check and every unit test passed each time. The root cause is
recorded at `storyDetailV2.css:98-108`: `.cbv2-pagehero .cbv2-story__term` names a
*background*, not a *component*, so it matched the light card inside the dark masthead and
painted its text white on white. **jsdom applies no stylesheet, so no unit test in this
repository can compute that cascade.**

**The standard: a browser has to look at the page, and a human has to look at what the
browser saw.** Rendered contrast is measured, not reasoned about.

---

## 2. The tiers, and what belongs in each

Per CLAUDE.md's Test Strategy Framework: ~70% unit, ~20% integration, ~10% end-to-end. This
workstream's shape:

| Tier | Where | What it can prove here |
|---|---|---|
| **Pure unit** | `frontend/src/pages/publicV2/__tests__/`, `backend/src/services/caseStudy/__tests__/` | Predicates and projections: `isSectionSupported`, `visibleSections`, `hasEvidenceContext`, `placeStoryFigures`, `projectSituation`, `projectArchitecture`. These are the highest-value tests in the workstream because every one of them is a *rule*, and a rule inside a component can only be tested by rendering it |
| **Render (jsdom)** | `StoryDetailV2.test.tsx`, `storyPresentation.test.tsx`, `storyMedia.test.tsx` | Structure, order, headings, ARIA, what hides. **Not colour, not layout, not size** |
| **Source contract** | `storyDetailV2Contract.test.ts`, `caseStudyStyleContract.test.ts`, `caseStudyTokens.test.ts`, `storyDetailV2HeroInvariant.test.ts` | Claims about what the code does *not* do: no legacy token, no raw colour, no second styling mechanism, no lazy import, no growth of the closed component set, no control characters |
| **Browser** | `tests/systemV2/caseStudyPublic.e2e.js` and the two probes added at B | Rendered contrast, overflow, reveal state, real heights, what it looks like |
| **Backend integration** | `backend/src/services/caseStudy/__tests__/` | Projection round-trips, gate verdicts, snapshot idempotency |

**The rule that keeps the pyramid upright: if an assertion can be made against a pure
function, it is not made against a rendered component, and never against a browser.**

---

## 3. Per-checkpoint proof obligations

### Checkpoint B — Enterprise surface

| Item | Proof |
|---|---|
| B-1 CSS split | Both files under the 500-line ceiling. **The new stylesheet is added to the contract test's file list**, so it inherits the token, hex, namespace, `@import` and control-character bans. A split that moves rules out of the checked file and into an unchecked one is a regression disguised as a refactor |
| B-2 `constraints` / `goals` projected | Backend: projector emits both, omits each when absent, and returns the record unchanged when neither exists. Frontend: renders two labelled lists; renders neither when both are empty; **the situation band still hides entirely when the narrative is empty**, which is the pre-existing rule and must not become "hides only when all three are empty" |
| B-3 `dataStores` projected | Same shape. Plus: the architecture band's emptiness predicate must not start returning `true` for a record that has *only* `dataStores`, unless that is a deliberate decision recorded in the test |
| B-4 hero subtraction | Rendered structure test: the moved blocks are **no longer descendants of `.cbv2-pagehero`**. Browser: `heroHeight` measured before and after at both viewports, reported as two numbers. Contrast sweep must stay green — moving light-on-dark content onto light ground is precisely the cascade that has failed three times here |
| B-5 tone alternation | Source contract: the tone class is defined in this page's own stylesheet, scoped under `.cbv2-story`. **`.cbv2-section--sunken` is declared twice in this codebase with different values** — `homeV2.css:22` (`--surface-sunken`) and `cinematicV2.css:409` (`--cbv2-warm-sunken`) — so which one a band gets depends on stylesheet import order. Inheriting that ambiguity is not acceptable for a "locked" grammar |
| B-6 `headingLevel` on `CaseStudyArtifacts` | Render test at each permitted level; the recorded h2 -> h4 skip is closed |

**Checkpoint B exit gate**

1. Full frontend jest suite, unscoped, green.
2. `frontend/node_modules/.bin/tsc --noEmit` clean. **Never the root binary** — root `node_modules/typescript` is 4.9.5 against the workspace's 5.9.3 and reports a false clean.
3. Backend jest for the case-study suites green; `backend/node_modules/.bin/tsc --noEmit` clean (budget ~50 minutes).
4. Every new behaviour mutated, red, restored. Mutations listed in the report.
5. `caseStudyPublic.e2e.js` against a local build, after being proved able to fail against a dead port in the same session.
6. Frames captured at 1440x1000 and 390x844 and **looked at**.

### Checkpoint C — the lens theory

The exit criterion is an assertion, not a screenshot:

> **The five canonical values — `builtBy`, `verificationClass`, `verificationMethod`,
> `productionStatus`, `organizationLabel` — are identical across all four surface previews
> of one record.** They come from the snapshot, not the profile. A test that switches
> surface and diffs those five is the whole lens model expressed as one assertion.

Plus:

- `requiredSections` cannot be defeated: a profile that puts `contributors` in
  `hiddenSections` still renders it. Test by constructing exactly that profile.
- A record with no contributors still hides the band. **The floor constrains the lens, never
  the data**, and a test that conflates the two would make the floor look broken.
- The admin preview endpoint still writes nothing. Assert against the route, not the UI.
- `resolveRequestSurface` is unchanged. A source-contract assertion, because the danger is a
  one-line edit made in passing: the read gate at `caseStudyFilterService.ts:200-209` does
  not consult `publishable`, so honouring a request parameter publishes every non-enterprise
  record in the same commit.

### Checkpoint D — Story Studio

- **D-0 artifact promotion is the highest-risk item in the workstream** and gets the full
  matrix: happy path, failure path, boundary, and **idempotency** — promoting the same
  artifact twice produces one approved artifact, not two side effects. CLAUDE.md makes
  idempotency non-negotiable and a promotion path is a side-effecting write.
- Authorization is tested per route, negatively: unauthenticated -> 401, authenticated
  non-admin -> 403. A route that only has happy-path tests is incomplete.
- **No test may assert a hardcoded personal identifier.** If one appears in a branch, the
  test should fail on that ground alone.
- The Studio may not be able to publish by accident: assert that changing the preview tab
  does not change the publish target.
- Provenance: an AI-drafted value at any of the six forbidden field classes is refused. Test
  the refusal, not the acceptance.

### Checkpoint E — hardening and the skill

- E-1 `publicAppUrl`: with `PUBLIC_APP_URL` unset, assert the canonical URL is **not**
  silently the enterprise host for a non-enterprise surface.
- E-2 is the one change that alters what the public can reach. It gets its own review and
  its own negative tests: a published record on a non-publishable surface must still be
  unreachable after the resolver honours a parameter.
- The skill is proved by being run against a second record end to end by someone who did not
  write it.

---

## 4. What this plan refuses to test

Stated so that absence reads as a decision rather than an oversight.

| Not tested | Why |
|---|---|
| That the page "looks premium" | Not expressible as an assertion. It is a human judgement, and the browser frames exist so a human can make it |
| Visual regression by pixel diff | The record's content changes when the repository changes, so a pixel baseline would go red for reasons that are not defects. Contrast, overflow and height are measured instead, because those are stable properties |
| The claim scan's coverage of arbitrary false sentences | Closed by design. The scan reads five token classes and the source says so: *"A false sentence that uses none of the scanned vocabulary — 'the system transformed their operation' — passes, and no deterministic rule could reach it. Human snapshot approval is what stands in that gap."* A test implying otherwise would misrepresent the control |
| Mermaid's own rendering | Not bundled; loaded at runtime from a CDN. The contract test asserts it stays that way |
| Backend `__tests__` type health | `tsconfig.json` excludes them, so a clean backend type-check says nothing about them. Fixing that is E-7 |

---

## 5. Standing hazards for anyone running these

- **`--testPathPattern="caseStudy"` matches the worktree path** (`casestudy-os-wt`) and
  silently selects the whole suite. Anchor patterns to a directory or filename.
- **Root `tsc` is 4.9.5 and reports a false clean.** Use the workspace binary.
- **Two backend suites time out under co-execution** (`projectRoutes.test.ts`,
  `enrollmentRoutes.test.ts`) because `buildApp()` runs against no configured DB inside a 5s
  default. Each passes alone. This is a known flake class, not a Case Study failure, and it
  must not be "fixed" by widening a timeout in a Case Study suite.
- **Never write source through a shell heredoc.** A heredoc turns `\b` into 0x08; the result
  compiles, renders and reviews clean while carrying a byte no editor shows. Eight such
  incidents occurred in this workstream. The contract test's control-character sweep is the
  net, and it only covers files that are on its list.
- **Do not `git stash`, and never `git worktree remove` while a `node_modules` junction
  exists.** The second destroyed 5,711 files earlier in this workstream.
