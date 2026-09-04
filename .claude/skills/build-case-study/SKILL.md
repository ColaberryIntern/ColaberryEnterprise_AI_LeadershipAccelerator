---
name: build-case-study
description: Author a real, evidence-backed record in the Case Study OS — discovery, path scope, whole-section overrides, commit-pinned evidence, metrics with denominators, and the publish gate. Use for any new or rewritten case study.
---

# build-case-study

Every rule here was paid for. Two case studies produced one published record that
contradicted its own title, one metric that already existed, a silently dropped
diagram, a claim scanner blocking an honest negation, and three false statements in
a discovery report. The order below is the order that avoids repeating them.

**This skill does not publish.** Publishing is a separate, explicit instruction.

**Start section 8 (images) FIRST.** Dispatch an agent to find or produce the cover
image before anything else begins — it takes longer than the rest and a case study
without a cover reads as unfinished however good its evidence is.

---

## 0. Preflight — before any edit

```
git branch --show-current && git status --short && git log --oneline -5
```

Read root `CLAUDE.md`, then `docs/case-study/case-study-schema.md` and
`backend/src/types/caseStudy.ts`. Preserve unrelated work.

**Then check for an overlapping record. This is a hard stop.**

```sql
SELECT id, slug, title, status, visibility FROM case_studies ORDER BY created_at;
```

Match on slug, title, subject, commit AND pull request. A record can exist that is
approved, private and **completely empty** — check its counts before assuming it is
real work:

```sql
SELECT (SELECT count(*) FROM case_study_evidence  WHERE case_study_id=$1) evidence,
       (SELECT count(*) FROM case_study_metrics   WHERE case_study_id=$1) metrics,
       (SELECT count(*) FROM case_study_artifacts WHERE case_study_id=$1) artifacts,
       (SELECT count(*) FROM case_study_publications WHERE case_study_id=$1) pubs;
```

If an overlap exists: **stop and present options.** Never create a duplicate.

### Claims of absence require a named search

"There is no analytics on the story pages" was reported once and was wrong —
`caseStudyTracking.ts` was fully wired. The grep used generic names
(`trackEvent`, `analytics`) and missed a domain-specific module.

**A negative finding from one grep is not a finding.** State the searches performed.

---

## 1. Path scope — propose, count programmatically, get approval

Derive from the subject. For a single change, the commit's own file list *is* the scope:

```bash
git show --name-only --format="" <sha> > /tmp/scope.txt
grep -c . /tmp/scope.txt          # count it; never state a number you did not compute
```

A proposal once said "24 prefixes" over a list of 30. **Count, then quote the count.**

Present: exact count, numbered list, the claim each path supports, tests included,
neighbouring systems excluded, expected stack. **Do not apply until approved.**

Mechanics that surprise people:
- Prefixes are **lowercased on write**, matched case-insensitively.
- Matching is at **segment boundaries** — `backend/src/api` never matches `apiary`.
- **A prefix may name a file.** Essential when 5 relevant files sit in a directory of 25.
- Limit is **40**.
- **Any scope discards the repository-wide language list.** Expect `["typescript"]`.
  `react` disappears even with frontend paths in scope. This is correct. Do not widen
  the scope to make the stack look richer.

---

## 2. Create, scope, sync

```js
createCaseStudyFromRepoCollection({ title, repositories: ['owner/name'], actor })
node dist/scripts/scopeCaseStudyRepository.js --case-study <id> --repo owner/name \
  --scope <p1> --scope <p2> ... --dry-run        // then --confirm-production
syncCaseStudy({ caseStudyId, trigger: 'manual' })
```

A sync reporting `path scope matched 0 of N paths` means a typo. Fix before authoring.

---

## 3. Author — WHOLE SECTIONS, never nested paths

**The single most costly mechanic.** `applyHumanOverride` refuses a path the snapshot
does not already carry, and a fresh repo-only record has no `situation`,
`measurement`, `roadmap` or `contributors` at all.

```js
applyHumanOverride({ path: 'situation.narrative', ... })   // ✗ FAILS
applyHumanOverride({ path: 'situation', value: {...} })     // ✓ creates the section
```

Set the complete object: `identity`, `taxonomy`, `situation`, `architecture`,
`buildTimeline`, `measurement`, `heroMetrics`, `roadmap`, `contributors`, `artifacts`.

**`heroMetrics` is its own section.** Marking a metric `isHeadline: true` inside
`measurement` does **not** populate it once measurement has been overridden. Set both.

### Re-authoring an existing record: replace the body, not just the head

A published case study once carried a new title over the previous case study's
situation, architecture, measurement and roadmap. It read as two different stories.

**Re-author every section, then diff the body against the new thesis.** Scan the
finished projection for language from the old subject and explain or remove every hit.

---

## 4. Evidence — every verified claim, pinned to a commit

A `verified` claim with no `evidenceId` is refused by the gate:
`proof_metadata_missing`. This includes `identity.productionStatus`.

**A note string is not evidence.** Create a real `case_study_evidence` row:

```js
{ source_type: 'repository', source_ref: 'owner/name',
  source_commit_sha: '<sha>',            // pin to the SUBJECT commit, never `main`
  title, description,                     // description carries a reproducible command
  verification_class: 'verified', is_publicly_openable: true,
  public_url: `https://github.com/${repo}/blob/${sha}/${path}` }
```

The description must let another person re-derive the number:
> `git show --numstat --format="" 0b389be5`, split on the `.test.ts` suffix.

`last_seen_sha` on the repository row is the repo's **current head** and is populated by
the sync (`caseStudyRepoProvenanceWriter`). It is not the right anchor for a claim about
a specific change — pin evidence to the subject commit yourself.

---

## 5. Metrics — work the whole candidate list

A case study once shipped with **one** metric, and that one already existed on the
record. Eight candidates had been listed in the brief; seven were never attempted.

**Build a candidate table and fill every row.** No candidate silently skipped:

| Candidate | Built | Value | Evidence | Reason if not |
|---|:--:|---|---|---|

Prefer **repository-verifiable** metrics — they need no production read and a reader can
reproduce them. Strong ones: schedule interval, files changed, lines added, test files,
test-to-implementation ratio, resolution paths, operating modes, gate counts.

**Every count states its denominator.** "243 agents" and "116 that ran this week" are
different facts; reporting the first as the second is the failure this system exists to
prevent.

Each metric needs: stable key, label, display value, numeric value, unit, metric type,
baseline, sample, what was measured, methodology, limitations, verification class and
method, `verifiedAt`, real `evidenceId`, `publishable`, explicit headline decision.

**Never invent a figure to fill a card.** An honest gap — `0`, `not built` — is a
stronger fact than a manufactured one.

---

## 6. Language the claim scanner rejects

The scanner matches **phrases, not meaning**. It cannot tell a claim from its denial.
A narrative listing *"no cost saving"* among things deliberately **not** claimed was
blocked as an unbacked ROI claim.

**Avoid everywhere — including in negations:**
`cost saving` · `cost savings` · `ROI` · `hours saved` · `productivity` ·
`in production` · `revenue impact` · `accuracy improvement`

Safer: "the scheduler has an enabled runtime record", "the current count cannot be
assigned to one process", "multiple processes operated in the same period".

---

## 7. Diagrams — no angle brackets, ever

`projectDiagramSource` returns **`null`** for any source containing `<`, silently. A
diagram using `<br/>` was published as nothing and nobody noticed.

Use ` - ` instead of `<br/>`. After saving, **verify the projection returns it**:

```js
p.projection.architecture.diagramSource ? 'renders' : 'SANITISER DROPPED IT'
```

---

## 8. Images — start this FIRST, in parallel, and do not finish without them

**This is not a checklist item at the end. It is a workstream that begins before the
narrative and runs alongside it, because finding or making the right image takes
longer than everything else and cannot be rushed at the finish.**

### Spawn an agent for it on day one

The moment the subject is known — before the path scope, before the metrics — dispatch
a dedicated agent whose only job is imagery. It works while the record is authored.

> Find or produce the cover image and supporting images for a case study about
> `<subject>`, repo `<owner/name>`. Search the repo for screenshots, dashboards,
> architecture drawings and demo captures. Check `frontend/public/site-v2/` for an
> existing asset that genuinely depicts this system. If the subject has a UI, find a
> capture of it. If it has data, a dashboard view of that data is ideal. Report what
> exists, what could be produced, and what would be dishonest to use.

Do not block on it. Author the record in parallel and attach when it reports.

### The cover image is the point

A record without a cover opens on text and reads as unfinished no matter how good the
evidence is.

`identity.heroImageUrl` **now names the cover, and it is gated.** It did not always: it
was set correctly on a snapshot, the page showed a different image, and the reason was
that nothing read the field — it was not even on the domain type. It is real now, and the
gate is the part that matters: `resolveHeroImage()` accepts the named URL **only if it
matches an approved, publicly-viewable artifact on the same record**, so naming a URL can
never publish a picture the artifact approval did not see. A URL that fails the gate falls
back to type priority rather than erroring, which means *a silently wrong cover is the
failure mode* — verify, do not assume.

When nothing is named, the cover falls back to artifact type in this fixed order
(`HERO_IMAGE_PRIORITY` in `caseStudyArtifactPresentation.ts`):

```
'screenshot'  ->  'architecture'  ->  'photo'
```

Consequences worth knowing BEFORE rendering anything:

- **`diagram` is not a valid artifact type at all.** It is absent from
  `HERO_IMAGE_PRIORITY` *and* from `CaseStudyArtifactType`. Writing one does not fail at
  the write — it fails in the browser, where `ARTIFACT_TYPE_LABELS['diagram']` is
  undefined and `.toLowerCase()` throws, **blanking the entire page**. This shipped. The
  valid set is: `screenshot, architecture, photo, demo, deck, roadmap, report,
  evaluation, code, document, other`.
- **Type decides, not creation order.** An `architecture` image beats a `photo` however
  they were added.
- Never relabel a generated chart as a `screenshot` to promote it: `screenshot` asserts a
  capture of something running.

Verify the projection actually returned what you intended:

```js
p.projection.heroImageUrl   // must be the URL you expected, not merely non-null
```

### Before falling back to a generated image: prove the repo has no interface

You may not generate an image until you have **searched the repository for one and come
back empty**. On the CoreOps record this step was skipped, a dashboard was generated from
the record's own figures, and Ali asked the only question that mattered — *"Are you saying
that image was in the repo?"* It was not. The repo had shipped a nine-page
`command-center/` app the whole time.

```bash
find <repo> -name "*.html" -not -path "*/node_modules/*" | head -40
find <repo> \( -name "*.tsx" -o -name "*.vue" -o -name "*.svelte" \) -not -path "*/node_modules/*" | head
ls <repo>/{public,static,dist,build,docs,ui,web,app,frontend} 2>/dev/null
```

An interface counts even when it is static HTML with no server and is deployed nowhere.
`scripts/captureRepoUiScreenshots.js` serves a directory locally and screenshots named
pages, so anything that renders in a browser can be photographed:

```bash
node scripts/captureRepoUiScreenshots.js --root <repo> --out frontend/public/site-v2 \
  --height 1250 --page ui/index.html:shot-<slug>-console
```

**Serve the REPOSITORY ROOT, not the UI folder.** A page fetching `.colaberry/plan.json`
resolves it against the document root. Rooted at the UI folder, every capture came back a
perfectly rendered shell reading *"plan.json is missing or unreadable — nothing to show
yet"*: real chrome, real CSS, zero content. Rooted one level up, the same page rendered
thirteen traced requirements.

**Then open the PNG and look at it.** The script refuses a page under 40 characters, and
that guard is nowhere near enough — the empty-state captures above carried 273 to 440
characters of real text and were still worthless. A byte count proves a page rendered, not
that it rendered anything. Pick the page with the most *content*, not the most bytes: of
nine CoreOps tabs, four were honest empty states and the best one had six times the text
of the tab that was captured first.

### What counts as a real image, in order of preference

1. **A screenshot of the thing running.** If the system has any interface, this is the
   image. A dashboard, a console, a report, a queue view.
2. **A dashboard of the system's own data** — a Power BI-style view built from real
   figures the record already carries. This is the right answer when the subject is a
   pipeline, an agent or a service with no interface of its own.
3. **A rendered architecture diagram** — `scripts/renderCaseStudyDiagram.js` turns the
   record's own `diagramSource` into a PNG.
4. **A rendered metric chart** — `scripts/renderCaseStudyMetricChart.js` draws measured
   values with the reproduce command printed underneath.
5. **A photograph of the actual work or the actual people**, where one exists and
   consent allows.

### What does NOT count

- **A mermaid block is not an image, and a rendered mermaid chart is not a picture.**
  The block satisfies the architecture section and fails every image check. Rendering it
  to PNG does not promote it: Ali's ruling is *"you can't use a mermaid chart as a picture
  because the formatting will be off."* A diagram rendered at a diagram's aspect ratio,
  dropped into a slot shaped for a screenshot, reads as a mistake — it sits tiny and
  centred with the page's whitespace around it. Diagrams belong in the architecture
  section, inline, where the layout expects their shape. **Two real pictures beat one real
  picture plus a rendered diagram.**
- **A chart of the record's own numbers is not a screenshot of the product**, and must
  never be captioned as though it were. If tier 2 is genuinely the best available, say
  what it is in the artifact description — *"a dashboard built from the figures this
  record carries"* — and never style it to resemble the subject's real console.
- **A stock photograph is not evidence.** An atmosphere image standing in for a
  screenshot is the thing the publish rules exist to prevent — it implies a system was
  seen working when it was not.
- **A screenshot of a different system.** If the image does not depict *this* subject,
  it is decoration pretending to be proof.

### Generating one honestly

When a subject has no interface — a classifier, a cron job, a library — the honest image
is one made **from the record itself**:

```bash
node scripts/renderCaseStudyDiagram.js --in diagram.mmd --out frontend/public/site-v2/<name>.png
node scripts/renderCaseStudyMetricChart.js --in bars.json --out frontend/public/site-v2/<name>.png   --title "..." --foot "Reproduce: <command>"
```

Both refuse to invent: the diagram renderer reads the record's own source and rejects
anything containing `<`, and the chart prints the command to reproduce its numbers.

**Watch the units.** An early chart plotted 945 lines beside 9 files on one axis — two
different units, so both bars meant nothing. Compare like with like or use two charts.

### Getting them served

Images live in `frontend/public/site-v2/` and reach production through an **nginx
deploy**, which also bounces the backend. Batch them: render every image for the record
before deploying once.

### Attaching them

```js
{ artifact_type: 'screenshot' | 'architecture' | 'photo' | 'report',
  source_type: 'generated',        // or 'repo' for a capture from the codebase
  source_commit_sha: <sha>,
  visibility: 'public', status: 'approved',
  public_url, preview_url }        // set BOTH; some surfaces read preview_url
```

**`artifact_type` is a closed set and writing outside it blanks the page.** There is no
write-time validation, so a bad value persists happily and only fails in the browser,
where `ARTIFACT_TYPE_LABELS[type]` is undefined and `.toLowerCase()` throws. The full
valid set: `screenshot, architecture, photo, demo, deck, roadmap, report, evaluation,
code, document, other`. `diagram` is **not** one of them.

Then lift the approved rows into the snapshot's `artifacts` section — creating the row
alone does not put it on the page — **and set `identity.heroImageUrl` to the cover.**

### Done means

- [ ] The projection's `heroImageUrl` returns the image you INTENDED, not just non-null
- [ ] **At least two** approved, publicly viewable images (readiness checks both)
- [ ] Every image depicts *this* subject
- [ ] Every `artifact_type` is in the valid set above
- [ ] Artifacts lifted into the snapshot, not just created as rows
- [ ] Images verified live with an HTTP 200 before the record is called finished
- [ ] **The rendered page was opened and looked at** — see section 8b

---

## 8b. Open the page and look at it

A record can pass every gate in this file and still be wrong on screen. Ali's ruling
after the CoreOps record published: *"The content is good when everything is there, but it
needs a UI/UX developer to make the format correct."* Data checks do not catch layout.

**Never call a record finished from an API response.** Render it and photograph it:

```bash
BROWSER=none PORT=4321 npx react-scripts start          # in frontend/
node scripts/previewStoryLayout.js --slug <slug> \
  --payload <projection.json> --out preview.png --width 1440
node scripts/previewStoryLayout.js --slug <slug> \
  --payload <projection.json> --out band.png --clip ".cbv2-story__context"
```

`previewStoryLayout.js` intercepts the public API in the browser and fulfils it from a
file, so it renders **the real page component with real content** without writing
anything. That matters: a fixture with two-word metric values hides the exact defect this
is for. Take the live projection, substitute only what is under review.

It prints the measurements that catch the failures seen so far:

| Reading | What a bad value means |
|---|---|
| `pageScrollW > viewportW` | Something is pushing the page sideways |
| `factRows` > 1 at 1440px | The facts row is trapped in a narrow track |
| `metricHeights` wildly unequal or > ~800px | Cards are in a column too narrow for their prose |
| `cover: null` when a cover is set | The hero is not rendering it |
| `problems[]` non-empty | A JS error or a failed asset |

**Check at 1440 and at 390.** Both were needed: the desktop defect was a void, the phone
risk is horizontal overflow.

### The layout failures this page has actually shipped

- **A band sized for one card, given two.** The context band split 5fr/7fr to put facts
  beside the figure card. With two headline figures the 7fr track fits two 20rem columns,
  every card becomes a narrow tower of wrapped prose, and the six short facts run out
  after three rows — leaving a screen-height void beside them. **A layout tuned for one of
  something is a defect waiting for the second one.**
- **A cover that no page rendered.** `heroImageUrl` reached the index card and the detail
  page ignored it, so the page a shared link opens was the one page with no picture — and
  the masthead held an empty right half the whole time.
- **`grid-row: 1 / -1` with no `grid-template-rows`.** The explicit grid has one line, so
  `-1` resolves back to line 1, the span collapses, and the spanning element's height
  becomes row 1's height. It put 600px between a breadcrumb and a title. If an element
  must span a variable number of rows, **wrap the others in one child instead.**
- **Labels stacked above two-word values.** Four label/value rows printing the label on
  its own line is eight lines of card height to carry four facts. Put the label in a fixed
  left track.

### Before publishing, confirm on the rendered page

- [ ] The cover appears in the masthead, at a size that can be read
- [ ] No band has a void larger than a card beside its content
- [ ] Every metric card's methodology paragraph has a readable measure, not ~40 characters
- [ ] `pageScrollW === viewportW` at 1440 **and** 390
- [ ] Diagrams are in the architecture section, not standing in for a picture
- [ ] `problems[]` is empty

---

## 9. Record and snapshot must agree

Overriding `identity.title` in the snapshot does **not** update `case_studies.title`.
The public page then shows one title and the admin list another.

Same for consent: a record with `organization_identity_mode: hidden` against a snapshot
saying `named` produces confusing `organization_consent` blockers.

**Use `updateCaseStudy` for the record row and `applyHumanOverride` for the snapshot,
and set both.** Fields that must match: title, slug, organization identity mode,
organization naming consent, builder identity mode, builder naming consent.

---

## 10. The gate

Evaluate through the supported mapping, with an actor:

```js
evaluateCaseStudyPublishGate({
  caseStudy: store.toPublishRecord(await store.loadCaseStudyOrThrow(id)),
  snapshot:  store.toPublishSnapshot(snapshotRow),
  surfaceKey: 'enterprise',
})
```

**Do not call the gate broken until this exact shape has been tried.** It was reported
broken twice; both times the probe passed raw snake_case rows or skipped
`toPublishRecord()`.

`evaluateCaseStudyPublication` resolves the **approved** snapshot, not the latest draft.
A stale approved snapshot from a previous subject produces blockers describing content
that is not in your draft — approving the current snapshot clears them.

Blockers naming `case_study_not_approved` and `snapshot_not_approved` are the **intended
resting state** for an unpublished draft.

---

## 11. Verify, then report with denominators

- Override survival: re-sync and confirm each section held. Should report `unchanged`.
- `backend/node_modules/.bin/tsc --noEmit` — never bare `npx tsc` (resolves 4.9.5).
- `npx jest src/services/caseStudy src/routes/admin src/scripts`.
- Regression: other records unchanged, public index count, `/case-studies` and
  `/demo-day` redirects.

**Report denominators, never impressions.** Not "the detail page renders" but:
sections authored X of X · candidates investigated X of X · metrics verified X of X ·
artifacts X · images X · timeline entries X · prefixes X.

**Never say complete, production-ready or published without evidence for each claim.**

---

## Reference: the two records built with this

| | training system | tickets reconciler |
|---|---|---|
| readiness | 89 | **91** |
| metrics / headline | 4 / 1 | **6 / 3** |
| evidence rows | 15 | 12 |
| contributors | **0** | 2 |
| artifacts | 3 | 2 |
| **images** | **3** | **0** ← the live gap |
| metrics with methodology + limitations | 4 of 4 | 6 of 6 |

The tickets record scores higher on rigour and lower on pictures. Both patterns are
worth copying in one direction only.
