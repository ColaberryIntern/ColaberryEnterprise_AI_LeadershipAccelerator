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

## What is in this folder

| Path | What |
|---|---|
| `<date>-<slug>/blueprint.md` | The blueprint, readable top to bottom (rendered from the JSON) |
| `<date>-<slug>/blueprint.json` | The same content as structured data, validated against `references/blueprint.schema.json` |
| `<date>-<slug>/sources.md` | Every URL fetched while planning, with access date |
| `history.json` | One entry per blueprint. Drives "not yet covered" in topic scoring and the callback to last week |
| `.work/` | Stage scratch files (git-ignored) |

## history.json

- `schedule` sets the default air date: the next `weekday` with no blueprint yet. **It is an
  assumption (Thursday) until Ali confirms the real slot. Change it here.**
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
