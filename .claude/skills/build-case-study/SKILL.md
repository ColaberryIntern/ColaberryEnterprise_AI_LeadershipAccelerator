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

**Every record carries a visual story, and the gate refuses one that does not.** Since
2026-09-16 (Ali, on approving the CORA pilot: "harden the skill so every case study moving
forward follows this format") publish-gate rule 21, `visual_story_missing`, refuses any
snapshot with no `visualStory` that draws a workflow. §8d is therefore a required step,
not an option: author it after the evidence and the metrics, from the record only. It
draws the flow and charts the figures the record already verifies; it introduces no
number. A record with no verified outcome still draws how its system works and shows no
figures; the band says so in words.

**Start section 8 (images) FIRST.** Dispatch an agent to find or produce the real
images before anything else begins — it takes longer than the rest and a case study
without pictures reads as unfinished however good its evidence is.

**The cover is a picked thumbnail, not a screenshot (§8f).** Since 2026-09-18 (Ali: "harden
this process so we always find thumbnail pictures for each project like this") every record
gets three YouTube-style concepts from the image model, Ali picks one, and it becomes the
cover and the video poster. The real captures stay on the record as evidence in the body.

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

**A COLLECTED METRIC ALREADY HAS ITS EVIDENCE. Do not write one by hand.** When a
manifest registers a collector (§5), the sync creates the `case_study_evidence` row
itself, pinned to the commit the figure was computed at, with the reproduce command in
the description. Writing a second row by hand gives the record two pieces of evidence for
one number that can then disagree, and the gate blocks a figure whose commit does not
match the one the record is pinned to (`metric_collected_sha_mismatch`).

The hand-written block above is for figures the repository cannot compute.

---

## 5. Metrics — work the whole candidate list

A case study once shipped with **one** metric, and that one already existed on the
record. Eight candidates had been listed in the brief; seven were never attempted.

**Build a candidate table and fill every row.** No candidate silently skipped:

| Candidate | Shape | Collector | Built | Value | Evidence | Reason if not |
|---|---|---|:--:|---|---|---|

**If the repository can compute it, you do not type it.** Register the collector in the
manifest and let the sync produce the figure, the methodology, the limitations and the
reproduce command together, pinned to a commit. A number you typed is a number somebody
has to trust; a number the repository computed is one they can re-derive.

The five collectors, and the shape each produces:

| `collector` | Shape | What it counts |
|---|---|---|
| `test_files` | share | Test files as a share of source files. |
| `modules_with_tests` | ratio | Named modules that have a test file, out of all of them. |
| `decision_records` | count | Decision records committed to the repository. |
| `commit_span` | span | First to last commit date, and how many commits fall inside. |
| `commits_per_week` | series | Commits per calendar week across that span. |

Register one in the repository's `case-study.json`:

```json
{ "outcomes": [
  { "key": "modules_with_tests", "label": "Modules with a test file",
    "collector": "modules_with_tests" }
] }
```

`value_display` becomes optional once `collector` is set. Leave it out. A collector that
cannot compute its figure creates **no metric at all** rather than a zero, so a missing
card is the honest answer and not something to fill in by hand.

For anything the repository cannot compute, keep writing metrics by hand and give them a
`shape` and a `payload` yourself where one fits. A hand-written ratio still renders a
meter and still names its members; it just does not come with a reproduce command.

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

### 5a. At least one metric must COMPARE, not just COUNT

Sort every candidate into two kinds before writing any of them:

| | What it says | From the live CoreOps record |
|---|---|---|
| **Change** | it is different now, and here is what it was | *7 modules · 4 with tests* — baseline: "A policy comment, which is what an unenforced boundary looks like." |
| **Scale** | how much of a thing there is | *46 test files* — baseline: "n/a — this sizes the test surface rather than comparing it." |

Scale metrics are legitimate and easy to verify, which is exactly why a record drifts
into being **all** of them. Four counts of the repository's own contents is an inventory,
not a result, and a reader who wanted to know whether the work mattered leaves without
an answer.

**Ship at least one change metric, or say in the measurement narrative why the record
has none.** A build with no before-state is a real situation — greenfield work has
nothing to compare against — and naming that is stronger than dressing four inventories
up as outcomes.

**`baseline: "n/a"` is the tell.** When you write it you have just built a scale metric.
That is fine once; if it is true of every card, the set is wrong.

**THIS IS NOW A GATE RULE, NOT ADVICE.** It was advice for months and the library drifted
anyway: on 2026-09-12 all fourteen published figures across the three live records were
scale metrics, and three of them were deficiencies standing in the slot a reader reads as
the result — 0.7% test coverage, 16% test files, and a commit cadence under four a week.
The hero row was cleared on all three, and two blockers now stop it recurring:

| code | fires when |
|---|---|
| `headline_metric_is_a_bare_count` | a headline figure has no `ratio`/`share`/`series` shape, no two-ended `span`, and no stated `measurement.baseline` |
| `headline_metric_missing_plain_answers` | a headline figure is comparative but does not carry all three of §5b |

A scale metric is still perfectly publishable **in the measurement section**, which is
where "we built eight agents" is an honest thing to say. The rule only governs the hero.

**An empty hero row is allowed and is often the right answer.** The public strip renders
without it, falling back to the facts and indicators, and a record that opens with no
figure reads better than one that opens with an inventory. If the work has no comparison
to show, show none and say why in the measurement narrative.

The second rule is the one that catches a bad figure the first cannot. A machine cannot
tell pride from embarrassment, so it does not try; it asks the author to write "what this
does not tell you" beside the number. Writing that line about one file in a hundred and
forty-two is usually enough to stop the card.

### 5b. Plain language: the three answers every figure owes a reader

A shaped metric renders three short blocks under its picture, and they are written by a
person. **A collector never writes these.** It can count files; it cannot tell you what
the count means to somebody who did not build the thing.

| Block | The question it answers | Write it as |
|---|---|---|
| **What this counts** | what is actually in the number | one sentence naming the unit and the boundary |
| **Where it came from** | why anyone should believe it | the source, and the moment it was taken |
| **What it doesn't tell you** | what a reader must not conclude | the honest limit of the figure |

From the live CoreOps record:

> **What this counts** Source files under `guardrails/` that carry a matching test file.
> **Where it came from** The repository tree at the pinned commit, by filename.
> **What it doesn't tell you** Whether those tests assert anything useful.

**All three or none.** The API sends a complete set or nothing, and the gate warns on a
shaped metric with no `plain`. The reason is not tidiness: a figure that says what it
counts and where it came from, but not what it cannot show, is the exact shape of an
overclaim. Two thirds of an answer reads as more certain than the number is.

Three rules that have already produced weak blocks:

- **Write to the reader, not to the reviewer.** "Test files are identified by name" is a
  note to yourself. "A file named after a module may test almost none of it" is the
  sentence that earns trust.
- **The third block is not a hedge.** It is the specific thing this number cannot
  establish. "Results may vary" says nothing; "this counts files, not coverage" says
  exactly what a sceptic was about to ask.
- **Plain language replaces the definition list, it does not sit beside it.** A card with
  `plain` renders the three blocks instead of BASELINE / UNIT / SAMPLE / METHODOLOGY. If
  the methodology paragraph carries something the three blocks do not, it belongs in
  "Where it came from", not in a second list underneath.

### 5c. Write each field for the card it renders into

The reader never sees the object. They see, in this order:

```
  <valueDisplay>                ← large, carries the whole claim
  <label>                       ← the sentence under it
  <verificationClass>           ← "verified"
  BASELINE     <baseline>       ← labelled rows, in this order
  UNIT         <unit>
  SAMPLE       <sample>
  METHODOLOGY  <methodology>
  LIMITATIONS  every entry, in full
```

Four consequences, each of which has already produced a weak card:

- **`valueDisplay` is the entire headline.** It must read as a complete phrase on its
  own — *"14 decision records"*, not *"14"*. Nothing else renders beside it.
- **`unit` is metadata, and the card decides whether to print it.** Write `valueDisplay`
  as the complete phrase and set `unit` to the bare token. The renderer suppresses the
  UNIT row when the value already says that word, so *"14 decision records"* no longer
  sits above a row reading UNIT: records. **You do not have to trade one against the
  other.** A unit that adds something the value does not say — `41%` with unit
  `percentage points` — still prints, which is the case the rule exists to protect.

  Measured, not guessed: **13 of the 14 metrics published across the three live records
  repeated their unit.** That is what makes it a rendering decision rather than fourteen
  separate authoring slips.
- **`methodology` is the card's body.** It is the longest text in the card and the only
  place a sceptical reader can check your working. A single clause leaves the card
  visibly empty; write the paragraph that lets someone reproduce the number.
- **Every `limitation` is printed, in full, verbatim** — nothing truncates them. Write
  them as sentences addressed to the reader, not as internal caveats. *"A file count is
  not coverage, and 46 of 292 says nothing about which 46"* does more for the record's
  credibility than the metric above it does.

### 5d. The headline decision is public

`isHeadline: true` selects `headlineMetric` in the **summary** projection — the payload
every index card and every brand surface reads. It is not an internal ranking. It is the
one number chosen to represent the whole record to somebody who has not opened it.

Pick the metric that best answers *"did this work?"*. That is usually a change metric,
and it is almost never the largest number.

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

The same no-angle-bracket rule binds every label in the visual story (§8d); when the
story draws the flow, the Mermaid drawing folds under "View technical proof".

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

**Since 2026-09-18 the cover is the §8f thumbnail.** Everything in this section still
governs the REAL images: at least two captures of the work, which appear in the body, and
which stand as the cover only until Ali has picked a thumbnail. Never skip the search for
real captures because a thumbnail is coming: the thumbnail is atmosphere and proves
nothing; the captures are the evidence.

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
4. **A rendered metric chart, for UNSHAPED metrics only**:
   `scripts/renderCaseStudyMetricChart.js` draws measured values with the reproduce
   command printed underneath. **A shaped metric already draws itself.** The card renders
   a meter, a chip grid, a date bar or a sparkline from the payload, live and in the
   reader's theme, so rendering a second static picture of the same numbers puts two
   charts of one figure on the page and gives the reader a version that cannot update.
   Reach for this tier only when a figure has no shape.
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
- [ ] The cover and the video poster are the §8f picked thumbnail, and every real capture
      is in the body (the old cover included)

---

### 8a. What the builder already made beats anything you can produce

The rule above is about pictures. It generalises, and it is the more important half:
**search the repository for what the builder actually produced before you create,
generate, or commission anything.** A case study about someone's work that illustrates
itself with our own output is a case study about us.

**Look in `artifacts/` first.** It is one of only four paths the platform lets a build
write to (`CLAUDE.md`, `docs/`, `.colaberry/`, `artifacts/` — see `PATH_ALLOWLIST` in
`renderDocs.ts`), and it is the one reserved for what the build produced rather than what
the platform wrote. It is also the folder this skill never mentioned until 2026-09-14,
which is why builders' own output was being walked past.

```bash
ls -R <repo>/artifacts 2>/dev/null | head -40
find <repo> -maxdepth 3 \( -name "*.pdf" -o -name "*.pptx" -o -name "*.csv" -o -name "*.ipynb" \) \
  -not -path "*/node_modules/*" | head -20
find <repo> -maxdepth 2 -iname "*report*" -o -maxdepth 2 -iname "*eval*" -o -maxdepth 2 -iname "*demo*" | head -20
```

Anything found maps to a real `artifact_type`, and the set is wider than screenshots:
`screenshot, architecture, photo, demo, deck, roadmap, report, evaluation, code,
document, other`. A learner's evaluation notebook is an `evaluation`. Their slide deck is
a `deck`. Their exported results are a `report`. Each is stronger on the record than
anything generated, because the builder made it while doing the work.

Set `source_type: 'repo'` and `source_commit_sha` on anything taken this way, so the
record states which commit it came from and a reader can go and look.

### Does it make sense? Three questions, all of which must pass

Finding an artifact is not a reason to publish it. Ask, in this order:

1. **Does it show the work, or does it show the tooling?** A screenshot of the running
   system, an evaluation of its outputs, a deck presenting it: these show the work. A
   `package.json`, a CI badge, a folder listing: these show that software exists.
2. **Would it mean anything to someone who did not build it?** An architecture diagram
   usually survives this. A raw log file usually does not. The test is the same one the
   metrics learned on 2026-09-13: a thing that only the builder can read is inventory,
   whatever format it is in.
3. **Is it honest at the moment it is shown?** An empty state, a half-seeded dashboard, a
   demo pointing at a dead endpoint — all real, all in the repo, all misleading on a
   record. Nine CoreOps tabs were captured and four were honest empty states; the useful
   one had six times the text of the tab captured first.

A found artifact that fails any of the three is left where it is. **Nothing is better than
something that does not make sense** — the same standing rule the hero row learned.

### Two things that will bite

**Promotion is a button, and a candidate is invisible until you press it.** Approve an
artifact on the Studio's **Visuals** tab ("Approve + publish"), which calls
`PATCH /api/admin/case-studies/:id/artifacts/:artifactId` and sets `status: 'approved'`,
`visibility: 'public'` in one idempotent write. Nothing else moves an artifact off
`candidate`, and `projectArtifacts` silently drops anything that is not approved, so a
record can carry sixty candidates and render none. (This section said on 2026-09-14 that
the promotion path had no caller. It did; the file's header describes the gap it was
written to close, not the present. Read headers here as dates, not status.)

**A private repo is a publish blocker, not a warning.** An artifact whose `public_url`
points into a private repository trips `private_repo_exposed` at the gate. Check the
repository's visibility before promoting anything that links into it, rather than at
publish time when the refusal costs a round trip.

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
- [ ] **At least one metric compares** — not every baseline is `n/a` (§5a)
- [ ] **No card says its unit twice** — read `valueDisplay` and the UNIT row together (§5b)
- [ ] **Every limitation reads as a sentence to the reader** — they render in full (§5b)
- [ ] **The headline metric is the one that answers "did this work?"** (§5c)
- [ ] `pageScrollW === viewportW` at 1440 **and** 390
- [ ] Diagrams are in the architecture section, not standing in for a picture
- [ ] If the record carries a visual story (§8d): the band sits under the context strip,
      the strip prints no duplicate headline figure, and the band renders at 768 too
- [ ] `problems[]` is empty
- [ ] **On all three surfaces, not the one you previewed:** the rail, the status board, the
      folds and no empty "Who built it" (the §8e marker table), and the flow in lanes at 1440.
      A format checked on one site is a format shipped on one site.

---

## 8c. The walkthrough video — EVERY record gets one

**A record without a narrated walkthrough is not finished.** Ali, after the first one
shipped: *"go ahead and create for the other case study and also harden the Case study
skill to include these videos on every case study creation."*

It is roughly 80 seconds, 1080p, and it sits in the **masthead's picture slot** on all
three surfaces — not in a band underneath. That was tried and it opened a record with two
visuals doing the same job: the cover screenshot, then a film of the same product, with
the reader scrolling past the first to reach the second.

Toolchain: `scripts/walkthrough-video/`. Read its README before starting; it carries the
failures below with the commands attached.

```bash
python make_narration.py --deck <dir>/deck.json   # neural voice -> audio/ + timings.json
python build_video.py    --deck <dir>/deck.json   # slides + footage + audio -> mp4
python make_vtt.py       --deck <dir>/deck.json   # the accessible caption sidecar
```

`make_narration.py` runs FIRST. Segment durations come from how long each sentence
actually takes to speak, not from the deck's guesses, or a slide ends mid-word.

### The captions exist TWICE, on purpose — and only one of them may be shown

`build_video.py` **burns the narration into the picture**. `make_vtt.py` writes the same
sentences again as a `.vtt` sidecar. Both are deliberate and neither is redundant: a
burned-in caption cannot be read by a screen reader, resized, translated or turned off,
and a `track` element needs a real file.

**So the player must NOT mark that track `default`.** It shipped that way and put two
read-overs on the same frame on two live records — the burned-in grey box, and the
browser painting the identical words underneath it in its own black bar. The track stays
attached, reachable from the CC control and to assistive technology, which is the job it
was written for.

It is also worth knowing that `crossorigin="anonymous"` on the `<video>` is load-bearing
for the captions and nothing else: a cross-origin `track` is refused without it, the
track's `readyState` goes to 3 and the cue list stays empty while the video plays
perfectly. Nothing looks broken except the missing captions.

**Check it on the rendered page, not in the markup.** The two layers are only obviously
two layers when you look at a frame:

```js
// captions the browser is painting — should be 0 showing, with the cues still there
[...document.querySelector('video').textTracks].map(t => ({ mode: t.mode, cues: t.cues?.length }))
```

And to see what is burned in, pull the file rather than trusting the player, which will
not have buffered anything under `preload="none"`:

```bash
ffmpeg -ss 8 -i walkthrough.mp4 -frames:v 1 -y frame.png
```

### Every figure it narrates is already a metric on the record

The video is a **second surface for the same claims**, never a place for new ones. If a
number is spoken or printed on a card, it is a published metric on the record underneath,
with its methodology, denominator and limitations. A figure that exists only in the video
is an unverified claim that happens to be made of pixels and audio — the exact thing the
publish gate exists to stop, arriving through a door the gate does not watch.

Write the deck AFTER the metrics are authored, and take the numbers from the projection
rather than from your notes.

### What it is made of, in order of preference

1. **The project's own demo recording**, if it committed one. Cropped to the application
   window, held at its real rate — a 1.3fps timelapse shown as slow stills is honest;
   interpolating it into motion the source never had is not.
2. **Its real screenshots**, the same ones the record already publishes as artifacts.
3. **Its own architecture diagram**, rendered from `diagramSource`.
4. **Typographic slides** carrying the record's own sentences.

Nothing is generated, staged or restaged. There is no fifth option. The visual story's
workflow illustration (§8d) is NOT slide material: it is an illustration drawn by the
team, and a film that shows it as if it were the product is exactly the fault §8 forbids.

### CHECK EVERY FRAME FOR PEOPLE

A learner's demo recording is usually a recording of **their own profile**, and it will
contain their name, their photograph and their personal email address. The Repo2Reputation
recording did, from frame 60 onwards.

Choose footage windows that land only on placeholder-state frames, then **open the highest
frame index you actually used and look at it**. Re-do this for every subject; it is not a
property of the tool, it is a property of the recording.

### The voice

**Check what is already installed before offering anybody a trade-off.** The first cut
shipped with the built-in Windows SAPI voice, presented as "the option that needs no
install", and Ali's verdict was `voice is horrible`. `edge-tts` — Microsoft's neural voices
— had been installed on the machine the whole time, so the provisioning gate that made SAPI
look like the only free choice never applied.

Default to `en-US-AndrewNeural`. Audition two or three first; it takes a minute. Their
personality tags differ and the register matters. **The narration text is the caption text**
— what is heard and what is read are the same sentence, or you are maintaining two scripts
and they will drift.

The endpoint returns `NoAudioReceived` intermittently under a burst. That is transient, not
bad input; the retry is already in `speak()`, so do not remove it and conclude otherwise.

### It is NOT an artifact

`demo` exists in `CaseStudyArtifactType` and attaching it there is the obvious move. Do not.
It would put a video in the artifacts carousel at a screenshot's aspect ratio **and make it
a hero candidate through `HERO_IMAGE_PRIORITY`** — and a video that can win the cover is a
video that can stand in for a screenshot of the running system.

It is its own top-level snapshot section:

```js
applyHumanOverride({ path: 'walkthroughVideo', value: {
  url, title, captionsUrl, posterUrl, durationSeconds, narrationSource: 'synthetic',
}})
```

`narrationSource: 'synthetic'` makes the page say so. An unlabelled synthetic voice is a
small deception and this system's whole claim is that it does not make those.

### Three ways this fails silently, all of which shipped

- **`ffmpeg -ss` into an animated GIF.** Seeks to 1s and 11.5s worked; a seek to 30s
  produced a segment with **no picture at all** and exit code 0. Pull frames by index with
  Pillow instead.
- **The concat demuxer drops unreadable segments and still exits 0.** `ffprobe` the
  finished file and compare against the intended length. **Short** means a segment was
  dropped; **long** means one overran its trim. Never compute the duration.
- **A cross-origin caption track is refused.** The `.vtt` and `.mp4` are served from the
  platform while two of the three pages are on other domains, so both need
  `Access-Control-Allow-Origin` **and** the player needs `crossorigin="anonymous"`. Miss
  it and the video plays perfectly, the `.vtt` returns `200 text/vtt`, and the captions
  simply never appear. `HTMLTrackElement.readyState` **3 is ERROR, 2 is LOADED** — it was
  misread once and reported as working.

### `docker cp` is not a deploy

The video is baked into the nginx image from `frontend/public/site-v2/`. A copied-in file
survives only until the container is next recreated, which on a box where other sessions
deploy can be **nine minutes**. It silently reverted a re-recorded narration to the
previous voice while the URL still returned 200 and the right byte count at the moment it
was checked.

Commit the file, merge, rebuild nginx. Verify with **md5 against the local file**, not a
status code: two different videos both return 200.

### Done means

- [ ] Every figure spoken or shown is a published metric on the same record
- [ ] Every frame used has been checked for a person's name, face or email
- [ ] `ffprobe` duration matches intended, within a second
- [ ] The caption track reports `readyState: 2` and a **non-zero cue count** on all three
      surfaces, not just the same-origin one
- [ ] The player renders in the masthead and above the fold on all three
- [ ] The file was verified live by md5, after an nginx rebuild

---

## 8d. The visual story (required): the flow drawn, the figures charted, from the record only

Every record carries a `visualStory` section on its snapshot: a **workflow illustration**
(single-state, or Before/After when the before-state is evidenced), up to **three outcome
cards**, and up to **six charts**. The public page renders it as one band directly under
the context strip, above the first prose section; when the band shows cards, the strip
prints no headline figure, the measurement section folds its metric cards under "Full
notes on all N metrics" (the figures are already on the page once), and the Mermaid
drawing folds under "View technical proof". **The gate refuses a snapshot without one**
(`visual_story_missing`, rule 21): presence and a workflow are required, figures are not.
Every record published before 2026-09-16 was migrated the same day; a record with no
verified outcome carries a workflow-only story and the band says it shows no figures.
§8d is the whole rule set; the rest of this file still applies to every word and figure.

**The drawing fits its width.** The layout sizes the flow to the canvas it is given and
falls back to one column when a step would be unreadable; the page never scrolls sideways
for it. Keep labels short (40 characters) and steps few (a panel over about eight columns
becomes a column on a laptop); a connection label the drawing has no room for is said in
the step panel under "Reached from", so nothing is lost, but a flow that reads only from
the panel is a flow with too many steps.

### What it is not

- **Not a new section key.** It carries no `data-section`; the surface profiles, the
  section vocabulary and `sectionOrder` are untouched. Presence of the section is the
  flag; `enabled` plus the `surfaces` list inside it decides which sites show it.
  **`surfaces` lists every surface the record is published on.** Ali, 2026-09-16: "They
  need to be done for all the published sites." Every site draws the same band:
  Enterprise in React, aiflotation.com and training.colaberry.com through the
  framework-free port in `packages/case-study-shell` (`case-study-visual-*.js`, kept
  equal to the React geometry by `storyVisualShellParity.test.ts`; the training site
  vendors those files verbatim under `src/vendor/case-study-shell`). A story on one
  surface only is the exception, and needs a reason in the record.
- **Not a place for a number.** Every card is a **metric key**; every chart anchors on a
  metric key; a chart part is a metric key or a literal that carries its own denominator
  **and** an `evidenceId` the record already holds. The projection resolves each figure
  from the verified metric at request time, so the story can never disagree with the
  metrics beneath it. If a cited metric loses verification, the whole story drops, not
  one card.
- **Not telemetry.** The particles are illustrative, fixed cadence, and the band says so
  in words. The motion note is part of the section and is claim-scanned like prose.

### Where it lives, and the one way to write it

Snapshot content, key `visualStory`, schema version 1 (`backend/src/types/caseStudy.ts`,
limits in `caseStudyVisual.ts`). Authored as a **whole section** through the override
path, like everything else in §3: `applyHumanOverride` with `path: 'visualStory'`
validates it (`caseStudyVisualStoryValidate.ts`) before any write and refuses with
`{path, code, message}` per field. It survives sync as a human override; a sync that
changes the sections it was drawn from marks it **stale** (the Studio shows the badge)
and never regenerates over a person's work.

The Studio's **Visuals tab, Visual Story panel** is the only authoring surface:
`Generate from evidence` (`POST /api/admin/case-studies/:id/visual-story/generate`,
reads only) draws a single-state workflow from the architecture diagram, picks the
headline and comparative metrics as cards, and proposes one chart per ratio or share
metric by its guardrail. Edit the words in the row editors, `Preview changes`, then
`Save`. A generated draft is `enabled: false` on no surface: turning it on is your act.

### Chart mapping: the metric's shape decides the chart, never the other way round

| Metric shape on the record | Chart kind | What it needs | What it refuses |
|---|---|---|---|
| ratio or share, parts of one whole | `composition` | parts that sum to the denominator (the remainder is named in the table) | a part with no figure |
| ratio, with a "N of M" baseline in the measurement notes | `comparison` | both windows as parts, a visible `caveat` naming the windows | anything read as a trend; a bar without a denominator |
| ratio or share | `share` | the anchoring metric | a literal part without evidence |
| two summary statistics (median and p90, say) | `two_value` | exactly two parts, a `unit`, an `axisMax` | a third part; a value over the axis |
| a zero over a real denominator | `zero_card` | the anchoring metric at 0 of N | a non-zero anchor; a missing denominator |

No line, no dates on an axis, no kind that reads as a trend: a title containing
"trend", "over time", "per week" or "growth" is refused unless the kind is comparison.

### Workflow guardrails

- Every node key unique; every edge joins two known nodes; no self-loop; every node
  reachable from the initial step (`node_unreachable`); at most 16 nodes and 24 edges
  per panel. Labels 40 characters, sublabels 48, kicker 60, detail 280, evidence 240.
- A **before panel exists only when the before-state is evidenced.** The generator
  never invents one; it draws `single_state`. Author a Before/After pair by hand and
  cite where each before-step's proof lives in its `evidence` text.
- Roles (`human`, `system`, `external`, `data`), statuses (`processing`, `resolved`,
  `attention`, `failure`, `unknown`) and lanes (`primary`, `recovery`, `manual`) are
  closed lists and render as words as well as colour.
- No `<`, `>`, `@`, URL or control character in any text (§7 applies here too).
- A node's `metricKey` shows that metric's verified value beside the step as a tally,
  with the same verification badge as every other figure.

### The gate and the scanner

Blocker `visual_story_invalid` (rule 20) runs the same validator on every publish and
names up to eight refusals by path. The claim scanner reads the workflow title, caption,
description, motion note, every panel label and summary, every node label, sublabel,
kicker, detail and evidence, every edge label and condition, and every chart title,
caption, caveat, limitation and part label. **A percentage in any of those must be
carried by a verified metric on the record** (§6), the same rule that forced a
`missing_event_rate` metric onto the CORA record on 2026-09-15 when "4.2%" appeared in
its prose; a caveat on a chart is prose to the scanner.

### Previews

`scripts/previewStoryLayout.js` renders the band with the rest of the page; pass the
`{surface, caseStudy}` envelope with the projected `visualStory` in it. Check 1440,
768 and 390 (`pageScrollW === viewportW` at all three; the graph is one 360-wide
column below 768 and scrolls inside its canvas at natural size above), and once with
`prefers-reduced-motion` on: no `.cbv2-story-visual__particle`, and the pause control
reads "Reduced motion". Every figure is visible as text before any animation: the
cards rest at the final figure until they scroll into view, so a capture taken before
the count-up shows the true wording, never "0%".

### Done means

- [ ] Every card and chart anchor is a verified, publishable metric on the same record
- [ ] Every literal chart part carries a denominator and an `evidenceId` the record holds
- [ ] The before panel, if any, cites evidence in its own words
- [ ] `readVisualStoryState` reports `validation.ok: true` and `stale: false`
- [ ] The gate passes with no `visual_story_invalid`
- [ ] `enabled: true` with `surfaces` equal to the record's published surfaces (every
      site draws the band); fewer only with a reason recorded
- [ ] The rendered band checked at 1440, 768, 390 and under reduced motion
- [ ] The hero and the walkthrough video are unchanged

---

## 8e. The story: a person, three decisions, a closing, written per surface

Piloted on the CORA record for training.colaberry.com on 2026-09-17, revised twice on Ali's
review, then approved as the format for every record ("Let's harden this format"). The
visual story (§8d) shows the system; this section is what a reader remembers: who did it,
what they chose, what it cost, what it showed.

### The arc, in the order the page tells it

person (once) → concrete stakes → the first attempt → the decisions → the complication →
the outcome → what it demonstrates. Greenfield work has no earlier failure; never
manufacture one. A demonstration stays a demonstration: no prose upgrade to measured
impact, and no figure on a card that is not on the record.

### Where each part lives, and who orders it

The **surface profile** places three section keys, `decisions`, `builder` and `closing`
(`caseStudySurfaceProfiles.ts`; keys in `CaseStudySectionKey`). Every renderer draws bands
in `surface.sectionOrder`; a renderer that predates a key ignores it. The placements:

| Surface | decisions | builder | closing |
|---|---|---|---|
| enterprise | right after `situation` | after `roadmap` | after `repositories`, before `cta` |
| training | right after `situation` | after `roadmap` | after `builder`, before `repositories` |
| ai-flotation | right after `architecture` | before `contributors` | before `cta` |

Do not move a section by editing a page. Move it in the profile, and every site follows
(`caseStudySurfaceLens.test.ts` pins the placements).

The **words** live on the snapshot, per surface, in `content.surfaceVariants.<surface>`
(`CaseStudySurfaceVariant`: `standfirst`, `situation`, `measurementNarrative`,
`metricNotes`, `contributors`, `builder`, `decisions`, `closing`). `resolveSurfaceContent` lays the surface's variant over the canonical content
(`caseStudySurfaceVariant.ts`). A surface with no
variant reads the canonical words; a record with no variants projects byte-for-byte as
before variants existed (`caseStudySurfaceVariant.test.ts`). A variant never carries a
figure: `valueDisplay` and `payload` are not in the type, so the numbers are the same on
every surface and the metric rules still hold.

### Publishing one surface without touching the others

`applyHumanOverride` republishes EVERY live surface of the record. When one surface must
stay pinned (a pilot, a revision under review), compose the same services by hand, inside
the backend container:

1. `applyOverrides(content, [{ path: 'surfaceVariants', value, actor, recordedAt, note }])`
   with the WHOLE map (merge the other surfaces' variants in unchanged);
2. `persistCaseStudySnapshot({ status: 'draft', draft: { ..., generatedBy: 'human_edit',
   contentHash: hashCanonical({ content, sourceCommitMap }) } })`;
3. `approveSnapshot`; 4. `publishCaseStudy({ surfaceKey })` for each surface you mean.

The committed script does all four, and refuses to write until it has shown you the
result: `backend/src/scripts/publishCaseStudyVariants.ts` (inside the container,
`node dist/scripts/publishCaseStudyVariants.js <slug> <variants.json> --surfaces a,b [--apply]`).
Without `--apply` it is a dry run: the gate for every surface over the composed content, the
projection diff of every surface NOT named (must be empty), the story review per named
surface, and each named surface's current `published_snapshot_id`, which is the rollback
(`approveSnapshot(previous)` then `publishCaseStudy(surface, previous)`). It stops if a named
variant names a contributor the record has not consented to, and never writes consent.
`--remove <surface>` returns one surface to the canonical words, which is the rollback when
the record's identity has changed since the previous snapshot and rule 5 would refuse it.
Record the ids the dry run prints in `deployment-log.md` before you apply.

### The person: facts by class, consent by the record

Four classes of fact, never mixed and never upgraded by generation:

| Class | Example | Where it may appear |
|---|---|---|
| user-confirmed biography | "joined as an intern; hired; now an AI Systems Architect" | `builder.intro`, `builder.progression`, standfirst; ONLY with the person's name released by consent |
| repository-supported contribution | "built the detection query, the panel, the replay job" | `builder.contribution`, `builder.skills[].evidence`; stands under the role title without a name |
| internally measured outcome | "586 of 604 resolved" | metrics, cards, decision figures |
| personal reflection, quotation | anything the person felt or said | NOT on the record until the person supplies it and permits it; there is no field for it |

Consent is a **record fact** (`builder_identity_mode`, `builder_naming_consent`, the
contributor's `consentRecordedAt`). The author never writes it and never implies it. The
projection releases the name and the biography only when `builder.displayName` equals a
contributor the consent gate projected as named for that same content; rule 5 refuses a
profile whose name is not such a contributor. Everything else on the card (role title,
organisation, contribution, skills) is a project fact and crosses without a name.

**Sparse author.** No consented person: the card credits the role. `displayName` is the
EMPTY STRING (rule 5 refuses any non-empty name that is not a consented contributor, even
though the projection would withhold it; the rollout hit this on three records at once),
`intro` and `progression` empty, `initials` one letter for the role so the mark is not a
blank circle ("L" for a learner, "C" for the Colaberry team), contribution and skills from
the record. That is a valid story: the review prints `story_biography_unavailable` as a
note, not a warning. Write the gap in the handoff ("no consented author; role credit"); do
not invent a person, a placeholder or a team name the record does not carry. Do not
interrupt Ali for an optional interview.

**Names.** "Kes" only, never expanded; verify any full name against an approved profile
before it appears anywhere, including links. (The verifier found the repository owner's
GitHub handle inside evidence `href`s of the CORA payload: pre-existing, and on Ali's list.)

### The decisions: three cards, each pinned and each closing on a figure

`CaseStudyDecision`: `title`, `problem`, `decision`, `evidence`, `consequence` (all
required; a card missing one is not drawn), `stage` (the label of a node in the workflow
drawing, e.g. "Detection query"; the card reads "At Detection query"), `figure` (what the
card closes on, as displayed: "28 Apr", "0", "97%"; the consequence is its caption).

- Three is the number. One choice is a feature; five is a list.
- `stage` names a node of the drawing the reader has just scrolled past, in the node's
  own words shortened, so the two can be found together.
- `figure` is a value that is on the record: a metric's display value, a date on the
  timeline, a count in the evidence. A demonstration's cards may close without a figure;
  the review notes it and moves on.
- `evidence` is one line naming where the claim lives (build timeline, architecture
  narrative, measurement notes, the two screenshots).
- No card repeats the situation. The problem line is the specific fork, not the backstory.

### The closing

One paragraph, `closing` (variant or canonical): what the work shows about the role, the
one or two figures that carry it, and the gaps stated as gaps. Every statement on the
record. Do not write "the gaps made the next priorities clear" when the roadmap marks
them "not pursued". No CTA language; the profile's CTA follows it.

### One introduction

The standfirst introduces the person once (name, the shortest true progression). The
situation opens on the problem, not the biography. The builder card is the one place the
progression is drawn. `story_situation_opens_on_biography` and
`story_progression_repeated` (the review, below) catch the repeats the pilot shipped with.

### The compact ending: a THREE-SURFACE contract (approved 2026-09-17)

From "Who built it" down the training page shrank from 4,227 px to 1,871 px at 1440 with
nothing leaving the record: the build as a horizontal rail with staggered labels (compact
rows under 900 px, never a horizontal scroll), the roadmap as a status board, the
architecture's first paragraph and stack with the rest folded, the measurement narrative
in one paragraph (two columns at 1100 px and up), "Who built it" standing down when the
builder card names the only contributor. Every fold reads "Notes on N of the M ..." so the
reader knows what is behind it.

**It shipped on one surface and was published on three.** The format was built for the
training site and the note here said to port it "when the format reaches" the other two.
Nothing made that happen, so Case Study #2 went live on Enterprise with a 1,274 px dated
list, a 1,034 px roadmap and an empty "Who built it" heading, and on aiflotation.com with
the same lists and the workflow drawn as a stack of boxes. Ali, looking at them: "the
timeline is not on the aiflotation side and I'm not feeling the chart here. It's just not
even close to the same effect. Same thing with enterprise." All three renderers now draw
it (training `RecordBands.tsx`, Enterprise `StoryLowerV2.tsx` and `StoryArchitectureBand`,
AI Flotation `packages/case-study-shell/case-study-record.js`), and the rule is:

**A change to how a story reads is not done until all three surfaces draw it.** A page
format is a contract across the training site, `enterprise.colaberry.ai` and
`aiflotation.com`, not a feature of whichever one was looked at first. Before calling any
record or format change done, open the rendered page on each of the three and find, by
eye and by selector:

| Marker | Training | Enterprise | AI Flotation |
|---|---|---|---|
| The build as a rail | `.cs-rail` | `[data-testid="story-build-rail"]` | `.cs-rail` |
| The roadmap as a board | `.cs-next` | `[data-testid="story-roadmap-board"]` | `.cs-next` |
| The long text folded | `details.cs-measure-fold` | `[data-testid="story-technical-proof"]` | `details.cs-measure-fold` |
| No empty "Who built it" | band absent | band absent | band absent |
| The flow in lanes at 1440 | horizontal | horizontal | horizontal |

The flow rule behind the last row: `layoutWorkflowToFit` keeps the horizontal composition
on any desk-width viewport and lets the SVG scale into a narrow canvas, up to 1.6 times
the canvas width, rather than falling back to a column (aiflotation.com's record column is
1,024 px against training's 1,384, which is what stacked it); the shell also lets the band
break out to 1,280 px where the column is narrower. A column at 1440 on any site is a bug.

`shellLowerHalf.test.ts` runs the AI Flotation renderer against a real projected envelope
and fails without the rail, the board or the fold; `storyLowerV2.test.tsx` does the same
for Enterprise; the training repository's `lowerHalf.test.ts` for training. A new band
that changes the format needs a line in all three, in the same PR set.

### Vocabulary

No em-dash or en-dash anywhere a reader sees (Ali's rule, all published copy). No
editorial bookkeeping in the story: "this revision", "first revision", "review notes",
"candidates from the brief" belong in the handoff. No "n/a" in a metric note: say what is
true or leave it out. Dates read "28 Apr 2026"; times, when any, Central with the zone
written out.

A variant cannot fix a dash in the CANONICAL prose (the situation, the architecture, the
measurement narrative of a record written before the rule). The review names the path
(`story_dash @ architecture.narrative[4]` on the training-system record, found during the
rollout); the fix is a whole-section override of that section through the same
persist-approve-publish path, republishing only the surfaces the record is on
(`publishCaseStudyVariants.ts --canonical <section>=<file>` carries it beside the variants).
Scan every record before you call a rollout done: `reviewCaseStudyStory` per surface prints
the dash paths for the sections it reads.

### The review, before Ali reads it

`npx ts-node -T src/scripts/reviewCaseStudyStory.ts <slug> [surface]` (or
`--file <composed content.json>`) prints `reviewCaseStudyStory`'s findings and rubric for
the latest approved snapshot. It is advisory and exits 0. Warnings: no builder card, no
decisions, an unpinned card, no closing, bookkeeping, a dash, "n/a" in a note, the
situation opening on the biography, the progression repeated. Notes: role-only credit
(biography unavailable), a card without a figure. The rubric scores six dimensions 0 to 2
with the passage or gap cited (`references/story-rubric.md`); the ones marked
"editorial" are settled by a person, and no score ever substitutes for a gate.

### Done means, per surface

- The dry run's gate is CLEAN for that surface and the other surfaces' projections did not
  move; the review prints no warning you did not accept in writing.
- The live API for `?surface=<key>` carries the builder (name only if consented), three
  decisions with `stage` and `figure` as authored, the closing, the standfirst.
- The live page at 1440, 768 and 390 draws the sections where the profile places them, the
  hero and the video untouched, no horizontal scroll, no page error, no "n/a", no dash; a
  capture of each new section in the run directory. training.colaberry.com revalidates a
  page 60 seconds after a publish: the first request after that serves the old page and
  triggers the rebuild (`x-nextjs-cache: STALE`), the next serves the new one. Read it
  twice before calling it wrong.
- The handoff names the previous snapshot id per surface, the editorial gaps, and what was
  not done.

## 8f. The cover and the video thumbnail: three concepts, Ali picks one

Ali, 2026-09-18, after picking from eighteen concepts for six records: *"Replace them as
the image for the case studies and the thumbnail for the videos. The old picture can be
used as an artifact inside the case study, don't throw it away. Then harden this process
so we always find thumbnail pictures for each project like this."* He asked for them to
look like the thumbnails on videos with millions of views, and to be "very custom and
relatable and really pop".

The tools and the step-by-step are `scripts/case-study-thumbnails/README.md`. The rules:

1. **Every record gets three concepts before its checkpoint**, generated with the newest
   OpenAI image model by `generate.js` inside `accelerator-backend` (the key never leaves
   the container). Three different ideas, not three crops of one: a person reacting, an
   object or metaphor with no words, a before and after. One face or one object filling
   the frame, complementary colours, a hook of at most four words.
2. **The hook is a feeling, never a claim.** No figure, date, client name, product
   interface or result in the picture; nothing a reader could take as a measurement. The
   words come from the record's own tension ("LOST CALLS, FOUND.", "NOT YET."), or the
   picture carries none.
3. **Look at every image before Ali does**, word by word. The model invents text on
   props (a card, a screen, a sign): flag it on the review page (`build_review.py`
   `notes`), and if Ali picks it, repaint only that region with `edit.js` and paste only
   that polygon back with `finalize.py composite`. The model does not respect the mask on
   its own.
4. **Ali picks.** Nothing reaches a record until he has named the concept. The review page
   shows every concept at YouTube feed size beside the current covers.
5. **One 16:9 file serves everything** (`finalize.py crop`, 1536x864, the top offset
   chosen so the hook stays in frame): the cover, the index card and the video poster.
   `frontend/public/site-v2/thumb-<name>.jpg`, served by an nginx deploy like any asset.
6. **It is a `photo`, so it is atmosphere.** `apply-cover.js` writes it as
   `artifact_type: 'photo'`, `source_type: 'generated'`, titled `Illustration: <what it
   shows>` (the alt text), described from `cover-caption.json`, and sets
   `identity.heroImageUrl` and `walkthroughVideo.posterUrl` to it in one snapshot. The
   projection stamps a photo `atmosphere` and drops one whose caption claims delivered
   work (`DELIVERED_WORK_CLAIMS`), so the caption says only what the picture shows. Never
   type it `screenshot` to promote it.
7. **The old cover stays.** It is already an approved artifact; once it is not the cover,
   both renderers place it in the body, because the cover is the only image they skip.
   Nothing is deleted, from the record or from `site-v2`.
8. **Only where the record is already live.** `apply-cover.js` republishes on the surfaces
   the record is published on and nowhere else; a record that is not live stops at a
   draft. Its dry run checks the cover resolves, the photo projects as atmosphere, the
   visual story re-validates after its hash is re-stamped, and every live surface's gate
   is clean. `--apply` refuses until the image URL answers 200.

### Done means

- [ ] Three concepts generated, looked at, flagged where the model invented words
- [ ] Ali's pick recorded in the run directory, in his words
- [ ] `thumb-<name>.jpg` live with a 200 before `apply-cover.js --apply`
- [ ] The live API's `heroImageUrl` and `walkthroughVideo.posterUrl` are the thumbnail
- [ ] On all three surfaces the masthead poster is the thumbnail and the old cover is in
      the body

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

### A record about a student project carries that project's maturity

Two blockers were added on 2026-09-11. They fire when the record is **about a student
project**, which the gate establishes two ways: `case_studies.project_id` is set, or the
record has no `project_id` and one of its cited repositories belongs to a student project
(a stored `project_id` on the repository row, or an owner/name match in
`github_connections`). The second route was added on 2026-09-14 because until then
`from-repositories` skipped the rule entirely, and one live record cited a student's
connected repository that way. A record whose repositories belong to no student project
(the enterprise repo, a stranger's repo) never sees them, which is why the library of
records about our own work was unaffected. When several projects resolve, the least
mature and the most unsettled decide.

| code | what it means |
|---|---|
| `maturity_below_operational_result` | Nothing has been measured in real use, so this is a build record or a demonstration, not a case study. |
| `project_truth_has_open_questions` | A story found something that disagrees with what the student confirmed, and nobody settled it. The project's truth disagrees with itself. |

**The ladder is computed on every read and is never stored**, so no column edit can
promote a record:

```
story_hypothesis          an interview happened; nothing built
build_record              a story verified from the repo, or a story that reported what it built
capability_demonstration  a verified story AND something it points at as "watch it work"
operational_result        NOT REACHABLE from a build. Needs an outcome measured in use.
impact_case_study         NOT REACHABLE from a build. Needs that, confirmed by the client.
```

`computeMaturity` cannot return the bottom two rungs of that list. That is deliberate: the
line between "we finished building it" and "it worked for someone" is drawn in code
rather than left to an author's judgement, and the publish gate refuses everything below
`operational_result`.

**So a passing build is not a case study.** If the linked project has no measured outcome,
do not try to write around the blocker. Either the outcome exists and belongs on the
record as a verified metric, or the record is a build story and stays unpublished.

### Read the foundation before you author a linked record

```
GET /api/portal/sbp/intake/:projectId/case-study-foundation
```

Read-only, participant-scoped, and it answers `publishable: false` on the wire because
nothing on the student side can publish. It returns four sections that must **stay apart**
in whatever you write:

| section | what it holds | where it comes from |
|---|---|---|
| `hypothesis` | what the student SAID they would build | the project's truth revision |
| `buildEvidence` | what the stories SHOWED | `repo_evidence` facts, plus a per-story ledger |
| `demonstrationEvidence` | what a story POINTED AT | a test, a file, a URL |
| `outcomeEvidence` | what was MEASURED in use | **empty by construction** until an approved measurement definition exists |

It also carries `maturityReason` and `nextRungNeeds` in plain words, which is the fastest
honest answer to "why can I not publish this yet".

**Blurring those four is how "the tests pass" becomes "the client saved 40%".** A repo can
prove what was built; it cannot prove what the business wanted, what hurt before, or what
success meant. The truth contract refuses `repo_evidence` outright on `success_definition`,
`desired_outcome` and `pain_points` for exactly that reason, so a fact filed under those
dimensions came from a person, never from a commit.

---

## Hardening — what is prevented, and what is only remembered

Audited 2026-09-13 against the source and extended 2026-09-16. **21 blocker codes** run on
every publish, and every path to a live page goes through them: `publishCaseStudy` is
called from exactly two places, `caseStudyAdminRoutes` and `caseStudyAdminReview`, and
nothing writes `case_study_publications` directly. The gate runs on a repeat publish of
an already-live record too, so consent withdrawn between two clicks is caught.

### Prevented in code

| Failure | The guard |
|---|---|
| A record goes live on a surface it was never meant for | `surface_not_publishable`, checked before anything else |
| A draft or an unapproved snapshot reaches a reader | `case_study_not_approved`, `snapshot_not_approved` — the intended resting state of a draft |
| An organisation or a builder is named without consent | `organization_consent`, `builder_consent`, checked against the record row AND the snapshot, which must agree |
| A private repository is exposed | `private_repo_exposed` on the structured path, and again on identifiers typed into prose |
| A figure claims "verified" on the strength of a self-report | `self_attested_verification` |
| A "verified" figure has no evidence behind it | `proof_metadata_missing`, which also demands a baseline, sample or methodology |
| A metric nobody has verified is on the page | `metric_pending`, applied only to figures a human promoted with `publishable` |
| A model's words are published as a quotation | `ai_generated_quote` |
| An outcome or ROI claim appears in prose with no metric behind it | `unverified_claim` |
| A shaped figure disagrees with itself | `metric_shape_payload_mismatch`, `metric_ratio_missing_denominator`, `metric_members_count_mismatch` |
| A figure is computed at a commit the record is not pinned to | `metric_collected_sha_mismatch` |
| A build record is published as a case study | `maturity_below_operational_result` — on a record linked to a student project, or one whose cited repository belongs to one |
| A record is published while the project's truth contradicts itself | `project_truth_has_open_questions` |
| An inventory count stands in the headline | `headline_metric_is_a_bare_count` |
| A headline figure never says what it does not tell you | `headline_metric_missing_plain_answers` |
| A new blocker ships with nothing that triggers it | The coverage sweep in `caseStudyPublicationService.test.ts` asserts every declared code is emitted by some fixture, and fails CI otherwise |
| A blocker an admin cannot act on | Every blocker must carry a field, a remedy, and a message that is not the code restated. Also a test |
| A high readiness score authorising a publish | Readiness is advisory and reported beside the decision, never consulted by it. There is a test named for it |
| A record with no visual story reaches a reader | `visual_story_missing` (rule 21, since 2026-09-16): a snapshot with no story, or a story that draws no workflow, is refused with the Studio's Generate-from-evidence remedy. Figures are not required; presence and a flow are |
| A visual story that stopped being true | `visual_story_invalid` (rule 20): the same validator the save runs, so a metric that lost its verification after the story cited it refuses the publish and names the field |
| A builder profile names a person the record has not released | rule 5 (`builder_consent`, extended 2026-09-16): a profile whose `displayName` is not a named, consented contributor of the same content is refused; the projection withholds the name and the biography on the same condition (`projectBuilder`) |
| A variant says something on a surface it should not | rule 5 refuses a variant keyed on a non-publishable surface; `resolveSurfaceContent` applies a variant to its own surface only, and a record with none projects byte-identically (`caseStudySurfaceVariant.test.ts`) |
| An unbacked figure hides inside a variant, a card or the closing | the claim scan (`collectNarrative`) reads every variant string, every decision card string (`stage` and `figure` included) and the closing, canonical and per surface |
| A story section drawn in a different place on each site | the surface profile places `decisions`, `builder` and `closing`; renderers follow `sectionOrder` (`caseStudySurfaceLens.test.ts` pins the placements) |

### Prevented only by someone remembering — the useful half

> §5a lived here for months. "At least one metric must COMPARE, not just COUNT" was
> true, written down, and enforced by nothing, so the readiness score went up while the
> card row stayed wrong. It moved into the table above on 2026-09-13, after all fourteen
> published figures on the three live records turned out to be inventory. That is what
> this list is for: everything below can drift the same way.

1. **Whether the record is worth publishing at all.** The gate can prove a figure
   contradicts itself. It cannot tell you the story is dull, the narrative is padded, or
   that the record answers a question nobody asked. On 2026-09-13 a set of figures
   measuring the platform's own task-auditing passed every rule here and was still
   wrong, because nothing in code asks "would a reader care".
2. **The cover image, and every other image.** §8 says start them on day one. The gate
   contains zero references to images; a record with none publishes cleanly.
3. **The walkthrough video.** §8c says every record gets one. Nothing enforces it, and
   nothing checks that what the narration counts still exists on the page — the caption
   promised "the verified metrics recorded below" on three records that had none until
   the string was made conditional on 2026-09-13.
4. **Looking at the rendered page.** §8b exists because six layout failures shipped past
   green tests. No rule can replace opening it.
5. **Diagrams with no angle brackets** (§7), **whole-section authoring** (§3), and
   **working the entire candidate list** (§5). All three are prose.
6. **That a record with no figures says why.** Removing a bad card is enforced; writing
   the sentence that explains the silence is not.
7. **That the visual story tells the truth about the flow.** The validator (§8d) proves
   the graph is connected and every figure is a verified metric; it cannot tell whether
   the arrows run the way the system does, or whether a "before" ever happened. That is
   read off the evidence, by a person, before `enabled` is set.
8. **That the story reads as a story.** `reviewCaseStudyStory` (§8e) warns about the
   shape (no person, no decisions, an unpinned card, no closing, bookkeeping, a dash,
   the biography repeated) and scores six dimensions; it cannot tell whether the stakes
   are real to the reader or the complication honest. Those are read by a person, with
   `references/story-rubric.md` open, before Ali reads it.
9. **That the compact ending stays compact.** Nothing measures the height of the page.
   The rail, the board and the folds are code; the discipline to keep the narrative to
   one paragraph is not.
10. **That the skill and the gate agree.** §8e once said a role-only card's `displayName`
    "may be anything"; rule 5 said otherwise and blocked three records in one dry run. The
    gate was right. `skillStoryRules.test.ts` proves the checks §8e names exist; it cannot
    prove the prose describes them correctly. When a dry run contradicts this file, the
    dry run wins, and this file changes the same day.
11. **That a format reaches every surface.** The rail, the board and the folds are now
    tested on the two renderers this repository holds (`shellLowerHalf.test.ts`,
    `storyLowerV2.test.tsx`) and the third lives in the training repository. No test can
    see across the two repositories, so a NEW band still has to be added three times by a
    person who remembers to. The §8e marker table and the §8b checklist line are that
    memory; the live render on all three sites before calling it done is the check.
12. **That every record gets a picked thumbnail.** §8f is a step in this skill, and
    `apply-cover.js` refuses the ways a cover goes wrong (a dead URL, a caption the
    projection would drop, a cover that does not resolve, a gate that is not clean).
    Nothing refuses a record published WITHOUT one: the gate still accepts a screenshot
    cover, on purpose, so a record is never blocked on a picture. The checklist in §8 is
    what remembers it. `caseStudyCoverThumbnail.test.ts` pins the parts that can drift:
    the caption against the claim list, the explicit cover winning over a screenshot, and
    the tools this section names.

**When you add a rule here, decide which half it belongs in before you write it.** A rule
in the second half is a rule with a half-life.

---

## 11. Verify, then report with denominators

- **The visual story is on the snapshot and validates** (§8d): `readVisualStoryState`
  reports `validation.ok: true`, `stale: false`; the gate lists neither
  `visual_story_missing` nor `visual_story_invalid`. Without this the record cannot publish.
- Override survival: re-sync and confirm each section held. Should report `unchanged`.
- `backend/node_modules/.bin/tsc --noEmit` — never bare `npx tsc` (resolves 4.9.5).
- `npx jest src/services/caseStudy src/types src/routes/admin src/scripts`.
- **Every shaped metric agrees with itself.** The gate blocks four disagreements, and
  each is worth checking before you get there: a payload that does not match its declared
  shape, a ratio or share with no denominator, a member list longer than the total it is
  counted against, and a figure computed at a commit the record is not pinned to.
- **Every shaped metric has its three plain-language answers.** The readiness report
  warns (`metric_plain_missing`) and costs no points, so nothing forces this. Write them
  anyway; the picture makes a reader more confident, which is exactly when the third
  block matters.
- **Every collected metric has exactly one evidence row**, written by the sync. Two rows
  for one figure can disagree.
- **If the record is linked to a project**, run the gate and read the two maturity
  blockers as answers rather than obstacles: below `operational_result` means no outcome
  has been measured, and an open question means the project's truth contradicts itself.
  Neither is cleared by editing the case study.
- Regression: other records unchanged, public index count, `/case-studies` and
  `/demo-day` redirects.

**Report denominators, never impressions.** Not "the detail page renders" but:
sections authored X of X · candidates investigated X of X · metrics verified X of X ·
**metrics that compare X of X (§5a)** · metrics computed by a collector X of X ·
shaped metrics with plain language X of X · artifacts X · images X · timeline entries X ·
prefixes X · walkthrough video X seconds, cues loading on X of 3 surfaces ·
**visual story: cards X, charts X, steps X, enabled on X surfaces, gate rule 20 clean (§8d)**.

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
| **walkthrough video** | added later | added later |
| metrics with methodology + limitations | 4 of 4 | 6 of 6 |
| **visual story (§8d)** | workflow only, no verified outcome | workflow only, no verified outcome (pilot with figures: CORA, 2026-09-16) |

The tickets record scores higher on rigour and lower on pictures. Both patterns are
worth copying in one direction only.
