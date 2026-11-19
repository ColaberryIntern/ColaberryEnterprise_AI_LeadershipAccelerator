# Live sessions

Blueprints for Ali's weekly live session, written by the `plan-live-session` skill
(`.claude/skills/plan-live-session/SKILL.md`). Each blueprint is the plan; `build-class-deck` turns
it into the deck.

## Run it

```
/plan-live-session
/plan-live-session week=5 build="an MCP server for our CRM"
/plan-live-session source=news topic="Anthropic's $100M FDE academy"
/plan-live-session source=mix students_on=7 length=90 audience=public-preview interactive=true
```

Every parameter is optional and it never asks a question unless `interactive=true`. A plain
sentence works too: "plan next week's live on subagents, students are on week 7".

### Copy-paste skeleton

Lines starting with `#` are ignored, and an empty value (`week=`) means "use the default".
Fill in what you want and leave the rest.

```
/plan-live-session
# ── WHAT TO TEACH ─────────────────────────────────────────────────────────
#  Weeks:  1 Claude Code Foundations + Workspace    7 Subagents + Multi-Agent Team
#          2 Agent Skills (build 3 skills)          8 Claude Code Workflows + Automation
#          3 Claude API + Workflow Assistant        9 Reliability Engineering + Quality Layer
#          4 Prompt Engineering + Prompt Library   10 Governance + Governance Engine
#          5 MCP Foundations + First MCP Server    11 Systems Architecture + Arch Package
#          6 Advanced MCP + System Integration     12 Capstone + Architect Expo
week=
# e.g. week=5        (blank = the skill picks the best week)
topic=""
# e.g. topic="why most AI agents fail in production"     (still matched to a week)
source=auto
# auto (data decides) | curriculum | news | mix
students_on=
# e.g. students_on=6   the week most students are on now; nearby weeks rank higher

# ── WHAT TO BUILD AND SHOW ────────────────────────────────────────────────
build=""
# e.g. build="an MCP server that reads and updates our CRM"
proof=""
# e.g. proof="<student>'s deployed triage agent cut ticket handling from 9 min to 2"
#      real thing you can show; without it the Proof line is capped at 2/5
news=""
# e.g. news="https://www.anthropic.com/news/..."  or  news="Anthropic launched X this week"

# ── WHO AND WHEN ──────────────────────────────────────────────────────────
audience=students
# students | public (YouTube, students in chat) | public-preview (first 20 min public)
length=60
# 60 | 90 | 120 minutes
date=
# e.g. date=2026-12-01   (blank = next open Monday, 6:30 pm Central)
series=""
# e.g. series="Forward Deployed Live, Episode 4"   (blank = "Weekly Live · Episode N")
guest=""
# e.g. guest="Jane Doe, Head of AI Platform at Acme Health"

# ── GUARDRAILS ────────────────────────────────────────────────────────────
avoid=""
# e.g. avoid="pricing talk, OpenAI comparisons, any placement-rate numbers"
notes=""
# e.g. notes="keep the live builds under 8 minutes each; end by 7:30"

# ── HOW FAR TO GO ─────────────────────────────────────────────────────────
angles=5
# 3–7 story angles to write and score
pass_mark=70
# 60–90 Idea score needed before the full plan is written
interactive=false
# true = stop so you pick the topic and the angle
stop_after=blueprint
# picks (topic ranking only) | angles | idea | blueprint (full plan)
```

## What is in this folder

| Path | What |
|---|---|
| `<date>-<slug>/blueprint.md` | The blueprint, readable top to bottom (rendered from the JSON) |
| `<date>-<slug>/blueprint.json` | The same content as structured data, validated against `references/blueprint.schema.json` |
| `<date>-<slug>/sources.md` | Every URL fetched while planning, with access date |
| `history.json` | One entry per blueprint. Drives "not yet covered" in topic scoring and the callback to last week |
| `.work/` | Stage scratch files (git-ignored) |

## history.json

- `schedule` sets the default air date: the next `weekday` with no blueprint yet. (Monday 6:30 pm Central,
  confirmed by Ali 2026-11-19). Change it here if the slot moves.
- `sessions[]` is appended by `scripts/history.js append` after a blueprint validates.
- After a session airs, fill its `results` by hand, for example
  `{ "aired": true, "attendance": 41, "youtubeViews7d": 1200, "shortsUsed": ["sb-3", "sb-7"] }`.
  Once ten sessions have results, the skill prefers these numbers over the benchmarks in
  `references/evidence.md`.
- A planned session that never aired: set `results: { "aired": false }` or delete the entry, so
  its week is not treated as covered.

## Status of facts

Every fact in a blueprint is `sourced` (it appeared in a page fetched during that run) or `verify`.
Re-check `verify` facts and the news on the air date. The pre-show checklist says so every time.
