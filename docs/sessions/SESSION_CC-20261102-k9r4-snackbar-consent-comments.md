# CC-20261102-k9r4 - Snackbar consent: correcting three comments, and opening SNACK-2

**Date:** 2026-11-17 (Central)
**Workstream:** Marketing ops (BC list 10467338643, group "Then automate the spend feed")
**PR:** https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4152
**Tickets:** SNACK-1 (10501455327, closed on decision) - SNACK-2 (10520570248, opened here)

## Why this exists

SNACK-1 was closed earlier today on the decision that the landing-page snack bar is working as
designed. Closing it left one piece of residue that was explicitly flagged as NOT done: comments in
the code asserted a signup checkbox that does not exist. This session fixed those comments and
tracked the actual missing work as its own ticket.

## What was measured, not assumed

`leads.social_proof_opt_in` is `BOOLEAN NOT NULL DEFAULT false`.

Exactly four code files reference it:

| File | Role |
|---|---|
| `backend/src/db/ensureLandingPageSnackbarSchema.ts` | boot DDL that adds the column |
| `backend/src/models/Lead.ts` | model attribute declaration |
| `backend/src/services/marketing/snackbarFeedService.ts` | **reads** it (`COALESCE(l.social_proof_opt_in, false) AS opted_in`) |
| `backend/src/db/__tests__/ensureLandingPageSnackbarSchema.test.ts` | schema test |

A repo-wide search for the camelCase attribute `socialProofOptIn` returns **zero** hits. A Sequelize
write path would use that spelling, so nothing writes the column. It is `false` on every lead row
and stays that way until a form collects the consent.

## The three comments that were wrong

1. `ensureLandingPageSnackbarSchema.ts` - "Set from the signup checkbox. Only opted-in people are
   ever shown by first name".
2. `Lead.ts` - "Opted in at signup to be shown by first name in landing-page snack bars." **This
   third instance was found while fixing the other two**; the close-out note had only identified two.
3. `snackbarFeedService.ts` - no false sentence, but nothing marked the opted-in branch as
   unreachable against real data, so it read as a live path.

## What the corrected comments now say

The point of the rewrite is not tidiness. It is the consequence that costs time:

- The bar can only ever render `Someone in <city>`.
- The by-first-name branch in `composeSignupEvents` is dead against real data. It is covered by
  unit tests only because those tests pass `opted_in: true` rows in directly, which is itself worth
  stating so the coverage is not mistaken for proof the path runs.
- **A page configured `name_format: 'opted_in_only'` drops every row and shows no bar at all.** An
  empty bar on such a page looks like a feed bug and is not one.

## Verification

- **Comment-only, checked twice.** Every changed line was compared against a matcher requiring it
  to begin with `*`, `//`, `/*` or `*/`. Run against my local edits: 24 changed lines, all comments.
  Run again against **GitHub's own patch** for PR #4152: same result (`+9 -2`, `+5 -1`, `+10 -0`).
- **The matcher was shown able to fail first.** A control copy with `declare social_proof_opt_in:
  boolean; // PLANTED` appended to a code line was fed to the same checker, which reported
  `!! CODE LINE` for it. Without that, a clean result would only have proved the matcher was inert.
- **Comment delimiters balanced and unchanged:** `/*` 1/6/2 before and after, `*/` 1/6/2 before and
  after, so no stray `*/` was introduced inside the new prose.
- **Fetched originals were byte-identical to `main`** by git blob SHA
  (`7c7715a5...` for the schema file, `11b0c834...` for `Lead.ts`), confirming the edits were made
  against main's real content and not a mangled copy.
- **Branch content re-read after the push** and compared to the local files; all three matched.

## A false alarm worth recording

`grep -c $'\r' <file>` returned the file's full line count for all three files, which looked like
CRLF contamination. It was not: `$'\r'` did not survive into the pattern, so grep matched every line
on an empty pattern. The blob-SHA comparison against `main` settled it - the files were already LF
and byte-identical. **The check was broken, not the files.** A positive result from a pattern that
may have expanded to nothing proves nothing.

Separately, `Lead.ts` carries one non-ASCII character (an em-dash at line 168, in a pre-existing
`C8.3` comment). It predates this change and was left alone.

## What is NOT done

- **The consent is still not collected.** No signup form writes the column; that is SNACK-2
  (10520570248, due 2026-12-01, assigned to Ali). This PR changes no behavior at all.
- **Nothing is deployed.** Comments only, so there is nothing to verify in production, but the PR
  is merged-pending and the merge is Ali's click.

## Links paired

- SNACK-2 carries the PR link and an explicit note that the PR does **not** do the ticket.
- SNACK-1 carries a pointer to SNACK-2 so the residue is traceable from the ticket it came out of.
