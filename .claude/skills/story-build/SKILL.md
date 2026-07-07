---
name: story-build
description: Turn any project (a requirements doc or a one-paragraph idea) into a canonical, Claude-Code-buildable, gated Basecamp build plan - a single story-driven to-do list with a 🤖 AI / 🧑 Human task split, an assigned builder, milestone approval gates for an approver, and 5 linked Docs & Files. Invoke when Ali says "story-build this", "run the story-driven build", "turn this doc into a project", hands over a build requirements document, or wants a project made assignable to an intern in Basecamp. This is the same process that produced Detroit, VA ERP, Selective Service, Fairfax, Social Pilot AI, and IPOS.
---

# story-build - the locked-in Story-Driven Build

Turn any project (an RFP, a requirements doc, or a described idea) into a canonical,
Claude-Code-buildable, traceable Basecamp build plan, self-gated so nothing biased or
incomplete ships. One project = one config = one command to generate + one to publish.

## What to say to run it

Give me the five things below. Everything else has a sane default.

1. **The project** - a requirements doc (attach/point me at it) OR a one-paragraph description.
2. **Where it lands** - a new Basecamp project, or an existing one (default: the Internship project 24865175).
3. **Who builds it** - the intern/operator who owns every build task.
4. **Who approves, and how** - a per-release approver (heavy involvement, a gate per milestone) or a phase-gate approver (4 light-touch exec gates).
5. **Timeline** - default 4 weeks from today.

Optional: a marketing co-assignee (co-assigned on marketing/social/prompt tasks, like Sohail on Social Pilot).

Example: *"story-build the attached IPOS doc into the Internship project; Anvi builds, Ram approves every milestone, 4 weeks."*

## What it produces

One story-driven to-do list per project, with per-release groups (R0 walking skeleton
-> launch). Each story is a to-do carrying `Fulfills:REQ-### · Owner agent · Gherkin
acceptance · Build (Claude Code) · Vibe · Trust (TBI) · Loop-stop`, marked **🤖 [AI]**
or **🧑 [Human]** (drives the My Day tier split via `task_kind`) and assigned to the
builder. Plus a **MILESTONE APPROVALS** group assigned to the approver, and **5 Docs &
Files** documents (Requirements, Architecture & Agent Map, Trust/TBI Primer, Build Guide,
Traceability Matrix) deep-linked from every task, so a Claude Code session on another
machine can assess the whole project from Basecamp alone.

## The pipeline

The AI Project Architect story-driven pipeline (`execution/advisory/deep_plan.py`, a
6-stage maker/checker: `reqs -> agents -> stories (Gherkin + trust) -> releases -> build
guide -> trace gate + RTM + TBI primer`). It assumes **Claude Code / real code**
(React, Node, Express, PostgreSQL, Docker), never no-code tools (Bubble/Retool/Zapier/
Airtable). Run it from the AI Project Architect repo path via `PYTHONPATH`.

## Run it (two commands)

```bash
cd .claude/skills/story-build/scripts

# 0. secrets: pull at runtime, never commit, wipe after (see Rails)
ssh root@95.216.199.47 "docker exec ai-project-architect-app-1 printenv OPENAI_API_KEY" > .oaikey
ssh root@95.216.199.47 'docker exec -w /app -e PYTHONPATH=/app ai-project-architect-app-1 \
  python3 -c "from execution.products.ops import tokens; tok,_=tokens.get_user_token(\"ali@colaberry.com\"); print(tok)"' > .bctok

# 1. generate (real 6-stage pipeline; ~10 min; run in background for parallel projects)
PYTHONPATH="C:/Users/ali_m/OneDrive/Business/Colaberry Novedea/AI Projects/AI Project Architect & Build Companion" \
  python gen_story_plan.py ../story_configs/<slug>.json

# 2. publish (gates first; identity-guards Ali; refuses to publish unless all 4 gates pass)
node publish_story_build.js ../story_configs/<slug>.json

# 3. wipe secrets
rm -f .oaikey .bctok
```

Run several projects in parallel by kicking off step 1 for each config in the background,
then publishing each as its plan lands.

## The 4 gates (publish is BLOCKED unless all pass)

1. **no-code = 0** - no Bubble/Retool/Zapier/Airtable/minimal-code mentions anywhere.
2. **shape** - >= 12 stories AND >= 3 releases.
3. **trace.ok = true** - every `must` covered, every story cites a real REQ, no thin/orphan.
4. **real code** - strong React/Node/PostgreSQL/Docker signal (> 10 hits).

If a gate fails (usually an occasional under-generation), just re-run step 1; do not
hand-fix the plan. The pipeline's guards (drop-untraceable, deterministic release-split,
>= 12 floor) make failures rare.

## Assignment model

- **builder_id** - owns every build task (🤖 and 🧑 alike).
- **approver_id + approver_mode**:
  - `per-release` -> one approval gate per release (e.g. Ram on IPOS: 11 milestones).
  - `phase-gates` -> 4 consolidated gates across the window (e.g. Ali on Social Pilot).
- **marketing_co_assignee_id** (optional) -> co-assigned on marketing/social/prompt/content tasks (e.g. Sohail on Social Pilot).

## Rails (non-negotiable)

- **Claude Code assumed** end to end. If a story ever says "use Airtable/Zapier/Bubble", the generator is misconfigured, not the plan.
- **Secrets from prod at runtime only.** `.oaikey` (advisor OPENAI_API_KEY) and `.bctok` (Ali BC token) are pulled from the prod container, never stored or committed, and wiped after the run. BC token rotates every 2 weeks.
- **Identity guard.** The publisher fetches `/my/profile.json` and refuses to write unless the token is Ali (17454835). A degraded token halts instead of writing as someone else.
- **No em-dashes** anywhere in generated content.
- **Idempotency.** Re-running the publisher creates a NEW list; it does not de-dupe an existing one. To re-publish cleanly, trash the prior list first.

## Known Basecamp targets

| Project | bucket | todoset | vault |
|---|---|---|---|
| Internship (AI Systems Architect Accelerator) | 24865175 | 4327600402 | 4327600403 |
| Gov Contracts | 47346103 | 9908475794 | 9908475797 |

People seen so far: Anvi 52639032, Meghana 52489233, Sohail 47335940, Ram 17346350, Ali 17454835.
For anyone else, scan `GET /people.json` (paginate; ~1800 people, ~60 pages).

## Files in this skill

- `scripts/gen_story_plan.py` - config-driven generator (runs the real pipeline).
- `scripts/publish_story_build.js` - generalized, gated, identity-guarded publisher (builder + approver-mode + optional marketing co + create-or-existing target).
- `story_configs/EXAMPLE.json` - fully annotated config template. Copy per project.
- `MYDAY_SYNC.md` - the companion prompt to run in the AI Project Architect repo so a project created on My Day follows this exact process end to end.
