# Admissions & Academic Ops Command Center: build pack

Everything needed to start building Taiwo's Ops Command Center into Colaberry Enterprise Admin
(`ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`).

Prepared Friday, November 27, 2026 (Central).

## What is in here

| Path | What it is |
|---|---|
| `CLAUDE_CODE_PROMPT.md` | The prompt to paste into Claude Code to start the build. |
| `docs/SPEC.md` | The product spec: navigation, all 16 screens, routes, data, phases, acceptance checks. |
| `docs/AGENT_CONTROL_SURFACE.md` | How the built-in agent (AURA) sees, navigates and operates the workspace, and how Taiwo's agent plugs in. |
| `demo/` | The clickable HTML demo. 16 screens, one navigation bar, no server and no build step. |
| the blueprint (kept in Basecamp) | Taiwo's original requirements document. |

## Look at the demo first

1. Unzip the folder.
2. Open `demo/index.html` in Chrome or Edge. Double-click is enough.
3. Click through. The bar across the top of the page reaches every section. The dark AURA bar under it is the built-in agent.

Things that work in the demo:

- The section bar and every cross-link between screens.
- The seven filters over the Today queue.
- The three example questions in the Ask AURA card on Today.
- Source filters and "Approve and send" on Student 360.
- Approve and Hold on each of the ten items in Approvals.
- Request areas, the follow-up box and the three agent modes on Ask AURA.

Things that are drawn but do nothing yet: filter chips on Students, "New message", "Add a policy", "Add a connection" and the AURA bar's text box.

The demo needs an internet connection only for the Roboto font. Offline it falls back to the system font.

## Start the build

1. Copy this whole folder into the repo at `docs/admissions-ops/`.
2. Open Claude Code at the repo root.
3. Paste the contents of `CLAUDE_CODE_PROMPT.md`.
4. Claude Code will read the spec and the demo, check the repo, and come back with a Phase 0 plan and a short list of questions before it writes code.

## Read this before trusting any number

- Every count in the demo is invented, including the opportunity and TFC audit counts, with one exception: "3 students active in IPBC on cancelled contracts" is kept because the three invented students are named around it, and a 3 alone identifies nothing. The real snapshot counts are in Taiwo's blueprint, which is kept in Basecamp (Admissions & Ops Command Center > 01 - Build kit) and not committed: this repository is public.
- Every student name, every other count, every date, the 34 days, the 8% conversion rate, alert thresholds and sync times are invented samples.
- Integration methods (API, export, shared database) are assumptions. Nobody has verified that GHL, Zendesk, TFC, PaySimple, Retool, Gmail or Sheets can be reached the way the demo implies.
- Policy effective dates show as `[DATE]` on purpose.
- "AURA" is the agent name Taiwo proposed in her blueprint. It is not final.

## Decisions waiting on Ali

1. Which existing admin pages fold into the hub, and which are retired. The demo assumes Student Story, My Day, Leads, Pipeline, Opportunities, Funnel, Refunds, Communications, Placement and Reports are reached from inside the hub with their routes kept live. Leads and Pipeline are used by sales reps today, so check those first.
2. Whether the workspace gets its own access section (the spec recommends a new `admissions_ops` key) and who holds it.
3. What Taiwo's agent is built on, where it runs and how it authenticates. The control surface is designed so that answer can change without touching the screens.
4. The final agent name.
