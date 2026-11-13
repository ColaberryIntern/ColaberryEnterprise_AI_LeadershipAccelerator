# CC-20261113-q7m2 — the story brief reached no builder, and the prompt sent them at a 401

**Date:** 2026-11-13
**Branch:** `workstream/render-story-brief`, cut from `origin/main` at `1dc95c85f`
**Reported by:** Tashima Diah, by email, 13 Nov 2026 11:52 AM CT

---

## What she reported

Two questions on STORY-000. Both turned out to be platform defects, and in both cases she had
followed the instructions correctly.

1. Her Command Center could not read `/api/admin/agent-domains-mine`: "Authentication required"
   even while signed in to the admin site in the same browser.
2. The prompt told her to "read the brief above this prompt on the story page" for her domain's
   counts, accountable human and employee. There was no brief on the page, so she left those
   fields blank and stopped.

## Defect 1: the brief was generated for every builder and rendered for none

The brief exists. On `internship.STORY-000` it is 1,253 characters and names her domain, her
employee, her accountable human (Dhee) and every count. Measured in production.

The chain that loses it:

| Step | What happens |
|---|---|
| `agentDomainProvisioner.ts:324` | binds `s.title` into **both** `title` and `description`; the brief goes to `narrative` |
| `projectTreeDto.ts` `toTaskDto` | carried no `narrative` at all, so the brief never crossed the wire |
| `projectHydrate.ts` `BackendTaskNode` | had no `narrative` member either |
| `ProjectWorkspacePage.tsx:326` | rendered `task.what`, sourced from `description` |

So a builder opened a story, saw the title as the heading and the title again as the body, then
read a prompt whose first instruction is to read a brief that had never been sent. The prompt
**deliberately** omits the counts, the accountable human and the employee so there is exactly one
copy of each figure (`agentDomainCommandCenterStory.ts:217-223`), and that one copy was
unreachable. Across her board, `description = title` on all 107 rows.

`narrative` had exactly one render site in the whole frontend: the admin delivery drill-down.

### Fix

`narrative` added to the portal DTO, to the client contract type, and to both hydrate paths
(`serverContentOf` and `taskFromServer`), preferring it over `description` and falling back when
it is absent. The workspace page renders it through `RecordProse` rather than a bare `<p>`,
because the brief is generated Markdown with bold, backticks and hard line breaks and a `<p>`
shows the `**` literally and collapses the paragraphs. `RecordProse` already exists for that
exact fault on the capstone page and carries the generated-line-break plugin, so it is reused.

## Defect 2: the prompt sends builders at an endpoint that cannot work

`agentDomainCommandCenterStory.ts:229` said `Read GET /api/admin/agent-domains-mine`, and the
prompt never mentioned the snapshot.

But the owner decision of 2 Nov 2026, recorded in `agentDomainSnapshot.ts`, is that the Command
Center stays a public page and reads a committed `.colaberry/agent-domain.json`, **because a
public page cannot authenticate**. Confirmed in code: `requireSection` (`authMiddleware.ts:98`)
demands an `Authorization: Bearer` header, there is not one `res.cookie` call in the entire
backend, and `app.use(cors())` allows every origin without credentials. So CORS was never her
problem; she simply had no token, and no page-side change could have produced one.

### Fix

A new section in the prompt, "Where the data comes from: a file in this repository, not a live
call". It states that the endpoint names below are provenance rather than instructions, names the
snapshot, and adds the two rules that matter: read every figure at runtime rather than hardcoding
a count, and take staleness from `.colaberry/manifest.json` because the snapshot deliberately
carries no timestamp. Panel 1's wording now reads from the snapshot's `agent` key.

Acceptance criterion 1 requires each panel to "name the endpoint it read"; the snapshot's
`sources` map satisfies it, so nothing was invalidated.

## Done outside this PR

- Tashima's repo had no `.colaberry/agent-domain.json`: her last document sync was 29 Oct, before
  the snapshot started shipping. Re-synced via `refreshRepoDocuments` (the same function the
  portal's "Sync from GitHub" button calls), commit `9a898fdfa3d4683e57d118fe20339772e707f636`.
  Verified present, 85,820 bytes.
- Both answers sent to her, with the brief verbatim so she could finish without waiting.

**Ruth has the identical gap** (curriculum, `rtkumera/AI-Agent-Project`, last sync 22 Oct). Not
re-synced: writing to a second builder's repository was not what was asked, and it is one command
whenever it is wanted. Five of the seven staffed boards already have the file.

## Verification

- `npx tsc --noEmit` — clean on **both** stacks, and the frontend run was proved to be checking
  the changed file by planting a type error in `ProjectWorkspacePage.tsx` and seeing `TS2322` at
  the expected line before removing it.
- Backend `projectTreeDto` / `commandCenter` / `agentDomain` suites — 87 suites, 1,899 passed.
- Frontend `projectHydrate` — 14 suites, 168 passed.
- 5 new tests in `projectHydrate.brief.test.ts`, **mutation-tested**:

| Mutation | Result |
|---|---|
| prefer `description` again, as before the fix | **2 failed** (the two encoding the order) |
| restored | 5 passed |

The three that kept passing under the mutation are the fallback cases, which should be
indifferent to it. The two that failed are the ones asserting the ORDER, which is the defect: a
test that only checked "narrative is carried" would have passed against the broken build.

## Not done

- The `description = title` binding in the provisioner is untouched. Rendering `narrative` fixes
  what builders see; normalising that column is a separate change across 1,477 rows.
- The brief's own text has rough edges that are generator artifacts, not display faults, and were
  left verbatim rather than quietly edited: "35 researched capabilities, of which ... 35 carry a
  recorded blocker", and "1 legacy agent rows".
