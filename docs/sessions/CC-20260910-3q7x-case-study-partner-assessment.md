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

---

## Inbox COS: a health alert can no longer be archived

Separate workstream, same session. From Kes's delivery-health alert being archived by our own
classifier on 2026-10-01 (state AUTOMATION, confidence 15, reasoning "This is a test email with no
action needed"). Ali, 2026-10-02, after I showed him the audit row: the rule is mine to build.

- [x] `hardRuleEngine.ts` rule `operational_alert_00` — X-Cora-Alert keeps a health alert in INBOX
  - Date: 2026-10-04
  - Session: CC-20260910-3q7x
  - What changed: new exported predicate `hasOperationalAlertHeader(headers)` and a rule placed
    **above 0a**, ahead of every other rule, because this is the alert that says the alerting is
    broken. Matches on the **presence of the `X-Cora-Alert` header**, case-insensitively, so both
    `health` and `system` values match and a value added later still does.
  - Why the header and not the sender or subject: Kes's recommendation, right twice over. The From
    is his ordinary mailbox, so a sender rule would pull all his personal mail into the inbox; the
    subject is prose that breaks the first time anyone rewords it. Matching on SHAPE is what finally
    stopped the account-security defect (rule `0g`) recurring after four sender-by-sender patches —
    this is the fifth instance of the same class and the second fixed by shape.
  - Verification, re-run after the last edit: `npx jest hardRuleEngine.test.ts` → **75 passed, 1
    suite, exit 0**. `npx tsc --noEmit` → exit 0, zero output lines.
  - Mutation evidence: guarding the rule with `if (false && ...)` failed **exactly the six positive
    tests, by name** — delivery-health alert, system alert, header casing, List-Unsubscribe, the
    RESOLVED all-clear, and the drill — while the two negative tests stayed green, which is correct:
    they assert the rule does NOT fire on ordinary mail from the same sender or on a lead notice.
    Restored by edit, never by `git checkout`; MUTATION marker count is 0.
  - Notes: eight tests, not one. The two negatives matter as much as the six positives — they are
    what proves the rule is pinned to the header rather than to Kes.
  - Still to do: this needs a **prod deploy** to take effect, and only affects mail classified
    afterwards. Kes is holding a drill (a real-shaped alert carrying `X-Cora-Alert-Drill: true`)
    until the rule is live.

---

## Inbox COS: two more classes taken out of the LLM's hands

Ali, 2026-10-04: a Protective Life application email he was looking for had been archived, and the
weekly session reminders he had "deleted at least 3 times" kept reappearing.

**A correction I made to myself mid-investigation.** I first read the stored `confidence` as the
classifier's certainty and called 0 / 15 / 20 "filing mail it has no conviction about". Wrong.
`llmClassificationService.ts` scores **how likely the mail needs Ali's personal attention**, and
`confidenceToState` maps `>=75 INBOX / >=50 ASK_USER / >=25 SILENT_HOLD / <25 AUTOMATION`. A 0 is a
confident "he does not need this", not an absent judgement. The "confidence floor" fix I had in mind
was void, and the real answer was to take two classes of mail out of the scorer's hands.

- [x] `financial_application_0i` — an application waiting on Ali stays in the inbox
  - Date: 2026-10-04
  - Session: CC-20260910-3q7x
  - What changed: new `isFinancialApplicationMail(subject, body)` and rule `0i`. Requires **both**
    halves: a subject asking you to complete / sign / submit something (or "action required"), AND a
    body naming an open file (policy / application / claim / member / contract / account number, or
    "underwriting", or "application packet"). Either half alone is ordinary marketing language.
  - Evidence it was needed: Protective Life policy `LU6202903`, archived **twice** (10-02 15:30 at
    score 0, 10-03 10:01 at score 20), both times reasoned as "a marketing communication". It said
    underwriting could not begin until the application was registered, completed and signed.
  - Deliberately NOT a list of carrier domains: that is the sender-by-sender patching that let the
    account-security defect recur four times before rule `0g` matched on shape.

- [x] `event_reminder_34` — recurring countdown reminders are archived deterministically
  - Date: 2026-10-04
  - Session: CC-20260910-3q7x
  - What changed: new `isRecurringEventReminder(subject)` matching a trailing `(N <unit> out)`
    parenthetical, and rule `3.4` placed **after** the VIP (1), name (2) and family-keyword (3)
    checks so any of them can still rescue the mail.
  - Evidence: `discussions@school.colaberry.com` sends three notices per event and the event
    recurs weekly, so nothing was being resurrected — each week's are new messages. The LLM gave
    IDENTICAL mail a different verdict almost every week (Oct 1 week-out INBOX, Sep 24 week-out
    AUTOMATION; Oct 1 hour-out AUTOMATION, Sep 24 hour-out INBOX) because the score sits on the
    25-point boundary. Roughly one in three reached the inbox at random.

- [x] Fixed a mock that had been disabling every VIP assertion in the suite
  - Date: 2026-10-04
  - Session: CC-20260910-3q7x
  - What changed: `jest.mock('../../../models/InboxVip')` now provides a `sequelize` stub with
    `where` / `fn` / `col`. The VIP check builds its WHERE through those; without them it threw, its
    own `catch` swallowed the error, and execution fell through to the next rule.
  - How it surfaced: a new test asserting "a VIP sender overrides the event-reminder rule" **failed
    against correct code**. Every prior VIP assertion in this file had been testing the ABSENCE of
    the VIP path rather than its presence.
  - Verification: `npx jest hardRuleEngine.test.ts` → **87 passed, 1 suite, exit 0**.
    `npx tsc --noEmit` → exit 0, zero output lines. Both re-run after the last edit.
  - Mutation evidence: guarding both new rules with `if (false && ...)` failed **exactly seven
    tests** — the two financial positives and the five countdown positives — while every negative
    stayed green. Restored by edit; `diff` against a pre-mutation copy reported identical, and the
    MUT marker count is 0.
  - Note on what is NOT evidence: a `ts-node` spot-check of the two predicates printed nothing and
    is not cited. The proof is the jest case that feeds the rule the **exact** archived subject and
    body, `POLICY NUMBER: LU6202903` included.
