# Demo visual rules

**What this governs.** How a Connected Demo decides what to DRAW. The engine renders a generated
`demo-spec.json` for projects in domains nobody has seen, so every decision here is made from the
shape of the data: field types, reference structure, enum variation, timestamps and event
causality. Nothing in the engine may read a domain word.

**Where the decision lives.** `backend/src/services/sbp/demoVisual/visualPlan.ts`, as a pure
function returning a plan. The engine draws that plan and makes no choices of its own. Keeping the
two apart is what lets the rules be tested against many specs without a browser, and what stops a
layout change quietly changing which chart appears.

**Status.** Phases 1 and 2 are done: the rules exist, are tested, and the engine draws them. The
rules are written once, in TypeScript, and inlined into the engine at generate time by
`scripts/lib/inlineVisualRules.js`, because the engine also runs in a browser and in a student's
repository where there is no server. `visualRulesInline.test.ts` evaluates the inlined copy and
requires it to produce identical plans to the TypeScript for every fixture, so the two cannot
drift. Phase 3 changes the scaffold and the platform-build brief so new specs reliably carry what
these rules need.

**Screenshots** of every fixture in each theme and width:
`docs/screenshots/2026-11-28-visual-demo-engine/`.

---

## The one principle

> A picture drawn from too little data says less than the table it replaced, while implying more.

Every threshold below is the point beneath which that is true, so beneath it the table stays. Every
cap is the point beyond which the picture stops being readable, so beyond it the engine shows the
items most needing attention and keeps the rest reachable through the table.

---

## Thresholds and caps

These are the names in the code. `visualRules.ts` holds them and
`visualPlan.rules.test.ts` fails if a number here stops matching the constant beside it, so this
table cannot drift into a description of what the engine used to do.

| Constant | Value | What it governs |
|---|---|---|
| `MIN_TIMELINE_LANES` | 2 | Work items before a timeline beats a table. One lane is a date. |
| `MIN_TIMELINE_EVENTS` | 4 | Timed events before a timeline built from events is worth drawing. |
| `MIN_BAR_ROWS` | 3 | Rows sharing a number before bars beat reading the numbers. |
| `MIN_FUNNEL_STAGES` | 2 | Stages before a funnel is a funnel rather than two numbers. |
| `MIN_TIER_SEGMENTS` | 2 | Distinct autonomy tiers before a stacked tier bar carries information. |
| `MIN_PATH_STEPS` | 2 | Causally linked events before a path of steps beats a sentence. |
| `MAX_HEADLINE_TILES` | 6 | Tiles on a home screen. Nobody reads the seventh. |
| `MAX_TIMELINE_LANES` | 8 | Lanes drawn; the rest stay reachable through the table. |
| `MAX_BAR_ROWS` | 12 | Bars in one comparison. |
| `MAX_FUNNEL_STAGES` | 8 | Stages in one funnel. |
| `QUOTE_BLOCK_MIN_CHARS` | 120 | Length at which a text VALUE is quoted rather than put in a cell. |

These are starting values. Tuning one is a single edit, with its test and this line attached.

---

## The visual vocabulary

These are the only pictures the engine can draw. A new one is a change to `VISUAL_KINDS` first,
which is what keeps this list complete rather than indicative.

| Kind | In words |
|---|---|
| `timeline` | One lane per work item, a now line, event marks, dashed windows for what is still open |
| `target_bar` | A value against the target or limit the spec states for it |
| `status_pills` | The spec's own enum labels and tones, counted for the headline tiles |
| `funnel` | Child rows narrowing through stages, in the order the counts narrow |
| `step_path` | A causal chain of events, with the time between steps |
| `comparison_bars` | One number compared across rows, with a limit line when one is stated |
| `matrix` | An entity joining two others, drawn rows by columns |
| `decision_cards` | What is waiting on a person, merged into one filterable view |
| `actor_summary` | Who did what: roster, counts, and actions by autonomy tier |
| `quote_block` | Long text, quoted and never charted |

---

## Detection rules

| If the spec has | Draw | Decided from |
|---|---|---|
| A primary work entity whose rows carry two or more time values | A timeline, one lane per work item | `date`, `time` or `datetime` fields with values |
| Otherwise, enough events grouped by `work_id` | A timeline, one lane per work item | `MIN_TIMELINE_EVENTS` and `MIN_TIMELINE_LANES` |
| A `meter` field, or a number with `max`, `warn` or a target | A bar against its target, value and target printed together | field type and a stated ceiling |
| An enum field | Status pills with the spec's own labels and tones, counted for the tiles | `type: enum` |
| Child rows referencing a work item, with a status whose counts narrow | A funnel, stages in narrowing order | a `ref` to the work entity plus an enum |
| Events linked by `parent_event_id` within one `work_id` | A horizontal path of steps | event causality |
| One number shared by enough rows of an entity | Horizontal bars, labeled with the value | `MIN_BAR_ROWS` |
| An entity joining two others and carrying a number | A matrix, rows by columns | two `ref` fields plus a number |
| Rows matching an action's `when` | Decision cards, merged into one filterable view | entity `actions[].when` |
| Events with actors | A who-does-what view: roster, counts, tier bar | `events[].actor` |
| A text VALUE at or over the quote length | A quoted block | the value, not the field name |
| A `private` field | Its `shown_as` text only | `type: private` |

**The primary work entity is scored, never guessed.** An entity earns a point for every event whose
`work_id` matches one of its row ids, and for every other entity that points at it through a `ref`.
That is the structural definition of "the thing the work is about" and it holds in any domain. When
nothing points anywhere the answer is null, and the timeline falls back.

---

## Guards

1. **Never invent data.** Every mark, number and label traces to a value in the spec or to
   arithmetic on spec values. No estimated or decorative values.
2. **Fall back, never blank.** Below a minimum the block renders as the table, list or fact set it
   would have replaced. Every refusal carries its cause and its fallback in the plan.
3. **Cap, and say so.** A trimmed block reports how many of how many it is showing, and the full
   set stays reachable.
4. **Never show an empty state the data contradicts.** The roster is built from `events`, not from
   a `plan.agents` list the scaffold may have left empty. This guard exists because the old engine
   printed "the plan names no agents" on a screen whose own activity log named twelve.
5. **All wording comes from the spec.** Labels, titles and enum labels. No hard-coded domain words.
6. **Same spec in, same page out.** No randomness and no clock read: "now" is the latest event time
   in the spec. A demo that renders differently on two loads cannot be reviewed.
7. **`private` is never visualized, counted or revealed**, even when a spec wrongly puts a value in
   one. The contract says those rows hold no value; the renderer does not rely on that being true.

---

## Screen composition

Every screen reads as an analysis, summary before detail.

1. **Home.** Headline and subtitle from the spec; status tiles, counts first, then up to two
   measured against a target; the primary picture (the timeline, when earned); what needs a person
   beside the funnel; the activity feed last.
2. **List.** Keep the table, replace numeric and meter cells with inline bars, then one path of
   steps per work item when it qualifies.
3. **Record detail.** Facts, the path so far, decisions on this record, the comparison of its child
   rows beside its funnel and the messages sent, then its event trace.
4. **Activity.** The feed, filterable by work item and by who acted. Each entry shows actor, tier,
   risk above low, held or failed state and side effects.
5. **Who does what.** Roster with action counts, held and failed counts, a stacked bar of actions by
   autonomy tier, decisions made by people, connections used and requirement ids cited.

Each visual carries a title naming what it shows and, where useful, one sentence of takeaway
computed from the data.

---

## Chart and design rules (phase 2 obeys these)

- One axis per chart. Never two y-scales.
- A number is never shown alone when the spec gives it a reference.
- Status colors are reserved for state and always come with an icon and a label. Series colors are
  separate. Text uses text colors.
- Direct value labels on bars; a legend whenever more than one encoding is used; hover and
  keyboard-focus tooltips; the table view of the same data stays reachable.
- Colors are CSS variables with a light and a dark set, both legible.
- Works at 380px: charts scroll inside their own container and the page never scrolls sideways.
- `prefers-reduced-motion` respected. Everything visible at load; nothing waits for a scroll.
- The DEMO banner and the "simulated" labels stay exactly as they are.

## Engine constraints that do not change

- One self-contained HTML file, inline CSS and JavaScript, no libraries, charts drawn as inline
  SVG. It is served under a nonce CSP inside a sandbox.
- `demoKitAssets/` is the source of truth; regenerate with `scripts/generateDemoKitAssets.js` so
  the drift test passes.
- Existing stored specs must render without change. Inference from shape is the default, and any
  new spec field is additive and optional.
