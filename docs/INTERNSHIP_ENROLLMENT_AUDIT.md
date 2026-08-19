# Internship enrollment audit — what breaks when one person has two enrollments

Companion to `AI_INTERNSHIP_SPEC.md`. Read-only audit, 2026-08-18, against `origin/main`.
**No code changed.** This is the build checklist.

## The premise being overturned

`participantService.pickBestEnrollment` (`:67-90`) is a **pure deduplicator**. Its
4-tier rank picks one "real" row from N: staff first, non-explorer over explorer, paid
over unpaid, then newest. Its own doc comment (`:53-66`) states the premise — a second
row is "a stray" that must not "silently hide their paid access."

There is no concept of *both rows are real*. Decision 3 of the spec introduces exactly
that. **Tiers 2 and 3 are the axes an internship row differs on**, so the rule will
choose confidently and wrongly.

A hand-ported second copy lives at `scripts/buildStudentFactBase.js:407-421`.

## The four that break Ali's decisions directly

### 1. The sweep DESTROYS a legitimate enrollment — worst finding

`duplicateAccountSweepService.ts:237` (`findCrossCohortDuplicates`) flags any email whose
active rows span more than one `cohort_id`. **An internship row is by definition in a
different cohort from the class row, so every single intern trips this detector.**
`mergeCrossCohortDuplicate` (`:264+`) then withdraws the losing row and rewrites its
attendance history. The shadow-account path (`:137` → `:176-219`) additionally **moves
points events (`:205`) and unapplied account credits (`:209`)** before setting
`status:'withdrawn'` (`:213`).

This destroys data rather than hiding it. It needs a human to run a non-dry sweep, which
is the only reason it is not ranked first.

**Must be fixed before the first intern is enrolled**, not before launch.

### 2. Comp gives the student a paywall — breaks decision 4

`subscriptionService.grantFreeAccess` resolves siblings for the *write* (`:497-513`) but
creates the comp subscription on the single `enrollment_id` the admin had open (`:501`).
The entitlement *read* only ever checks that one id: `contentEntitlement.ts:118`/`:151`
call `activeCompEnrollmentIds([enrollmentId])` with a single-element array.

So Dhee comps the internship row, the student's session resolves to the class row, and
`requireContentEntitlement` answers **402 `content_requires_paid` to a person who was
explicitly given free access**. Fails closed, which makes it loud — but wrong.

### 3. The unpaid intern is never nudged — breaks decision 2

`schedulerService.ts:529-531` cancels payment-readiness nudges on
`findOne({ email, payment_status: 'paid' })`. A student with a **paid class row**
suppresses the nudge for their **unpaid internship row**. Decision 2's
accepted-but-unpaid limbo is precisely the case this silently skips.

### 4. Dhee cannot create the enrollment — blocks the admin path

`enrollmentService.ts:201-205` hard-throws "An enrollment already exists for this email
in this cohort" on `(email, cohort_id)`. Blocks admin-creating an internship row for a
student already in that cohort.

## The riskiest single line

**`participantService.ts:116`** — the magic-link path. The chosen enrollment is stamped
into `portal_token` (`:146-149`) and becomes `sub` in the session JWT
(`signParticipantJwt:15-26`). From then on **every** portal surface — timeline, cohort,
live sessions, attendance, points, projects, entitlement — is scoped to that one row.

A student in the July class accepted to the internship requests a link. Neither row is
staff, neither is explorer, so tier 3 decides: the paid class row wins and the internship
is invisible. If both are paid, tier 4 picks the newer internship row and **the class
disappears instead**.

The student sees a complete, coherent, wrong portal. **No 403, no 404, nothing logged.**
They report it as "my class vanished."

`middlewares/participantAuth.ts:6-21` is the structural bottleneck: `ParticipantPayload`
carries a single `sub` and a single `cohort_id`, and ~20 route files read from it. The
frontend `ParticipantAuthContext` has no notion of switching.

## Quiet assumers — no call to the helper, same assumption

- `freeSignupService.ts:53` — `findOne` by email with **no status, no ordering**, then
  signs a JWT (`:70`). Worse than the helper: not even deterministic.
- `sectionResetService.ts:42` — resets lesson state on an arbitrary row.
- `refundService.ts:137` — refund ledger attaches to an arbitrary enrollment.
- `sequenceService.ts:406-410` — takes the **newest** row's cohort start to schedule a
  campaign; a newer internship row would redate a whole class campaign.
- `openHouseCreditService.ts:108-113` — `.find(...) || matches[0]`; the $50 credit lands
  on one row.
- `paymentReconciliationService.ts:134-177` — with class and internship both active and
  one unpaid, **every intern payment resolves to `ambiguous`** and drops into manual
  review.
- `enrollmentService.ts:150-166` (`retireRedundantExplorerAccounts`) — withdraws other
  active explorer rows on payment. Harmless if internship rows are typed `internship`;
  **destructive if an internship application is staged as an explorer or pending row.**
  This makes the `enrollment_type` choice load-bearing.

## Already correct — copy these, do not fix them

- `access/mgmtBridgeService.ts:50-57` — `findAll` by email, picks by the staff
  CommunityMember row; header explicitly names non-uniqueness.
- `personHistoryService.ts:88-95` — aggregates across **all** sibling rows.
- `routes/admin/securityRoutes.ts:164`, `:225` — GDPR export/anonymize over `findAll`.

## Tests that pin the old assumption

These encode "two rows = duplicate" as the rule and must change with it:

- `participantService.magicLink.test.ts:41-77` (the five rank cases) and **`:79-100`**,
  which asserts the second row's `update` was **never** called — that assertion is
  precisely what must invert.
- `duplicateAccountSweepService.test.ts` — the **whole suite's** premise. `:98` and
  `:197` ("ignores emails with only one active enrollment row") encode the inverse.
- `enrollmentService.test.ts:149-200`, `explorerCohortRouting.test.ts:64-95`,
  `paymentReconciliationService.test.ts:107-126`, `freeSignupService.test.ts:49-61`,
  `explorerIdentityBridge.test.ts:142-181`, `studentFactBaseTransport.test.js:324-341`.

Evidence docs `evidence/2026-08-14-million-abate-consolidation.md:103` and
`evidence/2026-08-14-ikenna-fresh-start.md:55` assert single-winner behaviour as verified
production truth and will read as stale.

## Revised build order

0. **Disarm the sweep against internship rows** — before any intern exists.
1. Decide `enrollment_type` for internship rows (**not** explorer, or
   `retireRedundantExplorerAccounts` deletes them).
2. Decide how a session addresses two enrollments — the `participantAuth` payload and a
   way to switch. This is the architectural decision the rest depends on.
3. Make comp sibling-aware on the read side, not just the write side.
4. Then the dropdown, Dhee's queue, checkout, comp expiry.
