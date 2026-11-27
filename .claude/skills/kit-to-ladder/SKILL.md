---
name: kit-to-ladder
description: Ali's idea-to-build engine. Turns one of his build kits (a zip with a BUILD_PROMPT / SPEC .md plus design HTML and screenshots, or a single .md, or a pasted spec) into a Loop-Architect-ready Basecamp build list, then works that list ticket by ticket to done - questions up front, 2 to 4 releases with ONE PR and ONE deploy each, two visual PDFs on every ticket before it closes, briefs only at milestones. Lands in a new list in Ali Personal unless he names another project or an existing list. Invoke on "my skill", "turn this kit into a list", "generate the requirements and create a list in Ali Personal", "make the Basecamp list for <kit>", "the skill to move to bc", "story-build this kit", the Tab Board's "New build from idea" button, or when Ali drops a *-kit.zip / *-vNN.zip / CLAUDE_CODE_*.md in Downloads and wants it built.
user-invocable: true
---

# kit-to-ladder: idea to build

One kit in, one Basecamp build list out, then worked to done by `/loop-architect`, one ticket at a
time, without stopping between milestones. Ali has run this about 30 times in 19 tabs since
2026-10-20; this file is what those runs converged on. The process page is
`docs/process/IDEA_TO_BUILD_PROCESS.html`.

**Not `story-build`** (the intern build plan through the AI Project Architect pipeline). **Not
`evidence-workstream`** (research documents, not code). This skill is for code Claude Code builds,
from a kit Ali approved.

## Ali's rules, in his words (each came from a correction; never make him say them again)

- "you have to answer any questions up front" / "Stop asking me to do things. You do it. You are only supposed to come to me at milestones"
- "proceed ... and don't stop until you reach a milestone 1 pr 1 deploy for each milestone"
- "Every ticket should have at least 2 visual artifacts before it is closed" / "The same visual pdf can be used max 3 times across one list and max one time per tasks." / "Artifacts should not be .md files. They should be pdfs"
- "I can't see what's going on in these tickets without reading a bunch of text. I want the visuals." / "i need visual options so I can see - otherwise i don't know what I'm approving"
- "Any claude code should be able to work from the list and tasks with no other information" / "Make sure you upload the files to docs and files ... include the links in the tickets"
- "Use the last 10 list in that project to catch the pattern"
- "Kes should not be accessing tickets in Ali Personal": a build other people work on goes in its own project.

## Inputs

| # | Thing | Default |
|---|---|---|
| 1 | The kit: a zip, a .md, or a pasted spec | Required |
| 2 | Where it lands | A new list in **Ali Personal** (bucket 7463955). `--bucket <id>`: a new list in another project Ali created (public like Colaberry Live 49210714, or a team project). `--into-list <id>`: new groups on an existing list (a new round of the same product). Same engine, same shape. |
| 3 | Assignee | Ali, 17454835 |
| 4 | Start date | The next working day |

## Part 1: kit to list (one sitting)

1. **Unzip into a fresh scratch folder** (never into the repo, never run anything from inside it). Read the kit's prompt/spec in full and open the design HTML it names first. Windows path limit: unzip to a short path.
2. **Catch the pattern:** read the shape (groups, ticket sections, dates) of the 10 newest build lists in the target project before writing tickets. The house shape today is Weekly Live Studio / Voice AI Studio / Career Prep v27 / Services Upgrade / hire.refactored.ai.
3. **Re-verify every path and symbol the kit cites against `origin/main`** (`git cat-file -e origin/main:<path>`, `git grep`). Every discrepancy goes into the Build Contract under "Corrections to the kit", and into the ticket that touches it.
4. **Questions up front, all of them, once.** Conflicts with decisions already made (memory, earlier PRs, CLAUDE.md) and the kit's own "ask Ali" items become lettered questions on the first milestone ticket (M0), recommended option first, each with a default that applies automatically. Ask them in chat once as one lettered block too; Ali answers in one line ("Q1 A, Q2 A"). Never resolve a product conflict silently. After this, no questions until a release review.
5. **Write the ladder spec** as a JS module next to `examples/career-prep-v27.js` (copy its shape):
   - `XX0 - Control` group: XX0.1 stage the kit, XX0.2 execution contract + plan (independently audited), XX0.3 standing session log and ticket comments.
   - **2 to 4 releases at natural product milestones, ONE PR and ONE deploy each.** Groups inside a release end in a `checkpoint()` ticket (full quality gate on the release branch, no PR, no deploy, no question); the release's last group ends in the `ship()` ticket (quality gate, ONE PR, Ali merges, `deploy-prod.sh`, `loop-production-verifier`).
   - `MILESTONE APPROVALS (Ali)`: M0 the up-front questions, then escalations, review gates and the final "open it up" gate. Only Ali ticks these.
   - Every 🤖 ticket: what, why, inputs (links to the exact kit files), repository facts (verified), in scope, out of scope, machine-checkable acceptance, tests (happy, failure, boundary, idempotency), verification commands. The renderer adds the run line, the shared contract and the close-out.
   - Subfolders: `01 - Build kit` (the zip, spec, design HTML), `02 - Screenshots`, and an empty `03 - Ticket artifacts` (close-out PDFs go there).
   - Due dates on working days, never before a dependency. Renaming a group later: set `formerName`.
6. **Validate, dry run, publish, prove:**
   ```bash
   cd .claude/skills/kit-to-ladder
   export KIT_DIR=<scratch>/<kit folder> KIT_ZIP=<path to zip>
   node scripts/validate_ladder.js examples/<kit>.js
   node scripts/publish_ladder.js examples/<kit>.js --token-file <ali token> [--bucket <id>] [--into-list <id>] --dry
   node scripts/publish_ladder.js examples/<kit>.js --token-file <ali token> [--bucket <id>] [--into-list <id>]
   node scripts/publish_ladder.js examples/<kit>.js --token-file <ali token> [same flags]   # must report created: 0
   ```
   The token is Ali's Basecamp token from the AI Project Architect container (`story-build` has the one-line `ssh ... get_user_token` command). Keep it in the session scratchpad, delete it after, never commit it.
7. **Kickoff:** open the list in Ali's browser, give him the list URL, the Build Contract URL and the M0 questions in one message. That is the last stop before work starts.

## Part 2: list to done (keeps going)

Run `/loop-architect Execute Basecamp ticket <id> ...` for each ticket. Between tickets nobody has to say "keep going":

1. After every close: `node scripts/next_ticket.js --list <list id> [--bucket <id>]` gives the next ready 🤖 ticket (earliest due date whose blockers are closed). Start it in the same turn.
2. A 🧑 milestone never stops the AI tickets that do not depend on it; its defaults apply and are logged as assumptions.
3. **Stop only** at a `ship()` ticket's PR (Ali merges), at a hard stop from `loop-architect` (governance, repeated failure), or when `next_ticket` says `done`. Each stop is one short brief plus the milestone HTML visual opening in his browser.
4. Never end a turn while `next_ticket` returns a ticket and nothing is blocking it.

### Closing a ticket (the only way)

Each 🤖 ticket ends with two HTML pages written by the session: a one-page **visual** (what it looks like or how it flows: screenshot, diagram, before and after) and a **document** (what changed, how it was checked, evidence). Then:

```bash
node .claude/skills/kit-to-ladder/scripts/closeout.js --code VS1.3 --list <list id> --vault <build folder id> \
  --artifacts "03 - Ticket artifacts" --visual <visual.html> --doc <document.html> --takeaway "<the result in one line>" [--dry]
```

It renders both PDFs (the visual must be one page), posts them on the ticket visual first and files them in the artifacts folder, posts a TAKEAWAY comment with both HTML pages attached, and closes through `~/.claude/hooks/bc-close.js` (2 PDFs, each once per task, at most 3 times per list). If the gate refuses, the ticket stays open: fix the artifacts, never route around the gate. Every step is idempotent; a failed run is finished by running it again.

## What the scripts guarantee

- Every write refuses unless the Basecamp identity is Ali's (17454835).
- Publisher: idempotent by name (folder, sub-folders, uploads, contract, list, groups, tickets by id prefix); `--update` rewrites ticket bodies, dates and assignees; never rewrites an existing list's description in `--into-list` mode; every call has a 30 s timeout and capped retries.
- `next_ticket.js`: read only.
- `closeout.js`: checks every argument first (ticket code, ids, two different .html pages, a real takeaway); stops at the first failed step and says which.

## Files

- `scripts/publish_ladder.js`: the publisher. `scripts/target.js`: where it lands (Ali Personal, `--bucket`, `--into-list`).
- `scripts/render_ladder.js`: pure HTML renderers (ticket, list description, Build Contract).
- `scripts/validate_ladder.js`: spec checks (ids, dependencies, dates, files, dashes, required sections).
- `scripts/next_ticket.js`: the next ready ticket on a list.
- `scripts/closeout.js`: the two-PDF close-out, through the close gate.
- `test/engine.test.js`: `node --test .claude/skills/kit-to-ladder/test`.
- `examples/career-prep-v27.js`: the first ladder built with this skill (Ali Personal list 10512940569).

## Installed for every tab

This skill also lives at `~/.claude/skills/kit-to-ladder`, refreshed from `origin/main` by the Tab Board each time its "New build from idea" button is used, so a tab on any branch can run it. The repo copy is the source; change it here, never in the installed copy.
