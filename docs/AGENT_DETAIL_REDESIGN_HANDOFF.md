# Handoff — Agent Detail (Reese) dashboard → match `preview (3).html`

For a fresh Claude Code tab. This tab is running the AI Project Factory; this packet lets another tab run the Agent Detail redesign without thrashing either. Design file: `C:\Users\ali_m\Downloads\preview (3).html`. Target page: `AgentDetailPage` at `/admin/agents/:id`, built from `frontend/src/components/admin/agentDetailV2/*` + `AgentPerformanceSettingsTab.tsx`.

## How to use this
Start on a **clean branch off origin/main** (`workstream/agent-detail-redesign`), not on the factory branch. This is a slice-gated redesign already in flight (Slices 1/2b/2c merged) — continue that incremental cadence; do NOT big-bang rewrite without confirming scope with Ali, and update the existing tests as you go.

## Design tokens (adopt SCOPED to `.adv2-page`, never `:root`)
Brand primary is cherry-red (`--red-500 #FB2832`); the preview is pine-teal, which clashes at `:root`. The page already scopes its own tokens on `.adv2-page` (`frontend/src/styles/agentDetailV2.css:22-50`, its `--adv2-trust #0E6B69` is already near the preview green). Extend those scoped vars; leave the brand ramps alone.

| Token | Value |
|---|---|
| `--bg` `#f4f6f5` · `--paper` `#fff` · `--ink` `#19302c` · `--muted` `#6d7e78` · `--line` `#dfe7e3` | surfaces/text |
| `--green` `#087e68` (primary) · `--soft` `#e8f5ef` · `--gold` `#a96c1d` · `--amber` `#fff5df` | accents |
| `--nav` `#102e29` (dark sidebar) · `--shadow` `0 8px 24px #17352c06` | chrome |
| font `Inter` · base 14px/1.5 · radii: cards 13px, hero 14px, pills 5px, buttons 8px | type/shape |
| **Dark mode** (`body.dark`): `--bg#10221d --paper#18312a --ink#e0eee7 --line#2e493e --green#63d7ad --soft#25483c --nav#0b1915` | toggle, no persistence |

## Layout the preview wants
Fixed **210px dark left sidebar** (brand `refactored.ai`, employee mini-profile "Reese / Student success", 5-item nav, manager footer "Ali Muwwakkil / Reese's manager") + **70px topbar** (breadcrumb "Workforce / AI employees / Reese", demo chip, dark-mode + reset) + centered content `max-width:1570px`. **Current** page is a light horizontal top-tab shell with no sidebar and no dark mode — this nav-model swap is the biggest change (`AgentDetailV2Header.tsx`, `AgentDetailPage.tsx`, `agentDetailV2.css`).

## Section-by-section gaps (design → current file → gap)
- **Shell**: `AgentDetailV2Header.tsx:137-289` / `AgentDetailPage.tsx:296-344` — no left sidebar, no mini-profiles, no demo chip, no dark toggle; breadcrumb + max-width differ.
- **Overview hero + "next commitment" rail**: `AgentOverviewV2Hero.tsx:45-77` — real hero sentence + 4 tiles exist, but plain Bootstrap not the green-gradient hero; **no commitment rail**; tiles are ticket-centric vs the preview's case-centric.
- **"Needs Ali" card**: `AgentOverviewV2NeedsAli.tsx:21-58` — real ProposedAgentAction list exists; needs the richer single-recommendation layout (Approval-required pill, "Why this action?" evidence, Review/See-evidence).
- **Employee facts**: `AgentOverviewV2Sidebar.tsx:247-344` — real facts exist in the right sidebar; relocate to a 3-col Overview grid.
- **"Work explained" timeline**: **missing** on Overview — build from `agentExplainabilityApi` events (`AgentOverviewV2MainColumn.tsx`).
- **Talk**: `AgentTalkTab.tsx:126-217` — real chat + directives; needs the 2-col `.talklayout` + a "Shared working context" panel + quick-prompt chips.
- **Work**: `AgentWorkTab.tsx:62-137` — flat list; needs master-detail `.worklayout` + a 5-step progress bar + goal/evidence/receipts.
- **Decisions**: `AgentWorkDecisionsTab.tsx:118-279` — the real inspector data exists (blastRadius/reversibility/expectedResult); render it as the 2×2 quadrant inspector + a per-decision selector + an "Ask Reese / Correct a fact" rail.
- **Performance & settings**: `AgentPerformanceSettingsTab.tsx:28-77` — **already structurally aligned** (same 3 sub-tab labels); only card-level restyling.

## Preserve real data; do NOT recreate the fiction
Keep everything `getAgentDetail(id)` / `getManagerInboxItems` / the talk/decisions/directive APIs feed (`frontend/src/services/agentDetailApi.ts:230-263`, `employee_facts`, tickets, capabilities, authorization_summary, trust_contract, reports_to). The preview's named cases (Jordan/Maya/Elena/Sam), the Owned/Waiting/Verified case buckets, the 5-step Assess→Complete, "Current objective / Decision freedom / Active channels", and the % bars are **fictional sample data** (the file says so). The codebase already flags some as unbacked (`AgentOverviewV2Hero.tsx:13-19`, `AgentWorkTab.tsx:10-16`). Adopt the **visual design**, keep the honesty guardrails — don't invent backing data.

## Collision + tests (HIGH overlap)
`AgentOverviewV2Hero.tsx` / `AgentOverviewV2NeedsAli.tsx` were created in Slice 2b; the decision inspector in Slice 2c. Tests that will break and must be updated: `agentDetailV2/__tests__/AgentOverviewV2Hero.test.tsx`, `AgentOverviewV2NeedsAli.test.tsx`, and page-level `pages/admin/__tests__/AgentDetailPage.smoke.test.tsx` (~1000 lines), `.overview.test.tsx`, `.commandCenter.test.tsx`. `agentDetailV2.css` is shared by all 8 adv2 components — stage token changes as additive scoped vars. `AgentDetailPage.tsx:128-145` records the hero/KPI/timeline/Work/Decisions split as deliberately-deferred, honesty-gated scope — confirm with Ali before the big sidebar/nav rewrite.

## Suggested slice order
1. Token layer (scoped `.adv2-page` green/nav/dark-mode vars) + the dark-mode toggle — low risk, visible.
2. Overview: green-gradient hero + next-commitment rail; relocate employee-facts to a 3-col grid.
3. Decisions: the 2×2 quadrant inspector (data already exists) + selector.
4. Shell: the left-sidebar nav model (biggest change — confirm scope first; update the smoke tests).
5. Work master-detail + Talk two-column, only where real backing exists.
