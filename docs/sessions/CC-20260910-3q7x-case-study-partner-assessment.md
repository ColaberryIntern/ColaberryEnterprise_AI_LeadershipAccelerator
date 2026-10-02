# Session CC-20260910-3q7x (build-case-study: the three sections a partner assessment asks for, an attested evidence class, and a submission PDF)

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

- [x] §4: the `attested` evidence class, specified and explicitly NOT yet live
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: documents `verification_class: 'attested'` for facts a repository cannot
    prove (a user count, an engagement date, a client-confirmed outcome), pinned to a named
    person and date instead of a commit SHA, with `reviewed_by` and `reviewed_at` required.
    Marked **"specified here, NOT yet accepted by the gate"** so nobody uses it on a record
    they intend to publish before the code lands.
  - Verification: `case_study_evidence.verification_class` is `character varying`, not an
    enum (checked against production `information_schema`), and the values in use are
    `pending` and `verified`. **No migration is required**; the constraint is in
    application code at `caseStudyPublishRules.ts` and `caseStudyPublishMaturityRule.ts`,
    both named in the skill.
  - Notes: this is the change that would let `computeMaturity` reach `operational_result`
    honestly instead of it being unreachable by construction. The backend work is
    deliberately NOT in this PR.

- [x] §6: why the banned-phrase list is absolute today, and what makes it conditional
  - Date: 2026-10-02
  - Session: CC-20260910-3q7x
  - What changed: the list is unchanged. Added the reasoning — a commit cannot prove a
    saving, so an unconditional ban is correct for the evidence we have — and the intended
    end state: blocked without an attested row on the same claim, permitted with one.
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

- **The backend change for `attested`.** `caseStudyPublishRules.ts` and
  `caseStudyPublishMaturityRule.ts` must accept the class and the maturity ladder must
  honour it before the class is usable. Specified in §4, not implemented.
- **Making the §6 ban conditional.** Depends on the above; relaxing the scanner first would
  let unevidenced outcome language through.
- **Backfilling the three new sections onto the fourteen approved records.** Each needs a
  person for the fields a repository cannot supply.
