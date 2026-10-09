# Human Ownership → AI Commercial Pause Contract

**Phase 1, task 9.** Session `CC-20261005-r6h2`. Against `origin/main` @ `541305a6`.

§2 makes this a core architectural requirement: when a human takes a conversation, conflicting
automated commercial outreach stops, non-conflicting transactional messages continue, a second
rep cannot claim the same lead, and every transition is auditable.

Each clause below is marked **SATISFIED TODAY** (with the enforcing line cited) or **TO BUILD**
(with the owning phase). That makes this document double as a conformance checklist for Phase 4
rather than a wish list.

---

## Clause 1 — Opening ownership pauses conflicting automated commercial outreach

**SATISFIED TODAY, and more thoroughly than expected.** The pause is enforced at three
independent points, not one.

**At candidate generation, business side** — no email candidate is even produced:

`backend/src/services/growthJourney/strategies/b2bCandidates.ts:190` → "if (ctx.contact.human_conversation === 'yes') return 'human_in_conversation';"

**At candidate generation, learner side** — a narrower set is withheld:

`backend/src/services/growthJourney/strategies/learnerStrategy.ts:231` → "const PAUSED_ACTIONS: ReadonlySet<string> = new Set(['SEND_EMAIL', 'RECOMMEND_LESSON']);"

**At send time**, on freshly re-resolved evidence, where failing it cancels the receipt:

`backend/src/services/growthJourney/execution/planChecks.ts:90` → "if (evidence.human_conversation === 'yes') return { open: false, reason: 'human_in_conversation' };"

That last one is the load-bearing check. A decision made before a human claimed the lead is
re-evaluated immediately before the send, so a claim that lands between planning and sending
still stops the message. **DECISION 1: this three-point structure is preserved, not
consolidated.** A single check at generation time would reintroduce exactly that race.

---

## Clause 2 — Non-conflicting transactional and service messages continue

**SATISFIED TODAY, by scope rather than by an exemption list.** The pause applies to
*commercial* candidate generation and to the journey's own send path. Transactional mail —
password resets, receipts, appointment confirmations — does not flow through the journey
execution path at all, so it is unaffected without needing a carve-out.

**DECISION 2: no exemption list is introduced.** An allowlist of "transactional" message types
would be a second place for the rule to live, and it would drift. The boundary stays
structural: if a message is not a journey commercial action, the pause does not reach it.

---

## Clause 3 — A second rep cannot claim the same open lead

**TO BUILD — Phase 4.** This is the weakest clause and the one §2 names explicitly.

Two layers exist, and neither closes it:

**Layer 1, the handoff row.** Accept uses an unconditional update behind an in-memory status
check:

`backend/src/services/growthJourney/handoffs/dispositionService.ts:86` → "  await row.update({ status: 'accepted', accepted_at: asOf, assigned_to_type: 'human', assigned_to_id: actor.id, assignment_blocked_reason: null });"

The guard reads the status off the already-loaded instance, and the update carries no status
predicate. Two concurrent accepts both pass the guard and both write; the second overwrites the
assignee. Disposition and release share the shape.

**Layer 2, the ownership row.** A partial unique index does exist:

`backend/src/db/growthJourneyPhase4Statements.ts:219` → "CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_conversation_ownership_open_unique"

but the opener treats a violation as a replay and returns the existing row rather than
refusing, so it does not block the second accept. And a handoff with no lead id writes no
ownership row at all, so for those the index is not even reached.

**DECISION 3: the fix is a conditional update, and the pattern already exists in this
subsystem.** The SLA sweep updates with a status predicate and counts affected rows:

`backend/src/services/growthJourney/handoffs/slaService.ts:75` → "status: [...EXPIRABLE_STATUSES],"

so accept becomes "update where id and status is still claimable, then check the affected
count". **No new lock, no transaction framework, no second ownership concept** — the standing
constraints forbid inventing a mechanism where one exists, and this is a five-line change to
match a sibling.

---

## Clause 4 — The human sees what the AI knew and why it escalated

**SATISFIED TODAY.** The handoff carries an evidence packet, qualification gaps, talking points
and a reason, built at creation and refused if it contains an address. The detail page renders
the packet with address masking on both keys and values.

**DECISION 4: the packet stays free of PII and the masking stays on both key and value.** The
standing constraints require no `@` in packets; the existing implementation already asserts it.

---

## Clause 5 — Dispositions and their consequences

**PARTLY SATISFIED.** All six dispositions exist and only one is reachable from the UI.

| Disposition | Consequence today | Status |
|---|---|---|
| `not_ready` | returns to AI after a cooldown | **SATISFIED** |
| `nurture` | returns to AI after a cooldown | **SATISFIED** |
| `qualified` | holds, with its own longer cooldown | **SATISFIED** |
| `converted` | terminal, no cooldown | **SATISFIED** |
| `no_contact` | **writes no suppression record anywhere** | **TO BUILD — Phase 4** |
| `disqualified` | writes no suppression record anywhere | **TO BUILD — Phase 4** |

The return-to-AI cooldown is real and defaulted:

`backend/src/services/growthJourney/handoffs/returnToAi.ts:49` → "export const DEFAULT_RETURN_COOLDOWN_DAYS = 14;"

with a body-supplied value overriding a brand policy overriding that default, and the cooldown
stored on the handoff row itself.

**DECISION 5: `no_contact` routes into the existing suppression mechanism, and does not get a
new one.** §2 requires that `no_contact` preserve suppression; the standing constraints forbid
a second opt-out store. Today the disposition writes only the handoff row, an outcome row and a
ledger row — so the person is marked, and nothing enforces it. That is gap D6.

**DECISION 6: all six dispositions become reachable from the UI.** The API already accepts
them; only one is wired. A disposition a rep cannot select is a policy that does not exist in
practice.

---

## Clause 6 — AI resumes only after the configured cooldown

**SATISFIED TODAY.** The returned-to-AI overlay suppresses candidates until the cooldown
elapses, and it lapses rather than needing a clearing job — which is the right design, because
a job that must run to un-suppress someone is a job whose failure silently suppresses them
forever.

**DECISION 7: the lapse-rather-than-clear behaviour is preserved.**

---

## Clause 7 — Every ownership transition is auditable

**SATISFIED TODAY.** Opening and clearing are both recorded, with who, when, why and the
source; each disposition writes a ledger row and an outcome row; and a cleared ownership row is
kept as history rather than deleted.

`backend/src/services/growthJourney/conversationOwnershipService.ts:123` → "export async function openHumanConversation(input: OpenHumanConversationInput): Promise<OpenHumanConversationResult> {"
`backend/src/services/growthJourney/conversationOwnershipService.ts:156` → "export async function clearHumanConversation(input: ClearHumanConversationInput): Promise<{ cleared: number }> {"

---

## Clause 8 — The pause is not a kill switch

**SATISFIED TODAY, and worth stating because it is easy to get wrong.** Ownership is scoped to
one lead and one brand. It does not stop the journey globally, does not stop other brands, and
is not a second global kill switch — the standing constraints are explicit that
`system_kill_switch` stays authoritative and that no second one is introduced.

**DECISION 8: per-lead, per-brand scope is preserved.** Any Phase 4 convenience that pauses
"everything for this rep" is a kill switch wearing a different name.

---

## Summary

| Clause | Status |
|---|---|
| 1 · pause on claim | **SATISFIED** — three enforcement points |
| 2 · transactional continues | **SATISFIED** — structural, no exemption list |
| 3 · single claimant | **TO BUILD — Phase 4** |
| 4 · human sees the evidence | **SATISFIED** |
| 5 · dispositions | **PARTLY** — two write no suppression, five unreachable in UI |
| 6 · cooldown resume | **SATISFIED** |
| 7 · auditable transitions | **SATISFIED** |
| 8 · not a kill switch | **SATISFIED** |

**Five of eight clauses are satisfied today, one partly, one to build.** The headline is
counter-intuitive and worth saying plainly: **the pause itself is the strong part of this
subsystem.** The weakness is the claim, not the stand-down. Anyone planning Phase 4 from the
prompt alone would reasonably assume the pause needed building; it does not.

## What a Phase 4 reviewer should be able to check

1. Two concurrent accepts: exactly one succeeds, and the loser is told why.
2. A claim landing between plan and send still cancels the send.
3. A password reset is unaffected by an open ownership row.
4. `no_contact` produces a suppression a send-time check actually consults.
5. All six dispositions are selectable, and each one's recorded consequence matches this table.
6. An open ownership row for one brand does not pause another brand.
7. No second kill switch, no second suppression store, no second ownership concept.

## Known limits

- **Clause 2 rests on a structural claim**, not a cited exemption: transactional mail does not
  traverse the journey execution path. Phase 4 should assert that with a test rather than
  inherit it as an assumption.
- **Nothing here is implemented.** Every DECISION is intent for Phase 4.
