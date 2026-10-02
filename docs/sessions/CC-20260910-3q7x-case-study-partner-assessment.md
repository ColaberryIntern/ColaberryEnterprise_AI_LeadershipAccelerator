# Session CC-20260910-3q7x (build-case-study: the three sections a partner assessment asks for, the two-axis verification model, and a submission PDF)

Per-PR session log (kept separate from PROGRESS.md to avoid union-merge conflicts).

From the OpenAI Partner Assessment Program, Technical Capability Assessment. Nishant
Mishra circulated `OpenAI_Partner_Assessment_Requirements.xlsx` on 2026-09-30; Ram asked
Srinivas to collect the school, AIX and consulting use cases. Ali: "use that blueprint of
what they are asking from us to upgrade my Case Study skill so that it includes all that.
identify the deltas in their ask and what we are missing in our case study skill process",
then asked to see a before and after on a real record before approving. Approved
2026-10-02.

Branch: `workstream/case-study-partner-assessment` (cut from `origin/main`).

---

## Measurement, before any edit

- [x] Measured the published library against the workbook's four tabs
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: nothing in the repo. Read all four tabs of
    `OpenAI_Partner_Assessment_Requirements.xlsx` (Requirements Checklist, Production
    Deployments, AI Use Cases, Supporting Evidence) and mapped every required field onto
    the snapshot sections a case study actually carries.
  - Verification: the workbook's own cells. Production Deployments requires Customer name,
    # of users, Usage frequency and Documents being processed; AI Use Cases requires Target
    outcome, Solution delivered, Impact/measurable result and Timeline from first customer
    engagement to production; Supporting Evidence accepts PDF/DOC/DOCX/PPT/PPTX only, five
    files, 20 MB each.
  - Notes: of twelve assessed fields the record could answer three. Five of the remaining
    nine were already present on the record as prose, a capability tag, or the methodology
    text of a metric, and only needed a named home. Four require a person and always will.

- [x] Before/after built on a real approved record, not a hypothetical
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: nothing in the repo.
    `docs/sessions/` not touched by this step; the comparison was published for Ali as an
    artifact and written to `~/Downloads/case-study-skill-before-after.html`.
  - Verification: every figure read live from production snapshot
    `the-pipeline-needed-more-than-one-person` (status `approved`, repo
    `ColaberryIntern/LandJetGrowthEngine`, 43 evidence rows, 7 metrics, `heroMetrics: []`,
    8 build-timeline entries, earliest 2026-03-29).
  - Notes: two findings drove the edit. **`taxonomy.stack` names seven technologies and
    not one is an AI model**, on a record whose own summary says a draft is "prepared by a
    model" and issues are "triaged by a model into one of five bounded actions". And five
    of the seven metrics measure the build (tests, commits, checks) while the two that
    measure use are both negative: 0 emails sent in each weekday report 8-18 Sep, and
    meetings/proposals/won zero recorded. The second is a fact about which deployments may
    be put forward, not a defect in the skill.
  - Correction made during the work: an earlier count said only one case study carried any
    metrics. That read `case_study_metrics` (0 rows for this record); the metrics live in
    the snapshot's `measurement` section (7). The gap was narrower than first reported.

---

## The edit

- [x] `.claude/skills/build-case-study/SKILL.md` §3a: `deployment`, `engagement`, `governance`
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: three new whole-object sections with a fill-from table, plus the rules
    that bite: an omitted key and an empty one mean different things; `governance.models`
    is **not optional** on a record about an AI system; `deployment.customer` obeys
    `organization_identity_mode` because naming consent is consent to publish and not
    consent to disclose in a partner submission; dates are `YYYY-MM-DD` and `elapsed` is
    computed, never typed.
  - Verification: user confirmed ("approved", 2026-10-02) against the before/after page.
  - Notes: these add no claim and relax no gate. `applyHumanOverride` already creates
    arbitrary whole sections (§3), so all three are usable with no code change.

- [x] §4: how to evidence what a repository cannot prove — and a correction
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: an earlier draft of this section specified a new
    `verification_class: 'attested'`. **That was wrong and has been removed.** The
    codebase already models this, and models it better: `class` (how much may be shown:
    `verified` / `anonymized` / `illustrative` / `pending`) and `method` (who established
    it: `client` / `repo` / `platform` / `internal` / `self` / `manual`) are **orthogonal
    axes**, declared together in `backend/src/types/caseStudy.ts`. A client-confirmed
    outcome is `class: 'verified', method: 'client'`, or `anonymized` + `client` where the
    client will not be named. §4 now documents that, with `reviewed_by` / `reviewed_at`
    pinned and `source_commit_sha` null.
  - Verification: `backend/src/types/__tests__/caseStudyContracts.test.ts` reads
    `frontend/src/components/publicV2/Claim.tsx` **as text**, asserts the class union
    matches member-for-member in the same order, and asserts `toHaveLength(4)`. A fifth
    class fails that test by design and would need a coordinated frontend change. The
    type's own header warns against exactly the conflation the draft committed.
  - Notes: caught by reading the type before writing the code, not after. The skill now
    states plainly that there is no `attested` class and that adding one is a mistake, so
    the next reader does not repeat it.

- [x] §6: why the banned-phrase list is absolute today, and what makes it conditional
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: the list is unchanged. Added the reasoning — a commit cannot prove a
    saving, so an unconditional ban is correct for the evidence we have — and the intended
    end state: blocked without a `method: 'client'` evidence row on the same claim,
    permitted with one.
  - Verification: no behaviour change; the scanner is untouched.
  - Notes: written this way on purpose so the next reader does not simply relax the
    scanner. A blocked phrase means the claim is not yet evidenced, which is information.

- [x] §8g: the submission PDF
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: every record gets a PDF rendering of the published projection, attached
    as a `case_study_artifacts` row of type `submission_pdf`, named `<slug>-<YYYY-MM-DD>.pdf`.
    The walkthrough video becomes a titled still plus its public URL rather than being
    pretended into the document.
  - Verification: the workbook's Supporting Evidence tab accepts PDF, DOC, DOCX, PPT, PPTX
    only. Measured across the fourteen approved records, nothing we hold is in an accepted
    format and the walkthrough video cannot be submitted at all.
  - Notes: renders the published projection, never the draft, so the PDF cannot say
    something the live page does not.

---

## Not in this PR, and why

- **Teaching the ladder to read `method`.** `computeMaturity`
  (`backend/src/services/sbp/caseStudyFoundation.ts:123`) counts verified stories, merged
  enrichments and demonstration references and **never reads a verification method at
  all**. That, not the vocabulary, is why `operational_result` is unreachable. Specified
  in §4, not implemented.
- **A proof hole worth closing with it.** `ruleProofMetadata`
  (`caseStudyPublishRules.ts:452`) requires an `evidenceId` only when
  `class === 'verified'`, so a `client`-method figure recorded as `anonymized` carries no
  proof requirement at all.
- **Making the §6 ban conditional.** Depends on the above; relaxing the scanner first would
  let unevidenced outcome language through.
- **Backfilling the three new sections onto the fourteen approved records.** Each needs a
  person for the fields a repository cannot supply.

---

## The one code change: close the anonymized proof hole

- [x] `ruleProofMetadata` demands an evidence pointer from `anonymized`, not only `verified`
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: `caseStudyPublishRules.ts` gains `NEEDS_EVIDENCE`
    (`verified` + `anonymized`). Until now the rule read
    `v?.class === 'verified'`, so an `anonymized` metric — which
    `types/caseStudy.ts` defines as "the client confirmed it but will not be named" —
    could publish with no evidence pointer at all. Withholding a name is a presentation
    choice, not grounds to skip proof. `illustrative` and `pending` are deliberately
    excluded: each says on its face what it is, and demanding proof from them would be
    demanding they stop saying the true thing they exist to say.
  - Verification: `npx jest caseStudyPublicationService.test.ts caseStudyContracts.test.ts`
    → **147 passed, 2 suites**, `JEST_EXIT=0`. `npx tsc --noEmit` → `TSC_EXIT=0`, zero
    output lines. Both re-run AFTER the last edit.
  - Mutation evidence: narrowing `NEEDS_EVIDENCE` back to `['verified']` failed exactly
    one test, **by name** — "refuses an anonymized metric with no evidence pointer — a
    withheld name is not a missing fact" — with 94 others still passing. Restored by edit,
    never by `git checkout`; the `MUTATION` marker count is 0.
  - Blast radius, measured on production before writing it: every metric on every approved
    snapshot is class `verified`, `anonymized_without_evidenceId = 0`, and the only
    verification methods in use across the whole library are `internal` and `repo`. This
    tightens the gate and refuses nothing already published.
  - Notes: three tests, not one — it fires; it does not fire when evidence is present; and
    `illustrative` / `pending` are left alone.

---

## Escalation: `operational_result` needs a model nobody built

`computeMaturity`'s own contract says `operational_result` "needs an outcome measured
through an **approved measurement definition**" and `impact_case_study` "needs a
client-confirmed business impact on top of that".

Searched the backend for `measurementDefinition`, `measurement_definition` and
`MeasurementDefinition`: **zero hits.** The concept is named in the contract and the
comments and has never been built. That is the real reason `outcomeEvidence` is "empty by
construction" — a stated precondition with nothing behind it.

So teaching `computeMaturity` to read a verification method would be premature: there is
nothing approved for it to read, and the only thing it could do is promote records on
evidence nobody signed off, which is the exact failure the ladder exists to prevent.

Two measurements that bear on the decision, both from production on 2026-10-02:

- Every metric on every approved snapshot is class `verified`.
- **`method: 'client'` has never been used once.** Methods in use: `internal`, `repo`.

The vocabulary for a client-confirmed outcome has been present and unused the whole time.
Building the measurement-definition model is a new schema plus an approval workflow, which
is an architecture decision and sits with the DRI. Until it is made, the ladder stays
capped at `capability_demonstration` and the §6 phrase ban stays absolute.
