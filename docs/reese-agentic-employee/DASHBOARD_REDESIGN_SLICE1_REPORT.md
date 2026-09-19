# Dashboard redesign, Slice 1 — report

For Ali. Covers Slice 1 of the Agent Detail dashboard redesign, built from `preview (3).html`.
Shipped as PR #2725, merged and deployed to production, independently verified.

## What changed, one concrete example

Open any agent's Detail page (tried live on Reese and on Dara). The tab bar now has 6 tabs
instead of 8 — Reports, Performance, and Trust & Control are gone as separate tabs, replaced by
one "Performance & Settings" tab with 3 sub-tabs: Results & reports, Tools & channels, Authority
& controls. Click "Tools & channels" and you see the exact same Capabilities section that used
to live on Overview — same 4 tools, same color coding, same "last used" times — just moved to
where your mockup put it. Overview itself is shorter now; that section is gone from there.

## What you can see or control, and where to click

- **Performance & Settings** (new top-level tab): 3 sub-tabs, each showing real, unchanged
  content from the tabs it replaced.
- **At a Glance**: the Reports/Performance/Trust & Control tiles still show the same real
  numbers; clicking any of them now takes you to Performance & Settings instead of 3 different
  old tabs.
- **Overview**: unchanged except Capabilities is no longer there — it lives under Performance &
  Settings → Tools & channels now.

## What was verified, and in which environment

- Frontend test suite: 144/144 passing (the page's own tests, plus the 4 relocated components'
  own standalone suites), `tsc --noEmit` clean.
- **Production**: independently verified by a `loop-production-verifier` pass, PASS. Real
  click-through on the live site with screenshots — confirmed on both Reese's page and a second,
  unrelated agent's page (Dara), proving this works generically, not just for Reese. Full detail
  in this run's `deployment-log.md`.

## What's still missing or disabled

This is Slice 1 only — a reorganization, not the whole mockup. Not yet built:
- Overview's hero briefing sentence, the mockup's 4-tile KPI shape, a standalone "Needs Ali"
  card, and the "Work, explained" timeline.
- Talk's quick-prompt buttons and the shared-context sidebar.
- Splitting Work & Decisions into two separate tabs with a case list and a 4-panel decision
  inspector.

Three of those depend on real answers this session didn't invent:
1. What counts as an "owned case" for the KPI tiles and the Work tab's case list — Tickets,
   `ProposedAgentAction` proposals, or both?
2. What should feed "Needs Ali" — just `ProposedAgentAction` (real, actionable today), or should
   `ApprovalRequest` rows show too with an honest "not yet enforced" label (it's shadow-mode
   only, never blocks anything today)?
3. The case-status filter taxonomy (Waiting on Ali/staff/student, Overdue, Ready to verify) has
   no real backing field — worth deriving from what exists, or is a new column worth the schema
   change?

## One consolidated decision request

Answer the 3 questions above (a recommendation from me, if useful: start with #2 — since
`ApprovalRequest` is genuinely non-functional today, I'd default "Needs Ali" to
`ProposedAgentAction` only and disclose the rest rather than show something that looks
actionable but isn't) and I'll scope Slice 2 — Overview's real content and the Work/Decisions
split — as its own plan for your review before any code ships.
