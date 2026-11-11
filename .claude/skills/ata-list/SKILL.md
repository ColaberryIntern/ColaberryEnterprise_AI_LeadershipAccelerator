# ata-list - work the backlog by list, not by ticket

Turn a line from the triage board into a decision that covers a whole list, or into one ticket
worked properly. Both modes, same entry point.

**Invoke on:** `/ata-list "<list name>"`, `/ata-work-task <id>`, "work the triage board", "clear
the backlog", "what should I do with this list", or when Ali pastes a command off a list card.

> Every rule here is a measurement, not a preference. The numbers were taken from production on
> 2026-11-11 and are restated so the next session does not have to re-derive them.

---

## The four that cost something

### 1. The list is the unit. Working ticket by ticket is a 76-hour job.

Of Ali's **2,696** active tasks, **2,403 (89%)** sit in one project across **421 lists**. **2,289
are dormant.** At two minutes a ticket that is about 76 hours. The top ten lists hold 270 tasks and
every one of them is dormant, so ten decisions clear 270 tickets.

**Always ask what the list decision is before working any ticket in it.** Working a ticket inside a
list that should be dismissed is worse than doing nothing: it spends effort and it makes the list
look alive.

### 2. Dismissal does NOT close the ticket, and confusing the two closes other people's projects.

`--dismiss` writes `is_dismissed` on the local mirror. It removes the task from Ali's queue and
from every digest. **Basecamp is untouched**: the ticket stays open, the project still owns it, and
anyone else assigned still sees it.

That is deliberate. Most of the backlog is scaffolding bulk-assigned to Ali from projects other
people may still be running. "Stop showing this to me" and "this work is cancelled" are different
decisions, and only the first one is Ali's alone to make.

**Never describe a dismissal to Ali as closing, completing or cancelling a ticket.**

### 3. Generated scaffolding and hand-authored work get OPPOSITE treatment.

**1,386** of the 2,403 carry the generated shape: a description containing both `Type:` and
`Done when:`, usually with a 🤖 or 🧑 marker. Lists like "2. Matching Loads to Carriers" and
"1. Patient Self-Scheduling" are 100% generated and 100% dormant.

| Shape | Right move | Wrong move |
|---|---|---|
| dormant + mostly generated | dismiss the list | re-dating it, which pretends it is live |
| dormant + hand authored | **re-date into a window** | dismissing it, which deletes real work |

The lens already computes `generatedShare`. **Read it before proposing anything.** A list at 0%
generated is Ali's own work and must never be bulk dismissed.

### 4. A bulk action always runs dry first, and the plan is shown before it is run.

Every planner returns the exact changes, a summary, and the reversal. `scripts/ataListAction.js`
dry-runs by default; `--apply` is required to write. Show Ali `renderPlan` output and get a yes
before applying anything that touches more than one ticket.

---

## Getting the data

```bash
# the board plus the machine bundle, from the live mirror
node scripts/ataTriageBoard.js --out /tmp/triage.html --days 60 --limit 3000
```

Writes `/tmp/triage.html` (for Ali) and `/tmp/triage.bundle.json` (for you). The bundle carries
`lists[]` with `generatedShare`, `humanShare`, `lead`, `suggestions` and `taskIds`, and
`workOrders[]` with the parsed brief per ticket.

Run it inside `accelerator-backend`, where the database credentials live.

---

## Strategic mode: deciding a list

```bash
node scripts/ataListAction.js --list "9. Ensuring Data Security" --dismiss --reason "demo scaffolding, not live curriculum"
node scripts/ataListAction.js --list "Understanding Inputs and Outputs" --redate-from 2026-11-17 --per-week 3
node scripts/ataListAction.js --list "3. Tracking Shipments" --assign Kes
```

- `--dismiss` is the only one this script will apply. It is local and reversible.
- `--redate-from` and `--assign` **reach Basecamp**, so the script plans them, writes the plan to
  a file, and refuses to apply. Bulk Basecamp writes as Ali are gated in this environment. Hand
  Ali the plan path; do not route around the gate.
- Re-dating spreads across **working days only** at `--per-week`, in the order the tasks were
  originally promised. It never piles a list onto one day.

---

## Trenches mode: working one ticket

The work order carries what you would otherwise spend ten minutes rediscovering: the url, the due
date, the owner, what to read first, where the artifact goes, and what done means.

**Claim it first**, or two tabs will do the same ticket:

```js
const { claim, release } = require('/app/dist/services/ops/taskClaims');
const r = await claim('7463955/10406234078', '<your tab name>', { ttlMinutes: 60, purpose: 'AF8.1' });
if (!r.ok) { /* r.heldBy has it until r.heldUntil - pick another ticket */ }
```

Release when done. A claim expires on its own, so a crashed tab does not lock a ticket forever.

**If `done when` says NOT STATED**, establish the finish line before working, or ask Ali one
question. 83% of tickets do not state it. A session that invents a finish line delivers something
nobody asked for.

**If the ticket names a `Required skill`**, use it. 32 tickets name `/loop-architect`. The ticket
telling you the house approach is better information than your own judgement about the approach.

**If the brief is marked 🧑 or says `Required skill: none - human task`**, do not work it. Prepare
it: assemble what the person needs so their step is ten minutes rather than an afternoon.

---

## Definition of done

- The list-level decision was considered before any ticket in it was worked.
- Any bulk action was dry-run, shown to Ali, and approved before `--apply`.
- A dismissal was described accurately: removed from the queue, still open in Basecamp.
- Nothing hand-authored was bulk dismissed.
- Every ticket worked was claimed first and released after.
- A ticket with no stated finish line got one, or got a question, before work started.
