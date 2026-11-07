# Proposal Studio v4 — ticket ladder

The v4 page-by-page fidelity round. Target `designs/proposal-studio-v4.html`; gate
`tests/studio-parity.cjs`; built on `workstream/proposal-studio-v3` (@ c9a622a9); one
consolidated PR (#3727). These are the loop-architect tasks, worked top to bottom.

> **Basecamp note (2026-11-06):** auto-creation into the Gov Contracts project (bucket
> `47346103`, todoset `9908475794`, assignee Ali `17454835`) was **blocked — the Basecamp
> OAuth token is expired at the source** (CCPP `Basecamp_AuthInfo` returns 401 "token
> expired (old age)"). It needs a human re-authorization at
> `https://launchpad.37signals.com/authorization/new`. Once re-auth'd, this ladder posts in
> one run via `scratchpad/bc-v4-prod.js`. (This likely also affects other BC automations in
> prod — flagged for follow-up.)

| # | Ticket | Due | Summary |
|---|---|---|---|
| V4-0 | Global shell (bar/rail/agent/tour) | +2d | Contract-bar one row of chips (Agency, Build %, `bar-ready`, `bar-needs` always-shown w/ `data-count`/`data-severity`, `bar-tour`). Rail: **For you → Needs you** (`rail-step-needs`) at top + `rail-needs-badge`; Done ✓. Agent header "Builds and judges. You supply what's missing.", `agent-state`, `agent-log` live line, `agent-needs` top 4 + See all, `agent-ask`. Report-a-problem off the agent panel. Non-blocking `tour-prompt`; spotlight `tour-ring`/`tour-card` (10 demo steps); per-view (i) `help`. |
| V4-1 | Where we are (overview) | +2d | `overview-build-hero` (purple, N not started, `btn-build-all`); `overview-now`; `overview-readiness` rows title·bar·stage·score (`overview-doc-<key>`, `data-stage`, "—" unscored); `overview-needs` top 3 + See all + empty states; "How it works" AI builds / AI judges / You supply. |
| V4-2 | Needs you | +2d | Rename view param → `needs` (keep `openitems` alias). Groups `needs-group-fatal`/`score`/`answered` (answered collapsed green). `need-card` two columns, `data-key`/`kind`/`blocking`/`done`; `need-quote`, `need-used` chips, `need-format`, `need-control` `data-control`; coloured left border. Real file drop (`data-control="file"`) via signed-form route. Deep link `?view=needs&need=<key>`. |
| V4-3 | Blueprint | +3d | `bp-reanalyze`, `bp-log` streaming + counts, `bp-weights` stacked bar, `bp-rules`, `bp-state-forms` jurisdiction tag, (i) `help`, "needs a decision" tag → the need. |
| V4-4 | Document set | +3d | `docs-library` + `btn-build-all` while anything not started. Columns Document(+mono file name)/Type/Stage/Needs/Pages/Reqs/Ver/Score; **drop Gate**. Not started → only `docs-build-it`; started → stage pill. `docs-needs` tag. Score "—" until first judge. `docs-row` `data-key`/`data-stage`. Pricing = needs file. |
| V4-5 | Build evidence | +3d | Per-card `ev-insert` picker (doc+section); remove global select. Captures-in-docs from real figure refs. `ev-decide` → decision need (deep link). `ev-demo-url` mono + Save. Portal artifact image route for intern thumbnails. `ev-capture` `data-story`/`data-verified`. |
| V4-6 | Draft & versions (editor) overhaul | +5d | Tabs `ed-tab` Paper/Outline/Preview PDF. `ed-run` "Re-judge & revise" (only built & <95) + Diff. `ed-doc-pick` w/ stage pills; unbuilt → Build it paper. `ed-running-header` one line. Normalize h2/h3 to paper scale. `ed-section` + `ed-reqref`; `ed-sec-edit`/`regen`/`figure`. `ed-needchip` (**never** raw `[PLACEHOLDER]`). `ed-margin-agent`/`human`. `ed-figure`. `ed-outline-row` drag → human version. `ed-pdf-page` real renderer. `ed-plan` read-only + Edit. `ed-checks`, `ed-versions`. |
| V4-7 | Review gates | +4d | `gates-gold-panel` at **top** (gold border) only when every doc passed AI gates; `gates-go`/`gates-nogo`; green Go-given band after. `gates-team-pink/red/glove/gold` demo copy + AI / AI ×3 / AI / You. `gates-matrix` score chips + bold Score + Gates column `gates-row-chips`, sticky first col, fits 1440. `gates-row` `data-key`. `gates-detail` row-click (Agent-will-fix vs Needs-you + judge evidence). Remove accordion. **No Approve buttons.** |
| V4-8 | Package & submit | +4d | `pkg-files` mono tree, `pkg-sealed` gold dashed admin-only, `pkg-checklist` incl. "Nothing open in Needs you" + "Gold Go given/waiting", `pkg-export` disabled until Go. Remove the raw `<input type=file>`. |
| V4-9 | Phone (400px) | +5d | No horizontal page scroll. Rail → horizontal scroller, Done hidden. Agent panel below the workspace. Tour → centered card. |
| V4-PARITY | `tests/studio-parity.cjs` | +2d | Author the parity harness: render each view with fixtures, assert every required `data-testid`, fail on any button named "Approve". The pass/fail gate. |
| V4-GATE | Final gate + consolidate the PR | +5d | Full tsc (both stacks via CI) + jest + parity harness + screenshots (1440/400, light/dark) per screenshot-review. Consolidate onto branch/PR #3727 (v3+v4 together). **Do not merge, do not deploy.** |
