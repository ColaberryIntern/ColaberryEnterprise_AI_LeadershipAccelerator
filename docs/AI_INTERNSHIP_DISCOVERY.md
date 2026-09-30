# AI Internship — discovery report and implementation plan

Session `CC-20260909-q7m2`. Read-only discovery against `origin/main` @ `493b1049`.
**No code changed to produce this document.** This is the gate the implementation
contract requires before any edit.

---

## 0. The headline

The implementation prompt was written **without** `docs/AI_INTERNSHIP_SPEC.md` and
`docs/INTERNSHIP_ENROLLMENT_AUDIT.md`, two documents already on `main` that record
**Ali's own verified decisions on this exact feature (2026-08-17/18)** and a completed
blast-radius audit.

Most of the prompt is compatible with them. Three things are not, and one of those
would give away paid product. They are itemised in §3 with a recommendation each.

The good news is larger than the bad: **the prompt's cohort-membership architecture is
a better answer to the hardest problem in the audit than the mechanism Ali originally
named.** Details in §3.2.

---

## 1. Working-tree finding (discovery item 1)

| Fact | Value |
|---|---|
| OneDrive tree branch | `workstream/chapter-quality-and-worker` @ `ba35af4a` |
| Divergence from `origin/main` | **1,457 behind / 2,164 ahead** |
| Uncommitted files in it | **882**, from concurrent sessions |

Per `reference_onedrive_tree_stale_vs_main`, editing that tree silently reverts whole
subsystems. **All work for this feature is therefore in an external worktree:**

```
C:/Users/ali_m/Downloads/acc-internship-wt   branch feat/ai-internship-process   off origin/main @ 493b1049
```

Progress-log convention on `main` is confirmed by the sealed-archive test:
`scripts/generateSessionChangelog.js:224` prints *"PROGRESS.md is a sealed pre-2026-08-23
archive; nothing reads it here."* → the log for this work is
**`docs/sessions/CC-20260909-q7m2.md`**, not `PROGRESS.md`.

---

## 2. Reuse map — what already exists (items 2-17)

Far more of this is already built than the prompt assumes.

### Reuse directly, build nothing

| Need | Existing asset | Note |
|---|---|---|
| Internship cohort | `Cohort.cohort_type` (string) + `settings_json` (JSONB) | **No schema change.** `cohort_type='ai_internship'` and all settings fit `settings_json`. |
| Internship curriculum card | `internship_activity` type, `timeline/typeRegistry.ts:141` | Fully registered: `bucket:'advance'`, `evidence_required`, `github_required`, `instructor_review`, `portfolio_eligible`. Already wired into `progressionService.ts:31`, CAPE plan/scorer, `portfolioService`, `composer/evidenceEngine`, Today category filter. |
| Email idempotency | `email_send_ledger` (`db/ensureEmailSendLedgerSchema.ts`) | Already implements CLAUDE.md's exact `(recipient, subject, business_event_id)` key, enforced by **two unique indexes** at the storage engine. Nothing to design. |
| Email kill-switch / dev sink | `services/launchSafety.ts` → `isKillSwitchActive()` | Already honoured by `synthflowService`. |
| Upload security | `config/upload.ts` | Per-surface multer instances, MIME allowlist + extension fallback, `crypto.randomUUID()` opaque filenames, persistent `/app/uploads` volume. **The file explicitly warns against widening a shared allowlist** — so signed offer letters get their own instance. |
| Consent evidence | `ConsentRecord` model | |
| Metric reliability | `MetricReliabilityRecord` model | Directly serves the prompt's "mark unknown, exclude from recommendation" rule. |
| Certification | `CertSession`, `CertReadinessSnapshot`, `CertDomain`, `CertTrack`, `ensureCertPrepSchema` | Read, do not change timing. |
| PII redaction | `utils/piiRedaction.ts` → `redactForLogs` | |
| Error classification | `utils/errorClassifier.ts` → `classifyError` | |
| Schema management | **idempotent `ensure*Schema.ts` raw-DDL modules** (~40 of them) | **No migrations directory. Global `sequelize.sync({alter:true})` is DISABLED** (`config/schemaReconcile.ts:10`). Additive-only DDL with post-condition assertions. |

### The AI interview precedent to copy

`ScholarshipInterview` + `ensureScholarshipInterviewSchema.ts` is the closest analogue
and it was designed with the same governance instinct the prompt asks for. Its header:

> *"It is not an application and not a decision… why this record carries no score, no
> rank and no eligibility field."*

That is exactly the prompt's "AI produces a recommendation, not the final admission
decision." **Copy this shape.** `InterviewSession`/`InterviewRubric` are a *different*
thing (weekly scored student interviews) — do not conflate.

### Synthflow (item 11) — the important nuance

- `services/synthflowService.ts` (255 ln) — `resolveAgentId()` + `triggerVoiceCall()`
- `services/voiceCallPrompt.ts` (119 ln), `controllers/synthflowWebhookController.ts` (502 ln)
- `services/callbackRequestService.ts`, `callTranscriptProcessor.ts`, `CallContactLog`

`resolveAgentId` carries a deliberate, well-documented rule: **the Colaberry agents
carry their own saved scripts and must never be borrowed**, because a scholarship
applicant reaching the bootcamp callback agent is *"a person asking a charity for help,
spoken to as a sales lead."* The **AI Flotation agent is a prompt-only shell — its saved
prompt is literally `{prompt}`** — which is why CPN is allowed to borrow it.

→ The prompt's instruction ("reuse a prompt-only shell only when discovery confirms it is
safe; never dial through an agent carrying a conflicting saved script") is **satisfiable**,
but the correct move is a **dedicated `SYNTHFLOW_INTERNSHIP_AGENT_ID` env slot** that
degrades to *no call* when unset, matching the OpportunityLift precedent — not a silent
fallback. Also note `triggerVoiceCall`'s `callType` union is `'welcome'|'interest'|'callback'`
and will need an additive member.

### Admin RBAC (item 14)

`services/access/mgmtRoles.ts` is the single source of truth. `SECTION_KEYS` is a closed
12-member union; roles map to sections; **backend enforces per-router, frontend only hides
nav.** Keep in step with frontend `adminNav.ts`.

→ Add **one** section key, `internship`, granted to `owner`, `admin`, and `admissions`
(currently `['dashboard','lead_ingestion']`). This is the narrowest correct grant and it
is how Dhee gets her surface (§3.4).

### Does a multi-cohort membership mechanism already exist? (item 6) — **No.**

`OrgCohort`/`OrgMember` are organisation/sponsor-scoped seat models, not a per-student
secondary cohort membership. `TenantMembership`, `RoomMembership`, `CommunityMember` are
unrelated scopes. **`cohort_memberships` is genuinely new.**

---

## 3. Conflicts between the prompt and Ali's verified decisions

### 3.1 The payment gate is missing — **the one that costs money** 🔴

`AI_INTERNSHIP_SPEC.md` is unambiguous and marked *verified*:

> **The intern PAYS.** Participation requires an active subscription ($149/mo)…
> **Payment on acceptance, before access.** Dhee accepts, applicant gets a checkout
> link, training access unlocks when payment clears. Needs a **nudge and an expiry**…
> **Dhee can grant free access with an end date she sets.**

The prompt's lifecycle has **no payment state at all** — `documents_verified →
activation_pending → active` — and calls the document an *"Unpaid Internship Offer Letter."*

"Unpaid" there means *no stipend from Colaberry*, which is compatible. The absence of a
payment gate is not. Built literally, document verification grants
`hasFullCurriculumAccess()` — **full paid training, free, forever.**

**Recommendation (proceeding on this):** keep the prompt's lifecycle exactly as written and
insert one state, `payment_pending`, between `documents_verified` and `activation_pending`,
gated by cohort setting `requires_subscription` (**default `true`**, per the verified spec),
with an explicit comp path carrying `comp_expires_on`. If Ali wants a genuinely free
internship, flipping one cohort setting delivers it — with the money-losing option as the
deliberate choice rather than the accident.

### 3.2 Two enrollments vs `cohort_memberships` — the prompt is **right**, and this is the big win 🟢

Ali's decision 3 (2026-08-18) was *"a person may legitimately hold two active enrollments."*
`INTERNSHIP_ENROLLMENT_AUDIT.md` then costed that mechanism, and the bill is brutal:

- **`duplicateAccountSweepService.ts:237` DESTROYS a legitimate enrollment.** Every intern
  trips `findCrossCohortDuplicates` by definition; the merge path withdraws the losing row
  and *moves points events and unapplied account credits*. The audit's own worst finding.
- **Comp gives the student a paywall.** `grantFreeAccess` writes one `enrollment_id`;
  `contentEntitlement.ts:118/151` read `activeCompEnrollmentIds([enrollmentId])` — single
  element. Dhee comps the internship row, the session resolves to the class row, student
  gets **402 to a person explicitly given free access**.
- **The unpaid intern is never nudged** (`schedulerService.ts:529`).
- **Dhee cannot create the enrollment** (`enrollmentService.ts:201`).
- Plus **8 "quiet assumers"** and the structural blocker: `ParticipantPayload` carries a
  single `sub` + `cohort_id`, read by **~20 route files**, with no frontend switcher. The
  audit's verdict on the magic-link path: *"The student sees a complete, coherent, wrong
  portal. No 403, no 404, nothing logged."*
- And **~10 test suites** whose premise inverts.

I verified the load-bearing claims: `pickBestEnrollment` is at `participantService.ts:67`
with **29 references**; its rank tiers 2 and 3 (`non-explorer > explorer`, `paid > pending`)
are exactly the axes an internship row differs on.

**The prompt's design — one enrollment, plus a `cohort_memberships` row — delivers Ali's
stated outcome (*"moving from a class KEEPS the class enrollment and adds the internship on
top"*) while making every one of those failures impossible.** One enrollment per person
stays true, so `pickBestEnrollment`, the duplicate sweep, comp/entitlement, the payment
nudge and `participantAuth` are all untouched.

**Recommendation: follow the prompt.** It supersedes decision 3's *mechanism* while
preserving its *intent*. This is the single highest-value decision in the document and it
retires the audit's top-ranked risk rather than paying it.

### 3.3 The eligibility gate got demoted to a question 🟡

Spec: *"**Eligibility gate:** the applicant must **not currently be employed full-time**"*,
and the attestation + commitment acknowledgement are *"the two things the current email
intake actually collects. A form that drops them collects less than the email it replaces."*

The prompt puts employment status in Group B as an ungated interview question.

**Recommendation:** collect it as the prompt specifies (one canonical question, both
channels), **and** carry `attests_not_employed_fulltime` + `commitment_acknowledged_at` on
the application, surfaced to the reviewer as a **hard blocking flag** — never an automatic
rejection, per the prompt's human-gate rule.

### 3.4 Dhee is the named owner 🟡

Prompt says "an authorized human." Spec says the flow is **managed by Dhee** and *"she
needs a real admin surface, not a forwarded inbox"*, and that **the portal REPLACES the
email intake entirely**.

**Recommendation:** the new `internship` section grants to `owner`/`admin`/`admissions`;
Dhee gets `admissions`. Also honour spec decision 1 — **an applicant IS a lead** — and
spec decision 3 — **no capacity cap** ("space is limited" is urgency copy), so the prompt's
"Application capacity" setting ships nullable and unenforced.

---

## 4. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Activation grants paid training free | **High** | §3.1 `payment_pending` + `requires_subscription` default true |
| R2 | Building on the stale OneDrive tree | **High** | External worktree (§1) |
| R3 | `cohort_memberships` duplicated by webhook/approval retry | **High** | Unique `(enrollment_id, cohort_id, membership_type)` partial index on active; DB-enforced, not app-checked |
| R4 | Synthflow dials with a conflicting saved script | **High** | Dedicated env agent slot; unset ⇒ **skip the call**, never fall back |
| R5 | An API key or password reaches us | **High** | No field accepts one; a contract test asserts every internship route rejects `api_key`/`password` keys |
| R6 | Frontend skips approval / document verification | Medium | Transitions validated server-side in a pure module; invalid transition throws |
| R7 | Interview answers diverge between channels | Medium | One versioned question bank; both channels write the same `question_key`; test asserts key-set equality |
| R8 | Existing-intern conversion writes during dry-run | Medium | Dry-run returns a plan object and takes no transaction; test asserts zero writes and zero sends |
| R9 | Unreliable attendance treated as zero | Medium | `MetricReliabilityRecord`; unknown is excluded from the recommendation, not defaulted |
| R10 | Local `tsc` noise from junctioned deps | Low | Known artifact; judge by errors in changed files, CI is the real gate |

---

## 5. Phased plan (mapping the contract's 7 phases)

**Phase 1 — domain and state foundation** *(this session)*
`CohortMembership`, `InternshipApplication`, `InternshipStatusEvent`,
`InternshipAdministrativeIntake`, `InternshipInterviewQuestionSet`,
`InternshipInterviewSession`, `InternshipInterviewResponse`, `InternshipDecision`,
`InternshipRequirementAcknowledgement`, `InternshipDocumentTemplate`,
`InternshipDocument` + `ensureInternshipSchema.ts` + pure state machine + `internship`
section key + feature flag + unit tests.

*Deliberate deviation:* `InternshipWeeklyCommitment` and `InternshipReview` are deferred to
Phase 6 where they are first used. Shipping unused tables in Phase 1 is waste, and CLAUDE.md's
scope-lock favours building what the phase needs.

**Phases 2-7** as the contract specifies: Today card + intake → two-channel interview →
decision + comms → offer letter → activation + curriculum → tracking + conversion.

Stopping after Phase 1 for approval, per the contract.

---

## 6. Questions that materially block implementation

Only one, and it is not blocking Phase 1 — I am proceeding on the recommendation and it is
reversible by a cohort setting:

1. **Does the AI Internship require the $149/mo subscription?** The verified spec says yes;
   the prompt is silent. I am building `requires_subscription` defaulting to **true**. If
   the internship is meant to be free, say so and it is a one-setting change.

Everything else in the prompt was answerable from the repository and has been answered above.
