# Gov Pursuit Workspace redesign — handoff package

For: ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator

1. Unzip into the repo at `docs/gov-pursuit-redesign/`.
2. In Claude Code, from the repo root: `Read docs/gov-pursuit-redesign/PROMPT.md and start with phase P0.`

Contents

- `FLOW.md` - **the flow AS SHIPPED (P0 to P7)**: the seven steps, each step's gate/rail, the admin + intern entry points, and the determinism / advisory-AI / pricing rails. Read this for what the code does; the `designs/` screens show the shape.
- `OPERATOR_GUIDE.md` - **a short runbook** for running one pursuit end to end (admin steps + what the intern sees + the guardrails you cannot override).
- `PROMPT.md` — the build instructions: problems found in the code, target flow, feature specs, non-negotiables, 7 phased PRs, open questions.
- `designs/screens/` — clickable HTML screens. Start at `Main.html`; footer buttons move between steps. No server needed.
- `designs/screenshots/` — full-page PNGs of every screen plus four interaction states.
- `designs/source/` — design-canvas source files (`.dc.html` + `canvas.json`) with the exact copy and state logic.
- `reference/current-ui/` — screenshots of today's workspace for comparison.

Bracketed values in the designs (`[approver]`, `[Intern name]`, `[Client A]`, `[x]%`) are placeholders for real data. The 74% on-time figure and Gantt dates are illustrative.
