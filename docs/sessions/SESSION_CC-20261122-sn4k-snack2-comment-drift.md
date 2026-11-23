# Session CC-20261122-sn4k - SNACK-2 comment drift

**Date:** 2026-11-22
**Ticket:** SNACK-2 (Basecamp todo 10520570248)

## What changed

Comments only, in three files. No behavior, no types, no tests touched.

PR #4152 (17 Nov) corrected three comments that claimed a signup checkbox wrote
`leads.social_proof_opt_in` when nothing did. PR #4173 (18 Nov) then built that checkbox. The
same three comments are now wrong in the opposite direction: they tell a reader that no form
collects the consent, when /portal/signup has been collecting it in production since 18 Nov.

- `backend/src/services/marketing/snackbarFeedService.ts` - header block and the in-function
  comment in `composeSignupEvents`
- `backend/src/db/ensureLandingPageSnackbarSchema.ts` - column table line and header block
- `backend/src/models/Lead.ts` - the `social_proof_opt_in` field comment

Each now states the measured position and, more usefully, the arithmetic that explains it.

## Measured state, 2026-11-22 (production)

| Measurement | Value |
|---|---|
| `leads` rows total | 25,701 |
| Rows with `social_proof_opt_in = true` | **0** |
| Leads created since the deploy (18 Nov 06:05 UTC) | 123 |
| ...of those, opted in | **0** |
| ...from `open_house` | 118 |
| ...from `free_signup` (the form that has the box) | **3** |
| ...from `catalog_request` | 2 |

So the zero is three unticked optional boxes, not a broken write path.

## Verification

- **The checkbox is live.** Drove Edge against https://enterprise.colaberry.ai/portal/signup:
  `#cbfs-social-proof` present, visible, unchecked, carrying the exact
  `SOCIAL_PROOF_CONSENT_TEXT` string. Controls: the email-consent sentence was also present
  (so a miss could not be the page failing to render) and a deliberately bogus sentence was
  absent (so the match was not trivially true).
- **The counts above** came from `psql` in `accelerator-db` against `accelerator_prod`.
  The source breakdown doubles as the control: it is non-uniform, so the window and filter
  are demonstrably selecting real rows rather than returning everything or nothing.
- **Nothing in this change can be verified by tests**, because comments carry no behavior.
  That is stated rather than papered over with a green build.

## Still open on SNACK-2

The ticket asks for confirmation that a real opted-in lead renders by first name. That still
has not happened, because nobody has ticked the box. Raised for Ali rather than decided here:
the consent is only asked for on the form behind 3 of 123 recent signups, so the feature is
built but structurally close to unused until Open House registration asks too. Adding it there
is a scope decision, not a bug fix.
