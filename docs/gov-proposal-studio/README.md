# Gov Proposal Studio: handoff package

For: `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`

This package turns the gov Build Cockpit's Proposal tab into an AI-driven **Proposal Studio**. Its starting point is where active pursuits are today: planning and the pilot build are done, and the proposal documents are next. The agent drafts each required document from a per-contract **blueprint** (built from the stored solicitation ZIP). It pulls **screenshots from the verified build** in as proof, saves **every version**, scores each version against **six checks** mapped to the Shipley color teams, and revises until the document reaches **95%** or needs a human answer. People approve every gate. The output is a submittable package.

## How to use

1. Unzip into the repo at `docs/gov-proposal-studio/`.
2. In Claude Code, from the repo root:
   `Read docs/gov-proposal-studio/PROMPT.md and start with phase P0.`

## Contents

| File | What it is |
|---|---|
| `PROMPT.md` | **The build instructions.** Current-state findings, target design, non-negotiables, and 7 phased PRs (P0–P6) with acceptance criteria. |
| `FLOW.md` | The target flow, step by step: what each stage does, who acts, and which gate applies. |
| `GAP_REPORT.md` | What exists today, with file paths: keep / adjust / build. Read this before P0. |
| `RESEARCH.md` | How other proposal platforms and Texas RFPs do it, with sources. Explains why the design looks the way it does. |
| `designs/proposal-studio.html` | **The approved clickable demo.** Open it in a browser; no server needed. Every view and button works on sample data. |

The demo uses illustrative TDCJ-OIG sample data. Quotes, page limits, weights and scores in it are examples, not facts about any real solicitation.

## Relationship to earlier packages

- `docs/gov-pursuit-redesign/` (P0–P7, shipped) built the pursuit flow: Snapshot → Solicitation → Fit → Decide → Build the bid → Submit → Outcome. Its rails still hold, and this package keeps them all.
- The cockpit v2 work (commit-matched board, named proposal documents, deterministic copilot) is the base this package extends. Nothing here replaces the Build half of the cockpit.
