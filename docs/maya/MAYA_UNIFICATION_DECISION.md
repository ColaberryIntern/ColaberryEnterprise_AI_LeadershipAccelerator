# Maya unification: one employee or two

**Ticket:** M30 (`Design Explorer Growth - Maya`, todo 10411539646) · **Execution mode:** Document then Code
**Status:** DECISION PROPOSED - awaiting Ali. Nothing has been implemented.
**Measured against production:** 2026-11-02, read-only.

---

## Takeaway

**One Maya, one memory, keyed on the person. Retire the existing voice-to-Ali handoff rather than reuse it.**

The recommendation is the same one the ticket's own reasoning points at. What the measurements change is the **cost and the urgency**: unification is nearly free today, because there is almost nothing to unify. Wait, and that stops being true.

| What the ticket assumes | What production says |
|---|---|
| "Maya is already live in production as an outbound voice agent" | The voice capability is **wired but unexercised**. One call was ever requested, on 2026-10-24. It sits at `call_status: 'pending'` with an **empty** `synthflow_call_id`: it was never placed. |
| "two Mayas with separate memories would be worse than one" | True, and not yet the problem. `maya_conversation_outcomes` holds **0 rows**. The voice Maya has never recorded a conversation. |
| The existing Maya-to-Ali handoff is a path to reuse or retire | It has **never fired**. 0 of 21,111 `campaign_leads` rows carry `trigger_source`. |
| | **0 people have met both Mayas** (measured, not inferred). |

So "two Mayas with divided memory" is a forecast, not a current defect. The current defect is narrower and worse: **neither Maya reliably remembers anyone.**

---

## The measured state

### The two memory stores

| Store | Rows | Rows attributable to a person | Distinct people |
|---|---|---|---|
| `admissions_memory` (chat Maya) | 112 | **1** | 1 |
| `maya_conversation_outcomes` (voice Maya) | **0** | 0 | 0 |

`admissions_memory` carries a `UNIQUE` index on `visitor_id` and a **nullable** `lead_id`. The unique key is therefore a *browser*, not a person. **111 of 112 rows have no `lead_id` at all** - memory about people nobody can identify. That is R4's ticket ("Maya remembers a person, not a browser") seen from this side, and it is the real blocker on shared memory.

### Everything Maya has actually done

`admissions_action_logs` holds **three rows**, all dated 2026-10-24:

| Action | Status |
|---|---|
| `lead_captured` | completed |
| `campaign_enrolled` | skipped |
| `voice_call_initiated` | completed |

That is the whole operating history of the agent as of tonight. It is worth stating plainly because every decision below is cheap *because* of it.

### The handoff: unexercised, not proven broken

The Maya-to-Ali handoff lives inside `synthflowWebhookController.ts`, in the branch that runs when a **completed** voice call arrives. No voice call has ever completed, so **the code has never had the chance to run**. It is unexercised. Calling it broken would be unfair; calling it proven would be worse.

The evidence that the absence is real rather than a query artifact: 145 `campaign_leads` rows **do** carry non-empty `metadata`, and none of them carries a `trigger_source` key.

### A latent defect in that handoff, found while checking whether its target exists

```js
const aliCampaign = await CampaignModel.findOne({ where: { type: 'executive_outreach' } });
```

**Five** campaigns carry `type: 'executive_outreach'`:

- Ali Personal Outreach  ← the intended target
- CEO Direct - Funded AI Transformation Partner
- Alumni Win-Back - Group A (Placed) - Open House Countdown
- Alumni Win-Back - Group B (Dropouts) - Open House Countdown
- Alumni Win-Back - Group C (Leads) - Open House Countdown

`findOne` with no ordering picks an arbitrary one. The first time a voice call completes, a hot lead can be enrolled into an alumni win-back sequence instead of Ali's desk, and the log line will say the handoff succeeded. This is the strongest single argument for **retire rather than reuse**: M33 inheriting this path inherits the bug, and it would first appear in production on the day voice goes live.

---

## The decision, question by question

### 1. One employee or two? **One.**

She has one name, one face on the campus staff card, one persona file and one `ai_agents` row with one `AdminUser` (`maya@colaberry.com`, verified in production, M28). Two would mean a person who spoke to Maya on the phone being greeted as a stranger by Maya in the app - which the ticket correctly calls worse than having only one of them.

There is no argument for two beyond the accident that the voice path and the chat path were built at different times.

### 2. Shared memory? **Yes, and it must be keyed on the person.**

This is the half that is not free, and it is honest to say so: **shared memory requires R4.** While `admissions_memory` is unique on `visitor_id`, "one memory per person" is not expressible - one person with a phone and a laptop is two rows, and 111 of today's 112 rows cannot be attached to a person at all.

What unification buys right now is that the *migration* is trivial: **0 voice rows and 1 attributable chat row**. There is no historical reconciliation to do. Every month this waits, that changes.

### 3. The existing handoff: **retire it. M33 builds the real one.**

Reasons, in order of weight:

1. It has never run, so retiring it breaks nothing that works.
2. It carries the arbitrary-campaign defect above.
3. **Its success log line is not conditional on the write having landed.** `enrollLeadInSequence` is awaited, so a throw is caught - but the following `CampaignLead.update(...)` returns an affected-row count that is discarded, and the `[Synthflow Webhook] Maya->Ali handoff: enrolled lead ...` line prints whether or not that update matched a row. If the enrolment landed under a different `campaign_id` than the `where` clause looks for, the metadata Ali reads for context is silently never written and the log still says it worked. M33 requires "Success is claimed only on confirmation; otherwise the fallback opens."
4. It is not idempotent by construction. It guards with a `findOne` on an active `CampaignLead` before enrolling - a check-then-act with no unique constraint behind it, so two webhook deliveries one second apart can both pass the check. M33 requires "the same handoff twice yields one."
5. Its whole body is wrapped in a `catch` that only `console.warn`s. A failed handoff is invisible to the person who was promised a callback, which is the failure mode R5 removed from the chat path.

Retiring means: when M33 lands, the voice path calls `create_journey_handoff` like every other caller, and this block is deleted rather than left as a second route to the same outcome. **Nothing is deleted before M33 exists** - that would leave the voice path with no handoff at all.

---

## What this does not decide, and what it does not do

- **No voice capability is added.** The ticket forbids it and nothing here touches Synthflow, SMS or email.
- **It does not implement anything.** M30 is "Document then Code" and the ticket says to put the decision to Ali first. This is that document.
- **It does not resolve R4.** Shared memory depends on re-keying `admissions_memory`, which is a schema change on a live table and sits on CLAUDE.md's escalate list.

## What Ali has to decide

1. **One Maya or two.** Recommendation: one.
2. **Shared memory, which approves R4 as its prerequisite.** Recommendation: yes, and do it while the migration is 0 voice rows and 1 chat row.
3. **Retire the existing handoff when M33 lands, or keep both paths.** Recommendation: retire, for the four reasons above.
4. **Whether the arbitrary-campaign defect is fixed now or waits for M33.** It is a one-line fix (match on name or id, not on `type`) and it cannot fire until a voice call completes. Recommendation: fix it with M33, so the change lands with a test rather than on its own.

---

*Written for Ali. Every number above came from a read-only query against production on 2026-11-02; the queries are reproducible and the two load-bearing ones (the zero overlap and the never-fired handoff) were each re-run with a control after an earlier version of the query errored and returned an empty result that could have been misread as an absence.*
