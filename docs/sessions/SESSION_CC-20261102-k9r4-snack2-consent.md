# CC-20261102-k9r4 - SNACK-2: collect the consent the snack bar was always waiting for

**Date:** 2026-11-17 (Central)
**Workstream:** Marketing ops (BC list 10467338643)
**Ticket:** SNACK-2 (10520570248), due 2026-12-01

## What was wrong

`leads.social_proof_opt_in` is `NOT NULL DEFAULT false` and **nothing ever wrote it**. Four files
referenced the column - the boot DDL, the `Lead` model, `snackbarFeedService` which reads it, and
the schema test - and there were zero references to any camelCase `socialProofOptIn` anywhere in
the repo. So it was `false` on every row, and three things followed:

- the bar could only ever say "Someone in <city>"; the by-name branch of `composeSignupEvents`
  was unreachable
- a page configured `name_format: 'opted_in_only'` dropped **every** row and showed no bar at all
- that looks exactly like a feed bug while every health check passes

SNACK-1 corrected the three comments that claimed a signup checkbox already wrote it. This is the
checkbox.

## The shape of the change, and the one decision inside it

**This is a DISPLAY permission, not a contact one**, and that decides the whole design.
`ConsentChannel` is `voice | sms | email` and every one of those authorises a *send*. There is no
channel for "may be shown by name on a page", so this does **not** get a `consent_records` row:
inventing a fourth channel would put a row that looks like permission-to-contact into the table
whose entire job is answering that question before a send. It stays on the Lead column.

That has a consequence worth stating: the grant is a bare boolean, and a boolean carries no
wording. **The sentence on screen is the entire evidence of what was agreed to**, which is why
`SOCIAL_PROOF_CONSENT_TEXT` is pinned across both stacks by `consentTextParity.test.ts` exactly
like the other two.

| File | Change |
|---|---|
| `consent/captureSignupConsent.ts` | `SOCIAL_PROOF_CONSENT_TEXT`, beside the other two |
| `frontend/src/config/consentText.ts` | the pinned frontend copy |
| `schemas/enrollmentSchema.ts` | `social_proof_opt_in: z.boolean().optional()` |
| `controllers/participantController.ts` | pulled out of the `acquisition` spread, passed through |
| `services/freeSignupService.ts` | `socialProofOptIn` on the input; written in `defaults` |
| `frontend/.../PortalFreeSignupPage.tsx` | the checkbox, under the NAME field |
| `frontend/src/services/onboardingApi.ts` | the field on the request type |

## Three things that could have gone wrong quietly

**1. The route is `.strict()`.** An unknown key is not ignored, it **rejects the whole signup**.
So the field had to be added to the schema, and the page sends it **only when ticked** - an
unticked box sends no key at all. Absent and `false` land identically on a `NOT NULL DEFAULT
false` column, so omitting costs nothing and the page survives meeting a server deployed before
this change.

**2. It is written in `defaults` only**, like `consent_contact` beside it, so a returning email
writes nothing. Here that is not a compromise: the feed selects on `leads.created_at` inside a
rolling window and a returning person's row keeps its original `created_at`, so it is outside the
window regardless. There is no case where not updating costs somebody the naming they agreed to.

**3. The consent is never inferred from the email tick.** Agreeing to be emailed is not agreeing
to appear by name on a public page. Two tests assert the independence in both directions.

## The test harness was coupled to field order, and the guard fired

`fillAndSubmit` destructured `[nameEl, emailEl] = inputs()`, and a guard test existed solely to
stop a new field above them retargeting all 22 tests in the file. Its own comment records it
firing twice before - once for the phone field, once when the marketing checkbox moved.

The new checkbox sits **under the name field**, because the consent belongs beside the thing it is
about - the same rule the team applied when they moved the marketing box under the email field.
That breaks the index invariant a third time. So rather than re-pin it, the coupling is gone: the
harness selects `#cbfs-name` and `#cbfs-email` by id, and the guard now asserts the ids exist plus
a DOM-position check that the checkbox really does precede the email field. Weaker claim about
layout, stronger claim about the contract.

`PortalFreeSignupPage.test.tsx` would have reached 538 lines, past CLAUDE.md's 500-line ceiling,
so the new cases are a sibling file (`PortalFreeSignupPage.socialProof.test.tsx`) following the
`welcomeBack` precedent. Base is 447.

## Verification

Every changed file was parsed with the repo's own TypeScript parser before pushing, **and the
parser was shown able to fail** against a deliberately broken copy. It caught one real break: a
stray `});` left by the scripted guard rewrite. CI is the real gate for types and tests.

**CI then caught a false claim of mine, which is the more useful catch.** One test asserted that
`captureSignupConsent` is *not called* when only the naming box is ticked. That was wrong about
the system: the service calls the helper unconditionally and the helper's own `isAffirmative`
gate decides whether anything is written - "an absent or false checkbox writes NOTHING". The
assertion would have passed only if the code did something it does not do.

The replacement asserts the thing actually worth protecting: the helper IS called, and
`marketingOptIn` is falsy, so ticking the naming box cannot mint a permission to send. A second
case pins that nothing about the naming grant reaches the consent record at all. 1 failed of
47,951 - the suite isolated it to the file I touched.

## Not done, and named

- **No deploy.** Backend and frontend must ship together: the page sends a key the old schema
  rejects, which is why it is sent only when ticked.
- **Nothing backfills the existing rows.** Everyone who signed up before this stays `false`, which
  is correct - consent cannot be invented retroactively.
- **The ticket's third clause is not yet satisfied**: "confirm a real opted-in lead renders by
  first name" needs a real signup through the deployed form. That is a post-deploy check, not
  something a unit test can stand in for.

## Found while reading, NOT part of this ticket

`snackbarFeedService.ts` records the house phrasings for a landing page as **"$0 to start"** and
"No card needed". The first states a zero price, and TWC-1's own sweep pattern treats `$0` as a
violation of 40 TAC 807.172(d) - the third bad video title said exactly `$0`. `"$0 to start"`
appears in rendered copy in at least `frontend/src/config/primaryCta.ts`,
`frontend/src/pages/EnrollPage.tsx` and `backend/src/services/mayaPersona.ts`.

Either the house phrasing or the sweep rule is wrong, and that is Ali's call, not a thing to
change site-wide inside a consent ticket. **Raised, not touched.** It does not widen TWC-1's
closure, which was scoped to `media_assets` and `content_items`.
