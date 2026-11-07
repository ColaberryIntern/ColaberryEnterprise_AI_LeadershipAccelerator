# Session CC-20261106-p3n8 — the Settings → Enrollment tab under the batch model

- [x] Settings → Enrollment: stop a batch advertising its orientation as a class start date
  - Date: 2026-11-07
  - Session: CC-20261106-p3n8
  - What changed: Taiwo reported the cohort date on the Settings enrollment page, which
    is a DIFFERENT surface from the public cohort card fixed earlier. The symptom she
    screenshotted ("December 7, 2026") was the November row's bad `start_date` and was
    already gone once that row was reverted to `2026-11-12` — verified live before
    touching anything. The structural fault was still there: this dropdown renders
    `formatClassDate(start_date)` directly, and a batch's `start_date` is its ORIENTATION
    in the month AFTER the batch, so the December batch (`start_date = 2027-01-04`) would
    have offered "January 4, 2027" as a class start date the moment it opened.
    `portalEnrollmentService` now carries `batch_month` on every option and on the
    enrolled cohort, and the component branches on it: a batch reads "December 2026" with
    the orientation named separately below the select, a legacy cohort reads exactly as
    it always has. The field label and optgroup switch from "Class start date" to "Your
    batch" only when the list actually contains a batch.
  - Verification: backend `tsc --noEmit` 0 errors in `src/` (see the compiler note below —
    the first three runs were worthless); frontend `tsc --noEmit` 0 errors in `src/`;
    6 new backend tests + 4 existing suites green (33 tests); 13 frontend tests;
    2 pre-existing suites that touch this copy still green (12 tests).
  - Notes: the `batch_month` read was extracted to `cohortBatchMonth.ts`, a module with no
    imports, because this is its SECOND consumer — `cohortService.toPublicCohort` was the
    first — and a drift between the two reintroduces exactly the bug that was reported.
    `settings_json` is still never returned by either; only the one field is lifted.

- [x] Settings: remove a billing promise the billing engine stopped keeping
  - Date: 2026-11-07
  - Session: CC-20261106-p3n8
  - What changed: both Settings tabs told students "your subscription month starts on your
    class start date, not the day you pay", and the Subscription tab titled it "Pay early,
    lose nothing". That was true until 2026-10-30. `billing/billingPeriod.billingAnchorMs`
    now returns the payment date and ignores the cohort start entirely — a deliberate
    change for rolling intake, whose own comment records the cost: "a member who signs up
    before a class begins now spends part of their first month waiting for it." The copy
    was never updated with it, so both tabs were making a money promise the code does not
    keep, shown to exactly the students being asked to pay. Both now say what
    `billingPeriod` actually does: the membership runs from the day you pay and renews on
    that date each month.
  - Verification: `billingAnchorMs` read directly — the body is `return paymentMs;` and
    the cohort-start parameter is named `_cohortStartDate` and unused. Both Settings
    suites green.
  - Notes: THIS IS A COPY CHANGE WITH A COMMERCIAL EDGE AND IT IS ALI'S CALL. Removing the
    claim removes an incentive to pay early. The claim could not be left standing because
    it is false, but restoring the OLD BEHAVIOUR (anchoring the first period on the class
    start) is a live option and a better one if early payment matters — that would be a
    change to `billingPeriod`, not to this copy. Flagged, not decided.

- [ ] NOT DONE — about twenty more surfaces have the same fault, and none of them is
      broken today
  - Date: 2026-11-07
  - Session: CC-20261106-p3n8
  - What changed: nothing. Logged as a scope expansion rather than absorbed.
  - Notes: a sweep for every surface that renders a cohort `start_date` to a student or a
    lead found roughly twenty beyond the two fixed. They are all CORRECT RIGHT NOW,
    because the only open accelerator cohort is the legacy November row and all four batch
    rows (December through March) are still `closed`. **They all break together the moment
    someone flips the December batch to `open`** — that single admin action is the trigger.
    The ones that matter most, in order: the `{{cohort_start}}` merge tag in
    `schedulerService` (every seeded outbound email sequence), the Synthflow voice context
    and `automationService`'s literal instruction to an AI caller to say the start date,
    the AI lead-message prompt in `contextGraphService`/`aiMessageService` including its
    "N days away" urgency number, `explorerFactResolver` (which AUTHORISES the date as a
    quotable fact, so the fact-guard would pass the wrong one), the enrollment
    confirmation emails in `emailService`, the `EnrollSuccessPage` and the .ics file it
    hands out, and `CohortUrgency` on two public pages. Beyond those, `openHouseService`'s
    `first_class` feeds every portal countdown and the week-numbering used by the Path and
    Schedule pages, so a batch student would see wrong week numbers rather than a wrong
    date. Verified independently: the `{{cohort_start}}` substitution at
    `schedulerService.ts:1258`, the two public mounts of `CohortUrgency`, and the
    duplicate billing copy. The rest is a list to work, not a list to trust.

## A compiler note, because three green-looking runs in a row were worthless

The backend and frontend both pin `typescript ^5.7.3`. Every `acc-*-wt` worktree's root
`node_modules` is a junction to the same OneDrive checkout, which carries **TypeScript
4.9.5**. Three separate false passes came out of that in one sitting:

1. `npx tsc` from `backend/` resolved to the **decoy `tsc` npm package** — it prints "This
   is not the tsc command you are looking for" and **exits 0**. Read as a pass, it is a
   compiler that never ran.
2. Running the root's real `tsc` instead gave 4.9.5, which cannot parse `zod` v4's `.d.ts`
   files. 267 syntax errors in `node_modules`, `0` in `src/`, and `skipLibCheck` does not
   suppress *parse* errors. The `0` was meaningless: a planted type error in a file under
   test was **not reported**.
3. The frontend had the identical failure against `@types/d3-dispatch`.

What made each one detectable was the same cheap move: **plant a deliberate type error in
a file the change touches and confirm the run reports it before believing any count.** A
run that cannot see a broken file cannot vouch for a correct one. Installing
`typescript@5.7.3` into a scratch directory and invoking it by path against the project
produced a run that both failed the control and then passed clean.
