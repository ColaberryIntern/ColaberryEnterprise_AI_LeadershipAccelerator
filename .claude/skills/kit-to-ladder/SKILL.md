---
name: kit-to-ladder
description: Turn one of Ali's build kits (a zip with a BUILD_PROMPT / SPEC .md plus design HTML and screenshots) into a Loop-Architect-ready Basecamp to-do list in Ali Personal, in the same format as the hire.refactored.ai, Services Upgrade and Career Prep lists - a Docs & Files folder with the kit uploaded, a Build Contract document, one group per PR, self-contained 🤖 tickets that each run with /loop-architect, and 🧑 milestone tickets for Ali with lettered questions and defaults. Invoke on "generate the requirements and create a list in Ali Personal", "turn this kit into a list", "make the Basecamp list for <kit>", or when Ali drops a *-kit.zip / *-vNN.zip in Downloads and wants it built ticket by ticket.
user-invocable: true
---

# kit-to-ladder

One kit in, one Basecamp build list out, ready for `/loop-architect` to work one ticket at a time.

**Not `story-build`** (that generates an intern build plan through the AI Project Architect pipeline into the Internship project). **Not `evidence-workstream`** (that produces research documents, not code). This skill is for code that Claude Code builds in this repo, from a kit Ali approved.

## Inputs

| # | Thing | Default |
|---|---|---|
| 1 | The kit: a zip in Downloads | Required |
| 2 | Where the list goes | Ali Personal, bucket 7463955 (todoset 1041287213, Docs & Files 1041287220) |
| 3 | Assignee | Ali, 17454835 (every example list assigns Ali) |
| 4 | Start date | The next working day |

## Steps

1. **Unzip into a fresh scratch folder** (never into the repo, never run anything from inside it). Read the kit's prompt/spec file in full, and open the design HTML it names first.
2. **Re-verify every path and symbol the kit cites against `origin/main`** (`git cat-file -e origin/main:<path>`, `git grep`). Kits are written days earlier and are often wrong about paths or assume things that do not exist. Every discrepancy goes into the Build Contract under "Corrections to the kit", and into the ticket that touches it.
3. **Look for conflicts with decisions already made** (memory, earlier PRs, CLAUDE.md). Each one becomes a lettered question on the first milestone ticket, with the recommended option first and a default. Never resolve a product conflict silently.
4. **Write the ladder spec** as a JS module next to `examples/career-prep-v27.js` (copy its shape):
   - `CP0`-style control group: stage the kit, execution contract + plan audit, standing bookkeeping.
   - **Approvals, PRs and deploys only at a few major releases** (Ali, 2026-11-16: "I only want to approve, PR and deploy on major milestones - don't want to do the back and forth"). Group the kit's PRs into 2-4 releases at natural product milestones. Groups inside a release end in a `checkpoint()` ticket (full quality gate on the release branch, no PR, no deploy, no question); the release's last group ends in the `ship()` ticket (quality gate, ONE PR, Ali merges, `deploy-prod.sh`, `loop-production-verifier`).
   - Milestone questions carry defaults that **apply automatically** (logged as assumptions); Ali answers only to override. Never block a build ticket on an unanswered question, except the release review itself.
   - Renaming a group later: set `formerName` to the old name so the publisher renames it in place and keeps its tickets.
   - Every 🤖 ticket: what, why, inputs, repository facts (verified), in scope, out of scope, machine-checkable acceptance, tests (happy, failure, boundary, idempotency), verification commands. The renderer adds the run line, the shared contract and the close-out.
   - `MILESTONE APPROVALS (Ali)`: escalations first (security items from the kit), then the kit's "ask Ali" questions, review gates, and the final "open it up" gate. Every question has 2+ options and a default.
   - Due dates on working days, never before a dependency.
5. **Validate**, then dry run, then publish:
   ```bash
   cd .claude/skills/kit-to-ladder
   export KIT_DIR=<scratch>/<kit folder> KIT_ZIP=<path to zip>
   node scripts/validate_ladder.js examples/<kit>.js
   node scripts/publish_ladder.js examples/<kit>.js --token-file <ali token> --dry
   node scripts/publish_ladder.js examples/<kit>.js --token-file <ali token>
   ```
   The token is Ali's Basecamp token from the AI Project Architect container (see `story-build` for the one-line `ssh ... get_user_token` command). Keep it in the session scratchpad and delete it after; never commit it.
6. **Prove it:** run the publisher again (it must report `created: 0`), read the list back, and count the uploads in each sub-folder.
7. **Hand over:** the list URL, the Build Contract URL, the milestone questions Ali owes, and the first ticket to run (`/loop-architect Execute Basecamp ticket CP0.1 ...`). Open the list in Ali's browser.

## What the publisher guarantees

- Refuses to write unless the token is Ali's (17454835).
- Idempotent by name: folder, sub-folders, uploads (by filename), the contract document, the list, groups, and tickets (by id prefix). A failed run is finished by running it again.
- `--update` rewrites existing ticket bodies, due dates and assignees from the spec (use after editing the spec; ticked tickets stay ticked).
- Every call has a 30 s timeout; 429 and 5xx retry 3 times with backoff, then fail loud.

## Files

- `scripts/publish_ladder.js`: the publisher.
- `scripts/render_ladder.js`: pure HTML renderers (ticket, list description, Build Contract).
- `scripts/validate_ladder.js`: spec checks (ids, dependencies, dates, files, dashes, required sections).
- `examples/career-prep-v27.js`: the first ladder built with this skill (Ali Personal list 10512940569).
