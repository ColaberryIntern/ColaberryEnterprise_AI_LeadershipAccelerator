# Claude Code prompt: make every generated demo visual-first

Paste everything below the line into a Claude Code session opened on
`ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`. First copy this whole folder into
the repo at `docs/reference/visual-demo-engine-pack/` so the paths in the prompt resolve.

---

## Mission

The Connected Demo engine renders any project's `demo-spec.json` as a working sample app. Today it
renders almost everything as text: count tiles, tables, fact lists and a text feed. People read
pictures faster than text, so the same spec must produce a visual, analytical app: the reader sees
the state of the work, where time or effort went, what needs a person, and the evidence, in that
order.

Change the engine so it does this for every project, from the data it already receives. A
hand-built example of the target exists for one project (ShiftFill, hygienist shift coverage). It
is a reference for quality and layout, not a template. Nothing you build may depend on ShiftFill's
domain, entity names, field names or wording. The platform generates thousands of projects in
unrelated domains; the rules must hold for all of them.

## Read first, before changing anything

- `backend/src/services/sbp/demoKitAssets/index.html` (the engine)
- `backend/src/services/sbp/demoKitAssets/DEMO_SPEC_CONTRACT.md` and `backend/src/services/sbp/demoSpec/contract.ts`
- `backend/src/services/sbp/demoKitAssets/scaffold-demo-spec.mjs`
- `backend/src/services/sbp/demoKit.ts`, `demoRender.ts`, `scripts/generateDemoKitAssets.js`
- `backend/src/services/sbp/platformBuild/prompts.ts` (the brief that has an agent write the spec)
- The demo tests in `backend/src/services/sbp/__tests__/` (drift, phone, trust, CSP nonce, contract)
- `docs/reference/visual-demo-engine-pack/BEFORE_AFTER.md`: six before and after pairs, each naming the rule that
  produced the change. Open every image in `before/` and `after/`.
- `docs/reference/visual-demo-engine-pack/reference/shiftfill-coverage-console.html`: the hand-built target.
  Open it in a browser and read its source; compare each view with what the current engine shows for the same data
- The repo's CLAUDE.md files and directives. Follow the ticket, branch and review process they set.

Then write a short plan and stop for my approval before implementing.

## The core idea: the data's shape picks the visual

The engine must decide what to draw by inspecting the spec (field types, refs, enums, timestamps,
events), never by knowing the domain. Implement the rules below as one pure function,
`visualPlan(spec)`, that returns which visuals each screen gets. The renderer draws that plan.
Keep the function free of DOM access so it can be unit-tested against many specs.

### Detection rules

| If the spec has | Draw | Notes |
|---|---|---|
| A primary work entity (the one most events and other entities reference) whose rows have two or more time values, or events grouped by `work_id` | A timeline with one lane per work item | Bar from first to last time, a "now" line at the latest event time, marks for events. Merge marks that would overlap into one mark with a count. Show deadlines and windows that end after "now" as dashed. |
| A `meter` field, or a number with a stated `max`, `warn` or target | A bar against its target | Print value and target together ("29 / 30 min"). Show over-target in shape as well as color. |
| An enum status field | A status pill with an icon and the spec's own label and tone | Count rows by status for the headline tiles. |
| Child rows that reference a work item and carry a status showing progress (offered, replied, accepted) | A funnel per work item | Stages come from the data in order of narrowing counts. One sentence under it stating the outcome, built from the rows. |
| Events linked by `parent_event_id` within one `work_id` | A horizontal path of steps | Done, current, pending and failed states. Show minutes (or the natural unit) between steps. Pending steps come only from states the spec defines; never invent future steps. |
| One numeric field shared by many rows of an entity (hours, amount, score) | Horizontal bars, one per row, labeled with the value | Draw a limit line when a related rule or field states one. When a child row adds to a base value, stack base and addition as two segments. |
| An entity that joins two others and carries a number | A matrix table (rows by columns) | Blank cells shown as a dash. |
| Rows that match an action's `when` condition | A decision card | Title, why it needs a person, the facts, the exact content under review in a quoted block, primary and secondary buttons. Merge all pending queues into one filterable "Decisions" view; keep per-kind filters. |
| `events` with actors | A "who does what" view | Roster of actors with action counts, held and failed counts, a single stacked bar of actions by autonomy tier, the list of decisions made by people, connections used, and requirement ids cited. |
| Long text fields (message bodies, notes) | A quoted block | Never chart text. |
| `private` fields | The `shown_as` text only | Never visualize, count or reveal them. |

### Fallbacks and guards (these matter most at scale)

1. Never invent data. Every mark, number and label must trace to a value in the spec or to
   arithmetic on spec values (counts, differences, sums). No estimated or decorative values.
2. If the data a visual needs is missing or too thin, fall back to the current table or list for
   that block. Minimums: timeline needs 2 work items or 4 timed events; bars need 3 rows; funnel
   needs 2 stages with different counts; tier bar needs 2 tiers.
3. Cap what is drawn: at most 6 headline tiles, 8 timeline lanes, 12 bar rows, 8 funnel stages.
   Beyond a cap, show the top items by attention needed and a "Show all" link to the table view.
4. Never show an empty state that the data contradicts. If `events` name agents, the roster screen
   must list them even when the plan's own roster or rules section is empty.
5. All wording comes from the spec's labels, titles and enum labels. No hard-coded domain words.
6. Same spec in, same page out. No randomness, no dependence on the wall clock: "now" is the
   latest event time in the spec.

## Screen composition

Order every screen as an analysis, top to bottom:

1. **Home:** headline and subtitle from the spec; status tiles (counts first, then up to two
   measured-against-target tiles); the primary picture (the timeline, when it qualifies); "needs
   your decision" beside the funnel or progress view; latest activity last.
2. **List screens:** keep the table, replace numeric and meter cells with inline bars, then one
   path-of-steps card per work item when rule 5 applies.
3. **Record detail:** facts, path so far, decisions on this record, the comparison chart for its
   child rows beside its funnel and the messages sent, then its event trace.
4. **Activity:** the feed, filterable by work item and by who acted (agents, people, held for a
   person). Each entry shows actor, tier, risk above low, held or failed state, side effects.
5. **Who does what and rules:** as in rule 9.

Summary before detail on every screen. Each visual gets a title that names what it shows and, where
useful, one plain sentence stating the takeaway computed from the data.

## Chart and design rules

- One axis per chart. Never two y-scales.
- A number is never shown alone when the spec gives it a reference (target, limit, total).
- Status colors (good, warning, critical) are reserved for state and always come with an icon and
  a label. Series colors are separate from status colors. Text uses text colors, not series colors.
- Every chart has a legend when it uses more than one encoding, direct value labels on bars, and a
  hover and keyboard-focus tooltip on each mark. The table view of the same data stays reachable.
- Thin marks, 2px gap between adjacent segments, recessive grid lines.
- Define all colors as CSS variables with a light and a dark set; both themes must be legible.
- Works at 380px wide: charts scroll inside their own container, the page never scrolls sideways.
- Respect `prefers-reduced-motion`. Everything is visible at load; nothing waits for a scroll.
- Keep the DEMO banner and the "simulated" labels exactly as they are. Actions keep working: they
  update state, counts, charts and the log together, and Reset restores the starting state.

## Engine constraints you must keep

- The engine stays one self-contained HTML file with inline CSS and JavaScript and no libraries.
  Draw charts with inline SVG and HTML. It is served under a nonce CSP in a sandbox; keep
  `demoCspNonce`, `demoEnginePhone` and `demoEngineTrust` tests passing.
- `demoKitAssets/` files are the source of truth. After editing them run
  `scripts/generateDemoKitAssets.js` so `demoKit.drift.test.ts` passes.
- Existing stored specs must render without change. Inference from data shape is the default.
  Any new spec field (for example an optional `visual` hint on a screen or a `target` on a field)
  is additive and optional; document it in `DEMO_SPEC_CONTRACT.md` and validate it in
  `demoSpec/contract.ts`.
- Do not edit the Dockerfile, nginx, or anything the repo's execution contract marks as escalate.

## Feed the visuals upstream

Visuals are only as good as the spec. Update `scaffold-demo-spec.mjs` and the spec-writing brief in
`platformBuild/prompts.ts` so new specs reliably carry what the rules need: timestamps on work
items and events, `parent_event_id` chains, `work_id` on every event, targets or limits on measured
fields, ordered status enums with tones, and actor and tier on every event. Add these as "rules the
sample must keep" in the contract. Do not make them required for old specs.

## Deliverables

1. `directives/demo-visual-rules.md`: the rules above as the standing reference, with the
   thresholds and caps as named constants that match the code.
2. `visualPlan(spec)` with unit tests.
3. The updated engine, regenerated assets, updated contract, scaffold and brief.
4. Fixture specs from at least four unrelated domains (for example shift coverage, a sales
   pipeline, a maintenance work-order queue, a document review flow), including one thin spec that
   must fall back to tables everywhere, and one large spec that exceeds every cap.
5. A screenshot of each fixture's home and one detail screen, light and dark, phone and desktop,
   attached to the PR.

## Acceptance checks

- For every fixture: no console errors, no clipped or overlapping labels, no sideways page scroll
  at 380px.
- The ShiftFill fixture matches the reference in structure: tiles, timeline, decisions beside
  funnels, path of steps, candidate bars with a limit line, roster with tier bar.
- A grep of the engine finds no ShiftFill, dental, hygienist or other domain term.
- The thin fixture renders as it does today. The large fixture respects every cap.
- Every number on every screen can be traced to the spec; spot-check ten per fixture and list them
  in the PR.
- Approving or declining in a decision card changes the tiles, the charts and the log in one step.
- All existing demo tests pass, plus the new ones.

Work on a branch and open a PR. Do not deploy. If a rule cannot be met without breaking a
constraint above, stop and tell me which rule and why instead of working around it.
