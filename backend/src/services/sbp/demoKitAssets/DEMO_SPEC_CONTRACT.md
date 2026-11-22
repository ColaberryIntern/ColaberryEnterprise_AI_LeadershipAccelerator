# demo-spec.json: the contract

`demo/index.html` is an engine. It contains nothing about any project and draws whatever
`demo/demo-spec.json` describes. To change the demo, change the spec. Never edit the engine.

The scaffold (`scaffold-demo-spec.mjs`) writes a first spec from the plan and the data model.
The builder's agent refines it. This file says what each part means.

## Top level

| Key | What it is |
|---|---|
| `schema_version` | **`2`.** Not 1. The renderer validates against this contract and REFUSES any other value, so a spec at version 1 renders nothing and cannot be published. |
| `environment` | One of `demo`, `sandbox`, `simulation`. **`production` is not a permitted value**, which is the point: a simulated screen can never claim to be the real system. |
| `events` | **Required.** The trust-and-work timeline, one entry per action. See *Events* below. An empty array is valid and means "this build performs no actions yet"; omitting the key is not. |
| `source` | Where the demo came from: `project`, `plan_version`, `plan_sha256`, `generated_at` (all copied from `.colaberry/manifest.json`), `seed`, `inputs`, and `refined` (false from the scaffold; set true once a person or agent has shaped the scenario). The banner shows the plan version and hash, so a demo built from an old plan is visible as one. |
| `app` | `name`, `descriptor`, `accent` (one hex colour, the only brand lever), `persona` `{name, role}` (who the home screen is for), `clock` (the one moment the sample is set in), `command_center_href`, and `log` (which entity records activity, see Actions). |
| `nav` | Groups of `{screen, label, icon, badge?}`. `badge` is `{entity, where, tone?, suffix?}` and is a live count, never a typed number. Icons: `home calendar check grid people list doc shield flow`. |
| `screens` | The screens, by id. Ids are lower-case letters, digits and hyphens: they are the address after `#`. |
| `entities` | The sample data, by key. One per data-model table the demo shows. |
| `agents` | From `plan.agents`: `name`, `purpose`, `trigger`, `autonomy`, `stops_when`, `screen`. |
| `people` | `{role, decides[], screen?}`: the decisions the plan keeps for a person. |
| `guardrails` | From the plan's SAFE requirements: `id`, `statement`, and `shown_as`, one sentence naming where in the sample the guardrail visibly holds. |
| `systems` | From `plan.derived.systems`. Always drawn as simulated. |
| `coverage` | One row per story: `{story, title, screen, label}` or `{story, title, screen: null, note}`. |

## Events

The timeline is what makes this a TRUST demo rather than a product tour. Each entry is one
action, and every field exists because a viewer would otherwise have to take something on faith.

| Key | What it is |
|---|---|
| `event_id` | Unique within the spec. |
| `occurred_at` | ISO-8601. Derived from the plan's sync time, never from a clock read, so the same plan gives the same timeline. |
| `work_id` | The piece of work this action belongs to, so several actions on one item group together. The scaffold uses the story id. |
| `trace_id` | The thread through a whole chain of actions. |
| `parent_event_id` | The action that caused this one, or `null` for the first. This is the CAUSAL field: a timeline that cannot say what caused what is a list, not a trace. |
| `actor` | `{type, id, label, verified}`. `type` is `agent`, `human` or `system`: a structured identity, not a flat "who". `id` is stable, so two actions by the same agent are provably the same agent. **`verified` is `false` in every demo**, because a demo can verify no identity and must say so rather than implying a guarantee it does not have. |
| `human_owner_id` | The accountable person. Required **even when the actor is a human**, so accountability is never ambiguous. |
| `action` | What was done, in the product's words. |
| `status` | The full lifecycle: `proposed`, `queued`, `executing`, `succeeded`, `failed`, `canceled`, `reverted`. A timeline where everything succeeded teaches a viewer that the system always works, which is the one thing no system does, so the scaffold fails every third action and reverts every fifth. |
| `risk_level` | `low`, `medium`, `high`. |
| `autonomy_tier` | `A0` to `A4`, and it is attached to the ACTION, never to an agent as a personality trait. The same agent may act at different tiers. |
| `reason_summary` | Why, in one line. Narrative, and explicitly **not** audit truth on its own: that is what the two reference lists below are for. |
| `evidence_refs` | What the action was based on. |
| `policy_refs` | The stated rules it is answerable to. The scaffold uses the requirements the story fulfills, which come from the plan rather than from the tool. |
| `approval` | `{required, status, assigned_to}`, where status is `pending`, `granted`, `denied` or `not_required`. |
| `side_effects` | What changed outside the system. A failed action usually has none, and saying so is the claim. |
| `reversible` | Whether it can be undone. |
| `recovery_ref` | Where to undo it, or `null`. A `reverted` action without one is a dead end. |
| `environment` | Same permitted set as the top level. |

## Entities

```json
"gap": {
  "label": "Gap", "plural": "Gaps", "table": "gap",
  "title": "{office} · {shift}",
  "status": "status",
  "columns": ["hours", "status", "progress"],
  "fields": [ ... ],
  "actions": [ ... ],
  "rows": [ { "id": "b1120", "office": "b", "status": "open" } ]
}
```

- `title` is a field key, or a template with `{field}` slots. Ref fields resolve to the title of the row they point at.
- `rows[].id` is lower-case letters and digits. The record's address is `#<entity>-<id>`.
- Every entity gets a detail page automatically: its facts, plus every row elsewhere that points at it.

### Field types

| `type` | Draws as | Extra keys |
|---|---|---|
| `text`, `date`, `time`, `datetime` | The value as written. Dates and times are display strings. | `empty` |
| `number` | Number with `unit`. | `unit` |
| `enum` | A pill. | `labels` (value → words), `tones` (value → `ok`, `attention`, `strong`) |
| `ref` | A link to that row's detail page. | `ref` (entity key), `empty` |
| `meter` | A bar against `max`. Turns to the attention colour above `max`, or at `warn`. | `max`, `warn`, `unit` |
| `bool` | Yes or No. | |
| `who` | An Agent or Person chip. Value `agent` or `human`. | |
| `private` | A lock and `shown_as`. **The row holds no value for this field.** Use it for anything the data model marks RESTRICTED. | `shown_as` |

## Screens

| `type` | What it is | Keys |
|---|---|---|
| `home` | The landing screen. | `title`, `subtitle`, `blocks[]`: `counts` (`items[]` of `{label, hint, entity, where, to, tone}`), `queue` (`queue`: a queue screen id, `limit`), `list` (`title, entity, where, columns, limit, more`), `feed` (`title, feed`: a feed screen id, `limit`, `note`). |
| `list` | A table of one entity; each row opens its detail. | `entity`, `columns`, `filter` (a field key: one chip per value), `where`, `note` |
| `queue` | Work an agent prepared that a person must release. | `entity`, `pending` (a `where`), `card_title`, `summary` (templates), `facts[]`, `actions[]`, `rule` (the guardrail text), `columns` (for the Decided table) |
| `feed` | The activity log. | `entity`, `time`, `actor`, `kind` (a `who` field), `text`, `link` (a ref field) |
| `roster` | Who does what: agents on one side, people on the other. Reads `agents` and `people`. | |
| `rules` | Coverage, guardrails, connections and the provenance of the demo. | |

Every screen may carry `from` (story ids) and `release`; they are printed under the title so a
reviewer can trace a screen back to the plan.

`where` is an object of `field: value` or `field: [values]`. All must match.

## Actions

The only thing that changes state. On a queue screen or on an entity (shown on its detail page).

```json
{ "label": "Approve overtime", "tone": "primary",
  "when": { "decision": "pending" },
  "set": { "decision": "approved", "decided_by": "{persona}" },
  "also": [ { "entity": "shift_offer", "where": { "gap": "{gap}", "hygienist": "{hygienist}" }, "set": { "response": "waiting" } } ],
  "log": "Approved overtime for {hygienist}.",
  "toast": "Overtime approved. {hygienist} is texted in the next wave." }
```

- `set` changes the row. `also` changes rows elsewhere; a `where` value written `{field}` means "the same value as this row's field".
- `log` adds a line to `app.log.entity`, signed by the persona as a person. This is how the demo shows a human decision next to the agents' work.
- Nothing is saved. **Reset demo** restores the starting sample.

## Rules the sample must keep

1. One moment in time. Every row agrees with it.
2. Counts are `where` clauses, never typed totals.
3. Every guardrail in the plan holds in the rows, and `shown_as` says where.
4. `private` fields have no value anywhere in the file.
5. People are fictional: invented names, `555-01xx` numbers, `@example.com` addresses.
6. `coverage` has a row for every story in the plan.
