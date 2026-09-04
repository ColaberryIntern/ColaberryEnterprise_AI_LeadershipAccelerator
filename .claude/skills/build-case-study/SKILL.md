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

## 8. Pictures

Text-only pages read as unfinished, and readiness penalises it:
*"no approved screenshot, architecture image, photograph or demo"*, plus
*"fewer than two approved images"*.

**A mermaid diagram is not an image.** It satisfies the architecture section, not the
image checks.

Real images live at `https://enterprise.colaberry.ai/site-v2/…` and are referenced by
`publicUrl` on an artifact with `visibility: public`, `status: approved`. Add at least
one screenshot or photograph unless the record genuinely has none.

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
