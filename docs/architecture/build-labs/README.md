# Build Artifact(s) Labs — how they work, and what holds them together

The weekly lab that produces a student's portfolio. Rebuilt across weeks 1–10 and 12
in August 2026; week 11 deliberately left alone.

---

## What a lab is

One `implementation_task` timeline card per week, in the `build` bucket, rendered by
`frontend/src/components/timeline/BuildArtifactsRender.tsx`. The card's
`metadata.content.body_html` holds the whole lab: a series of `<h4>Step N · title</h4>`
headings, each followed by prose explaining why the step matters and a `<pre>` block
holding the prompt the student pastes into Claude Code.

The picker at the top of the panel is derived from those `<h4>` headings. Nothing
else defines the steps.

**The cards live in the database, not in this repo.** They are `metadata.authored = true`
with no `metadata.source`, which is what makes a direct DB edit durable — a card with a
`source` is re-asserted by a boot seed and any edit to it reverts on the next deploy.
Check before editing:

```sql
SELECT metadata->>'source', metadata->>'authored' FROM timeline_cards WHERE id = '...';
```

---

## The shape, and why

Seven ordered steps, about an hour, worked in sequence. Three rules run through every
rebuilt lab.

**Steps come from the blueprint's own `risk_areas`.** `backend/src/data/weekBlueprints.ts`
already records what students get wrong each week, so the hour goes there rather than to
a guess. Week 9's three — silent catch-and-swallow, unbounded retries, non-idempotent
writes — are almost verbatim this repo's own forbidden patterns, so the lab teaches the
standard the platform holds itself to.

**There is always a step that proves it works.** Not "did you build it" but "did it
actually fire / start / refuse bad input". Week 7 step 4 makes the student confirm their
subagent was really invoked and tells them a vague `description` is the cause when it
wasn't. Week 2 repeats that lesson for Skills, five weeks earlier, with the same
instruction to rewrite *only* the description and retry.

**The last step commits a recording.** Every lab ends with a screen recording saved to
`artifacts/week-NN/`, embedded in a README, committed by the student. That matters twice:
a hiring manager will watch thirty seconds of working software and will not read three
Markdown files, and a commit authored by the student counts toward *their* GitHub
contribution graph in a way a platform-bot commit never did.

### What was there before

Five alternative documents *about* the work — "Subagent Design Document",
"MCP Server Configuration Document" — each prompt dictating a filename and saving to the
**Downloads folder**. Measured across all 65 student-weeks of submissions: every single
one built exactly **1 of the 5**, because the scoring says *"points on your first
submitted build only… extra builds don't add points."* Students did exactly what the
incentive said.

Across those 65 artifacts: 39 `.md`, 11 `.pdf`, 10 `.csv`, 4 `.txt`, 1 `.docx`, and **no
media of any kind** — while the blueprint asks for a demo in 10 of the 12 weeks. Not
because students wouldn't record one, but because the uploader would have refused it.

---

## The twelve weeks

| Wk | Lab | Lands in the student's repo |
|---|---|---|
| 1 | Architect Workspace | repo, `CLAUDE.md` proven to steer, first commit |
| 2 | First Agent Skills | `.claude/skills/` ×3 + README |
| 3 | First AI Workflow | Python triage tool + report |
| 4 | Prompt Library | `prompts/` + eval cases + scoring script |
| 5 | MCP Server | `mcp-server/` with all three primitives |
| 6 | Production MCP Server | transport, fenced roots, integration adapter |
| 7 | Subagent Team | `.claude/agents/` ×3 + coordination README |
| 8 | Automation Platform | `.claude/commands/`, a hook, `.github/workflows/` |
| 9 | Reliability Layer | `reliability/` — timeout, capped retry, idempotency, dead letter |
| 10 | Governance Engine | `governance/` — policy, evaluator, HITL queue, audit log |
| 11 | Architecture Package | `architecture/` — *documents, correctly* |
| 12 | Expo Presentation | the recorded talk + final package |

**Week 11 is not a gap.** Its declared deliverable genuinely *is* a packaged architecture
document for the Expo. Converting it would be pattern-matching rather than judgement, and
would break a week that works. It is a named exception in `buildLabContract.DOCUMENT_WEEKS`.

**Week 12 is a rehearsal, not a build** — take stock honestly, find the one story, write a
spine with a clock on it, build the demo that cannot fail, get asked the hard question
first, record, land it. Its blueprint deliverables are a recorded presentation and a
certification, not more code.

---

## The seam that has to hold

Each lab tells a student to create a specific folder. `services/sbp/capabilityInventory.ts`
declares that same folder as the evidence for a capability:

| Lab says build | Inventory looks for |
|---|---|
| `.claude/agents/` | `AGENTS` |
| `mcp-server/` | `MCP_SERVER` |
| `reliability/` | `RELIABILITY` |
| `governance/` | `GOVERNANCE` |

**Nothing enforced this agreement.** The labs are database rows, so no CI check can fail
when one is edited. Rename the folder in a lab's prompt copy and the inventory still looks
for the old path: a student does everything right, and their capability reads as missing,
with no error anywhere.

`services/sbp/buildLabContract.ts` closes that. It derives the expected paths *from* the
inventory rather than restating them, so a new capability extends the contract
automatically instead of silently escaping it.

---

## Checking it

**In CI, without a database** — `buildLabContract.test.ts` runs the checker against
fixtures. It covers the drift case explicitly, plus the seeded-card trap, the
Downloads-folder regression, and a missing week.

**Against production, read-only:**

```bash
docker exec accelerator-backend node dist/scripts/auditBuildLabs.js
```

Prints a line per week and exits non-zero on any violation, so it can gate a deploy or run
from cron. There is no `--apply` and there should not be — a lab is prose written for a
student, and nothing here is qualified to rewrite one.

### The rules it enforces

| Rule | Catches |
|---|---|
| `lab_exists` | a week with no build lab at all (week 12 was in this state) |
| `not_seeded` | a card a boot seed owns, where a DB edit reverts on deploy |
| `no_downloads_folder` | the old anti-pattern returning |
| `has_steps` / `enough_steps` | a lab still in, or slipping back to, the five-document shape |
| `commits_to_week_folder` | a recording with nowhere to land, so run evidence is never found |
| `evidence_path_agrees` | **the silent one** — lab and inventory disagreeing on a path |

---

## Known gap

**The Capstone Record will show less than the repo contains.** Its artifact band is built
from *uploaded* artifacts that the platform mirrored into `artifacts/`, and the mirror only
handles `.md`, `.txt` and `.csv` (`TEXT_EXTENSIONS`) — everything else is held
platform-side, and the compiler drops any artifact with no repo path, because *"a row that
cannot point at a file is not evidence."*

So a student who commits their MCP server and Inspector recording has a rich, correctly
attributed repo and a nearly empty portfolio page.

The fix belongs on the portfolio side, not in the labs: read the student's repo tree
directly rather than only their uploads. `capabilityInventory` exists for that — eleven
capabilities with their evidence paths already declared. The reader that resolves them
against a real tree is unwritten.

---

## Related

- `backend/src/data/weekBlueprints.ts` — the deliverables and `risk_areas` each lab is built from
- `backend/src/services/sbp/capabilityInventory.ts` — the eleven capabilities and their evidence
- `backend/src/services/sbp/fileOwnership.ts` — why `.claude/agents/**` is student-owned
- `backend/src/services/capstone/` — the Capstone Record the labs ultimately feed
