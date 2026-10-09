# Source-of-Truth Architecture Map

**Phase 1, task 2.** Session `CC-20261005-r6h2`. Read against `origin/main` @ `541305a6`.

The twelve nodes §18 names, each with the code that owns it today. Citation form and its
limits are explained in `CURRENT_STATE_INVENTORY.md`; the same gate checks this file.

## The headline, before the detail

**Every one of the twelve nodes has an owner.** Not one is ABSENT. That is worth saying
plainly, because the instinct in a reconciliation is to assume things are missing. They are
not — the boxes all exist and all have code behind them.

**The drift is in the seams, not the boxes.** Three specific kinds:

1. **A node whose owner does not do what the North Star needs.** Person 360 exists, twice,
   and neither assembler carries the Explorer intelligence that §5 requires of it.
2. **A node whose owner can only answer one question.** Content/experiences resolves
   exactly one of twenty-one declared asset types.
3. **A seam with no join at all.** Pre-registration prospect and free-account registration
   are both owned, but no canonical event marks the transition between them.

A map that drew missing boxes would be the wrong map. This one draws the edges that do not
carry what the next phase needs.

---

## The twelve nodes

### 1 · Pre-registration prospect

**Intended:** anonymous behaviour before an account exists, as acquisition evidence.
**Owned by:** `backend/src/services/visitorTrackingService.ts:109` → "export async function findOrCreateVisitor("
**Cross-brand view:** `backend/src/services/crossBrandVisitorService.ts:30` → "export interface CrossBrandVisitor {"
**Missing:** the cross-brand service returns aggregate rows, not an ordered event sequence.
§5 says explicitly not to reduce web history to category counts where the sequence improves
decisions. Nothing today preserves that order across the brand boundary.

### 2 · Free-account registration

**Intended:** the canonical Explorer entry event (§1).
**Owned by:** two paths, writing contradictory labels.
`backend/src/services/enrollmentService.ts:322` → "    enrollment_type: 'explorer',"
`backend/src/services/freeSignupService.ts:30` → "tier: 'guest' as const,"
**Missing:** a single canonical entry event. Treated in full in `EXPLORER_ENTRY_SEMANTICS.md`.
This is the most consequential seam in the map, because §1 of the build prompt rests on it.

### 3 · Explorer profile

**Intended:** the learner's lifecycle state, scores and overlays.
**Owned by:** `backend/src/models/ExplorerJourneyProfile.ts:124` → "tableName: 'explorer_journey_profiles',"
**Recomputed by:** `backend/src/services/explorerGrowth/explorerProfileService.ts:288` → "export async function recomputeAllExplorers("
**Missing:** nothing structural. The gap is upstream — the recompute iterates existing
profile rows, and a `tier='guest'` account never gets a row to iterate.

### 4 · Person 360

**Intended (§5):** one evidence view answering "who is this person" — identity, acquisition,
cross-brand history, learning, building, community, commercial, and intelligence including
Explorer E/I/F and the readiness score.
**Owned by:** `backend/src/services/adminOs/personProfileService.ts:275` → "export async function getPersonProfile(query: ProfileQuery): Promise<PersonProfile | null> {"
**Missing, and this is the second most consequential gap in the map:**

- **No Explorer intelligence reaches it.** `PersonProfile` carries no E/I/F, no Explorer
  state, no overlay. The richest behavioural model of a prospect in the codebase does not
  reach the page whose stated purpose is everything known about one human being.
- **It actively suppresses the score §6 needs**, for exactly the population §6 is about:

`backend/src/services/adminOs/personProfileService.ts:229` → "WHEN e.email IS NOT NULL THEN 'enrolled_student'"

  derives the stage from the mere existence of an enrollment row by email, with no check of
  `enrollment_type`, `tier` or `payment_status`, and that stage is post-conversion, so:

`backend/src/services/adminOs/personProfileService.ts:297` → "row.temperatureUpdatedAt = null;"

- **A second assembler exists and the two do not know about each other.** §5 warns against
  a second profile that drifts; there are already two.

### 5 · Growth Journey relationship

**Intended:** the enterprise-wide relationship and routing layer (§4) — which brand, which
programme, which offers are legal, who owns the conversation.
**Owned by:** `backend/src/models/GrowthJourneyEnrollment.ts:135` → "tableName: 'growth_journey_enrollments',"
**Missing:** nothing structural. Four programmes across four brands are seeded; the
relationship layer is the healthiest node on the map.

### 6 · Governor

**Intended:** one decision per person per boundary, with the reason preserved.
**Owned by:** `backend/src/services/growthJourney/governor/decideForSubject.ts:171` → "export async function decideForSubject("
**Ordering owned by:** `backend/src/services/explorerGrowth/governor/arbiter.ts:88` → "export const SORT_KEYS = ["
**Missing:** nothing in the mechanism. The arbiter's ordering is total and its losers keep
their reasons. **The Governor's problem is its menu, not its judgement** — see node 7.

### 7 · Content / experiences

**Intended (§13):** curriculum, lessons, blogs, videos, testimonials, case studies, events,
Open House, live classes, Rooms, cohorts, paid programmes, subscriptions, internships,
certifications, community, projects, platform features, tools, referrals.
**Owned by:** `backend/src/services/explorerGrowth/content/resolveContentAssets.ts:136` → "export async function resolveContentAssets("
**Vocabulary:** `backend/src/types/explorerGrowth.ts:229` → "export type ExplorerAssetType ="
**Missing — the largest gap in the system.** 21 asset types are declared and exactly one is
ever written:

`backend/src/services/explorerGrowth/content/syncTimelineCards.ts:226` → "('LESSON', :source_system, :source_id, :title, :summary, :url,"

Four of eight Explorer content purposes and all three business-journey purposes are
*declared* dead ends — the code names the gap rather than substituting something. That is
honest behaviour, and it is also why the Governor can only ever choose a lesson.

### 8 · Campaign execution

**Intended (§16):** campaigns deliver communications where needed; they are not the brain.
**Owned by:** `backend/src/services/growthJourney/execution/campaignKeys.ts:35` → "export const EXPLORER_CAMPAIGN_KEYS = ["
**The send itself:** `backend/src/services/growthJourney/execution/enrollmentAdapter.ts:202` → "await enrollLeadInSequence(leadId, campaign.sequence_id, campaign.id);"
**Missing:** the execution path **passes no content assets**. The Governor selects up to
three lessons for a digest; the email path enrols the lead in a campaign sequence and the
selection is not read. A digest assembly step is named in §15 and does not exist.

### 9 · Human sales escalation

**Intended (§2, §8):** a governed handoff the moment a person is purchase-ready, with a
live queue ordered by readiness.
**Owned by:** `backend/src/services/growthJourney/handoffs/handoffService.ts:97` → "export async function createHandoff(args: CreateHandoffArgs): Promise<CreateHandoffResult> {"
**Ordering:** `backend/src/controllers/growthJourneyHandoffController.ts:57` → "export const HANDOFF_QUEUE_ORDER"
**Missing:** three things, all in `CURRENT_STATE_INVENTORY.md` §2.6 — no stable tiebreaker
and no `NULLS LAST`, so an unvalued handoff outranks valued ones; nothing recomputes an
open handoff's value; and the human's own moves are not race-safe.

### 10 · GHL

**Intended (§10):** a bounded modern adapter for calendars, users and appointments, leaving
the stable contact sync alone.
**Owned by:** `backend/src/services/ghlService.ts:54` → "const GHL_BASE = 'https://rest.gohighlevel.com/v1';"
**Routing:** `backend/src/services/leads/ghlAccountRouting.ts:85` → "const accountKey = routes[group] || DEFAULT_ACCOUNT;"
**Missing:** everything §10 asks for. No calendar, user-listing, free-slot or appointment
code exists — `ABSENT` for all four. Six contact endpoints, one static key per sub-account,
no retry.

### 11 · Calendar

**Intended (§12):** the rep's availability and appointments inside the sales workflow, with
GHL as the external source of truth when the rep is configured for it.
**Owned by:** `backend/src/services/calendarService.ts:225` → "export async function createBooking(data: BookingInput): Promise<BookingResult> {"
**Missing:** the owner is **Google Calendar, for the public strategy-call flow** — a
different calendar, a different audience, and explicitly not to be migrated (§12). The
rep-facing calendar is `ABSENT`. The internal appointment table has no provider-id column,
so its rows cannot be joined to the events they created.

### 12 · Outcomes

**Intended:** the feedback loop — what happened, fed back into the next decision.
**Owned by:** `backend/src/services/growthJourney/outcomes/outcomeRecorder.ts:70` → "export async function recordOutcome(input: RecordOutcomeInput): Promise<RecordOutcomeResult> {"
**Normalisation:** `backend/src/services/growthJourney/outcomes/outcomeNormalizer.ts:31` → "export const INTERACTION_OUTCOME_MAP: Readonly<Record<string, GrowthJourneyOutcomeType>> = Object.freeze({"
**Missing:** appointment `cancelled` is deliberately unmapped and lands in an unmapped
bucket; `rescheduled` is not a lifecycle value anywhere, so a reschedule cannot become
evidence.

---

## Node-by-node summary

| # | Node | Owner exists | What is missing |
|---|---|---|---|
| 1 | Pre-registration prospect | yes | ordered cross-brand sequence, not just counts |
| 2 | Free-account registration | yes, **twice, contradictory** | one canonical entry event |
| 3 | Explorer profile | yes | nothing structural; starved upstream by node 2 |
| 4 | Person 360 | yes, **twice** | Explorer intelligence; and it suppresses the readiness score |
| 5 | Growth Journey relationship | yes | nothing — healthiest node |
| 6 | Governor | yes | nothing in the mechanism; its menu is the problem |
| 7 | Content / experiences | yes | 20 of 21 asset types resolve nothing |
| 8 | Campaign execution | yes | selected assets are never passed to the send |
| 9 | Human sales escalation | yes | stable ordering, re-scoring, race-safe claim |
| 10 | GHL | yes (contacts only) | calendar, users, slots, appointments — all absent |
| 11 | Calendar | yes (wrong calendar) | the rep-facing one; provider ids on the mirror |
| 12 | Outcomes | yes | cancelled unmapped; rescheduled not a value |

**Nodes with no owner: 0 of 12.** **Nodes whose owner does not yet do what the North Star
needs: 8 of 12** — 1, 2, 4, 7, 8, 9, 10, 11.

## What this map is not

- It is not a dependency graph. It says who owns each concern, not call order.
- It is not a plan. Which phase closes which seam is `GAP_MATRIX.md`'s job.
- It does not assert that an owned node is *correct* — only that code owns the concern.
  Where behaviour is wrong rather than missing, the citation is to the line that is wrong.
