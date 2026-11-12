# CC-20261111-n4k8 — the nine admissions routes nothing was allowed to reach

- [x] Classify `/api/admin/admissions` in `mgmtSectionGate` PATH_SECTION
  - Date: 2026-11-12
  - Session: CC-20261111-n4k8
  - What changed: one row filing the admissions operating surface under `lead_ingestion`,
    plus a per-surface test suite that reads the route file from disk so a tenth route
    cannot be added without classifying it.
  - Verification: `tsc --noEmit` 0 errors; 16 new tests; all 11 `mgmtSectionGate` suites
    green (121 tests); mutation-tested by deleting the row, confirming its absence from the
    file, and watching 10 of 16 fail; `checkTestTypecheck` matched in both directions; full
    backend CI suite green.
  - Notes: found while unblocking the admissions domain's manager, whose stored blocker
    named this exact gap and was right about it.

## What was unreachable

Nine routes: `stats`, `conversations`, `knowledge` (read, create, update), `operations`,
`callbacks`, `call-log`, `documents`. Every one of them carries `requireAdmin` and none was in
`PATH_SECTION`, so for any scoped management token the whole surface answered *"You do not have
access to this section."*

## Why two standing guards both missed it

| Guard | What it does | Why it could not see this |
|---|---|---|
| `guardedPathsAreClassified.test.ts` | walks back from every `requireSection` call to its router | these nine never call `requireSection`, so there is nothing to walk back from |
| `unlistedPaths.test.ts` | pins a fixed list of surfaces | the list only contains surfaces someone had already noticed |

The route file is not where the bug is visible. `requireAdmin` on an admin route looks
deliberate and complete. The asymmetry that turns an unmapped path into a defect lives in the
gate:

- a **legacy admin** token carries no `mgmt_role`, so the gate returns `next()` on its first
  branch and never sections it — unmapped passes;
- **`mgmt_role === 'admin'`** takes the `isBroad` branch, which denies only paths that ARE
  mapped to a section they lack — unmapped passes;
- **every scoped role** falls to `if (section && allowed.includes(section))`, and an unmapped
  path has `section === null` — refused.

So an unclassified path works for everyone wide enough not to notice, and fails only for the
people it was built for. That is the whole reason the comments in that file keep insisting a
prefix is classified in the change that mounts it.

## Why `lead_ingestion`, and why it takes nothing away

This surface is the intake funnel — the same domain as `sources`, `ingest-logs` and
`routing-rules` directly above it, which the `admissions` and `lead_intake` roles already own.

`brandPaths.test.ts` names the condition for adding a classification safely: every role that
legitimately reaches a surface must be checked in the same change, or it silently loses it.
Here the check is trivial and the answer is nobody — the paths were deny-by-default for **every**
scoped role before this row, so no role can regress. `owner` and `admin` derive from
`ALL_SECTIONS` / `ADMIN_EXCEPT_INBOX` and both hold `lead_ingestion`.

No frontend twin in `UNLISTED_PATH_SECTIONS`: there is no `/admin/admissions` frontend route and
no nav entry, so this is an API-only surface — the same case the `project-lifecycle` row
documents.

## The test reads the route file rather than trusting a list

Two of the sixteen tests load `admissionsRoutes.ts` from disk, count the `router.*` calls, and
assert every declared path classifies. A hand-copied list of nine paths would go stale the first
time someone adds a tenth route, which is exactly how this surface became unreachable. The count
assertion is deliberately brittle: a tenth route should fail here and make someone look.
