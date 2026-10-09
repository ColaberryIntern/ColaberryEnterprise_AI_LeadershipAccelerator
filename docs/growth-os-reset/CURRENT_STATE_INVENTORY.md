# Current State Inventory — what the Explorer Growth / Growth Journey code does today

**Phase 1, task 1.** Session `CC-20261005-r6h2`. Read against `origin/main` @ `541305a6`.

This document is the factual base the rest of Phase 1 rests on. It describes **what the
code does**, not what it should do. Every forward-looking decision lives in the other
Phase 1 documents and is labelled DECISION there.

## How to read this

Every claim about current behaviour carries a citation in exactly one form — a path, a
line, and a literal that occurs exactly once in that file. This is a real one:

`backend/src/models/Lead.ts:276` → "ghl_contact_id: {"

`node scripts/verifyGrowthOsResetCitations.js` proves each one resolves. The literal is
the evidence and the line number is advisory — if a later commit moves the line, the
checker reports drift rather than failing, because this check runs on every PR in the repo
and a gate that breaks on unrelated commits gets deleted.

**What that proves, and what it does not.** It proves a quote is real, findable and unique
in the file named. It does **not** prove the quote is the *right* evidence for the claim
beside it: a function's signature, or a comment that merely mentions a behaviour, will pass
while being the wrong line to cite for an enforcement. Judging that is a human job. Where
this document says something is *enforced*, the citation is the line that does the work.

Where the repo does not answer a question, this document says `ABSENT` and says what would
answer it. An honest gap is a finding, not a hole to be filled with a guess.

A file named in prose without a line number is **not** evidence. Only the cited form is.

---

## Part 1 — The ten claims the prompt says not to trust

§3 of the build prompt lists facts that "should influence the design" and instructs:
*"Verify these again rather than trusting this prompt blindly."* All ten, adjudicated.

| # | Claim | Verdict |
|---|---|---|
| 1 | `Lead` already has `ghl_contact_id` | **CONFIRMED** — `STRING(100)`, nullable. No migration creates it; the column exists only in the Sequelize model. |
| 2 | GHL routing supports different sub-accounts by lead source | **CONFIRMED, materially narrower** — three qualifications below. |
| 3 | GHL contact sync uses the older v1 contact API | **CONFIRMED** — one base URL in the file, and it is the v1 host. |
| 4 | There is an internal Google Calendar strategy-call flow | **CONFIRMED** — public unauthenticated availability and booking routes, Google Calendar v3 behind them. |
| 5 | Growth Journey has sales / admissions / support / solution-architect / human-review queues | **CONFIRMED, six not five** — the sixth is `ali`. |
| 6 | Growth Journey has capacity policy, handoff evidence, assignment, dispositions and human conversation ownership | **CONFIRMED, all five** — inventoried in Part 2.6. |
| 7 | The current Handoff UI is not the sales operating experience requested | **CONFIRMED** — seven columns, two filters, a manual reload; no claim, no score, one of six dispositions. |
| 8 | Existing Handoff ordering is not a true live highest-readiness-first sales queue | **CONFIRMED, and worse than stated** — three different orderings exist for one queue. |
| 9 | There is an SSE pattern using native EventSource | **CONFIRMED — one implementation, wrong domain.** Participant-scoped, cognitive-governance events. |
| 10 | Explorer content vocabulary includes asset types that are not populated or resolved | **CONFIRMED — 21 declared, 1 live.** |

The evidence, one citation per line:

- Claim 1 — `backend/src/models/Lead.ts:102` → "declare ghl_contact_id: string | null;"
- Claim 2 — `backend/src/services/leads/ghlAccountRouting.ts:85` → "const accountKey = routes[group] || DEFAULT_ACCOUNT;"
- Claim 3 — `backend/src/services/ghlService.ts:54` → "const GHL_BASE = 'https://rest.gohighlevel.com/v1';"
- Claim 4 — `backend/src/routes/calendarRoutes.ts:6` → "router.get('/api/calendar/availability', handleGetAvailability);"
- Claim 4 — `backend/src/services/calendarService.ts:225` → "export async function createBooking(data: BookingInput): Promise<BookingResult> {"
- Claim 5 — `backend/src/models/GrowthJourneyHandoff.ts:67` → "export const OWNER_QUEUES"
- Claim 6 — `backend/src/services/growthJourney/capacityService.ts:83` → "      where: { brand_id: args.brandId, policy_type: 'queue_capacity', owner_queue: args.ownerQueue },"
- Claim 7 — `frontend/src/components/growthJourney/HandoffsTab.tsx:115` → '            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={state.reload}>'
- Claim 7 — `frontend/src/pages/admin/HandoffDetailPage.tsx:231` → "onClick={() => move('Disposition', () => dispositionHandoff(id, { disposition: 'qualified', reason }))}>"
- Claim 8 — `backend/src/controllers/growthJourneyHandoffController.ts:57` → "export const HANDOFF_QUEUE_ORDER"
- Claim 9 — `frontend/src/hooks/useRealtimeAwareness.ts:54` → "const src = new EventSource(url, { withCredentials: true });"
- Claim 9 — `backend/src/intelligence/systemStateEngine/realtime/sseTransport.ts:27` → "export function openSSEStream(req: Request, res: Response, opts: SSEStreamOptions): () => void {"
- Claim 10 — `backend/src/types/explorerGrowth.ts:229` → "export type ExplorerAssetType ="
- Claim 10 — `backend/src/services/explorerGrowth/content/syncTimelineCards.ts:226` → "('LESSON', :source_system, :source_id, :title, :summary, :url,"

### Claim 2, in full — the three qualifications that matter

The mechanism is real and it is **fail-closed**, which is the property the standing
constraints require. But "supports different sub-accounts" overstates what is live:

1. **Routing keys off a source *group*, not the raw source.** Any source absent from the
   group table collapses to a default group and therefore to the default account.
2. **Only one non-default account is configured, and its key ships empty.** So at default
   settings, both routed groups resolve to `unconfigured` and are *withheld* — no lead
   reaches a second account today.
3. **Only the contact-sync path is routing-aware.** SMS and inbound-reply note writes take
   no API key parameter and therefore always resolve the global one, so they are
   hard-wired to the default sub-account regardless of lead source.

Fail-closed is confirmed at the deciding line — a lead routed to a non-default account
with no key returns this rather than the default account's credential:

`backend/src/services/leads/ghlAccountRouting.ts:95` → "return { status: 'unconfigured', accountKey, settingKey };"

The type-level guarantee is stronger than the runtime one: the result union only carries an
`apiKey` on the ready branch, so a caller cannot reach a credential on the unconfigured
branch.

**One deliberate fail-open sub-case, disclosed:** a *corrupt or unparseable* route map
degrades to "no routes", and therefore to the default account, rather than withholding
everything. That is a deliberate choice with a test asserting it, not an oversight — but it
is a fail-open path inside a fail-closed design and Phase 4 should know it exists.

---

## Part 2 — Subsystem inventory

The nine areas Phase 1 task 1 names.

### 2.1 The original Explorer design

`docs/EXPLORER_GROWTH_OS_PLAN.md` is 2,105 lines and remains the best statement of intent.
**It is itself a drifted artifact in places** and must not be read as current fact. Two
demonstrations:

- Its §31.2 declares seventeen critical scenarios `T-SCEN-01`…`T-SCEN-17` that "all become
  named tests". **The literal `T-SCEN` appears zero times** in `backend/src`,
  `frontend/src` and `tests`. Positive control: the same grep form matches
  `EXPLORER_CAMPAIGN_KEYS` in 8 files, so the search works. The honest claim is that **no
  test carries those identifiers** — not that the behaviours are untested. Which of the
  seventeen have equivalent coverage under other names is the acceptance-harness task's
  job, not an assumption to make here.
- Its scenario-8 note says per-channel suppression is a defect and that an SMS STOP kills
  email. **That is now fixed**, and the enforcing line is:

`backend/src/services/unsubscribeEnforcementService.ts:155` → "const suppressGlobally = optOutSuppressesGlobally(channel);"

which delegates to:

`backend/src/services/channelSuppression.ts:128` → "export function optOutSuppressesGlobally("

so an sms or voice opt-out is recorded and scoped, while email keeps the global meaning.

### 2.2 Explorer entry semantics

Treated in full in `EXPLORER_ENTRY_SEMANTICS.md`. The headline for this inventory: there is
**no single Explorer entry event**, and the two flags that could define one are written by
disjoint code paths that never read each other.

The `/enroll` free-account path sets one flag and leaves the other at its default:

`backend/src/services/enrollmentService.ts:322` → "    enrollment_type: 'explorer',"

The portal free-signup path sets the *other* flag and leaves the first at its default:

`backend/src/services/freeSignupService.ts:30` → "tier: 'guest' as const,"

The Explorer OS gates on the first flag only:

`backend/src/services/explorerGrowth/explorerIdentityBridge.ts:122` → "where: { enrollment_type: 'explorer', status: 'active' },"

So a person who creates a free account through the portal is **invisible to the entire
Explorer Growth OS**. This contradicts §1 of the build prompt, which makes free-account
creation the canonical entry event.

Worse, for a person who used both paths the canonical row chosen at login is the one
Explorer cannot see:

`backend/src/services/enrollmentPick.ts:38` → "e.enrollment_type === 'explorer' ? 1 : 0,"

**No canonical entry column or event exists.** `ABSENT` — no `explorer_entered_at`-style
column, no entry event in the ledger's closed vocabulary, and no emitter on either
registration path. The de-facto entry timestamp is `enrollments.created_at`, derived at
read time in two places under two different labels.

### 2.3 Current Growth Journey implementation

Four journey programmes are seeded across four brands, keyed by brand slug and programme
kind. The programme kind decides which human queue a handoff goes to:

`backend/src/services/growthJourney/capacityService.ts:48` → "learner: 'admissions',"

Eight brands are seeded in total; four carry journey programmes.

### 2.4 Campaign definitions

Eleven campaigns are registered, which matches the original plan's §2.8 arithmetic of eight
new rows plus three reused. The registry is the authority; campaign rows are execution
vehicles, not the decision layer.

### 2.5 Content registry — the largest gap in the system

21 asset types are declared; **one is ever written.** Both citations are in Part 1 above.

Consequences, each a named gap rather than a guess:

- Of eight declared Explorer content purposes, four are **declared dead ends** — the code
  records that no cohort-safe projection exists for community content, and the same for
  friction recovery, enrollment offers and referral invites.
- All three business-journey content purposes are declared unsupported.
- No seed or migration inserts content rows anywhere; rows appear only by nightly
  projection from timeline cards.
- Zero brand-scoped content rows exist, so every non-Training brand resolves nothing.

The declared-but-unresolved vocabulary is not a naming problem. It is the reason the
Governor's choices are narrow: it can only ever choose a lesson.

### 2.6 Human handoff system

Everything §2 of the build prompt asks to "reuse and harden" exists. The gaps are in
ordering, re-scoring and single-claimant safety.

**Ordering.** The operator queue sorts on three keys with no `NULLS LAST` and **no stable
unique tiebreaker**, so an unvalued handoff outranks valued ones and offset paging is
unstable:

`backend/src/controllers/growthJourneyHandoffController.ts:57` → "export const HANDOFF_QUEUE_ORDER"

Three different orderings exist for what is nominally one queue: this one, an in-memory
comparator that treats NULL as zero (the opposite of the SQL), and a digest ranking keyed
on `priority` instead of value — of which only the digest has a unique tiebreaker.

**The ranked assignment pass is worse:** it fetches with a bound and **no `ORDER BY` at
all**, so which rows get ranked is database-arbitrary once a brand × queue exceeds the
bound.

**Nothing re-scores an open handoff.** The value column is a static composite computed once
at row creation and never recomputed, so a lead whose intent rises after the handoff exists
does not move.

**Single-claimant safety is weaker than it looks.** Accept, disposition and release use an
unconditional update with an in-memory status guard and no transaction, so two concurrent
accepts can both pass the guard and the second overwrites the assignee. The race-safe
conditional-update pattern exists elsewhere in the same subsystem but is not applied to the
human's own moves. Partial unique indexes do prevent two open *rows* per person per brand.

**Dispositions:** six exist. `no_contact` and `disqualified` write **no suppression,
consent or cooldown record anywhere** — only the handoff row, an outcome row and a ledger
row. Only one of the six is reachable from the UI; the API accepts all six.

**The UI** shows seven columns, two filters and a **manual reload button**. There is no
polling, no SSE and no auto-refresh on this surface, and it does not re-sort client-side.
It is honest about its own limits — the caption discloses the NULL-first ordering and the
unstable paging — but it is a queue viewer, not a sales console.

### 2.7 GHL integration

Six contact endpoints on the v1 API, a 15-second timeout, and **no retry** — `ABSENT`, the
fetch helper performs exactly one request with no backoff. Credentials come from the
settings table, never from env vars. Flags: GHL is gated by its own settings key, **not**
by any Growth Journey capability flag — there is no `ghl`-named flag in the journey flag
module.

**No calendar, user-listing, free-slot or appointment GHL code exists anywhere.** `ABSENT`
for all four, and `ABSENT` for the modern LeadConnector host and for any OAuth flow.

**A correctness hazard for Phase 4, recorded not fixed:** the "Open in GHL" deep link is
duplicated verbatim across six frontend files, each with a hardcoded location id that is
**not** derived from the account the lead was routed to. The settings key holding the same
id is read by no link builder. So a contact that ever lands in a second sub-account would
be linked under the wrong location.

### 2.8 Appointments and calendars

Three appointment-like tables exist. The strategy-call table carries external provider ids;
the `appointments` table carries **none** — `ABSENT` — yet an admissions agent creates a
real Google event for each row it inserts and keeps the event id only in free text. Those
rows cannot be joined back to their calendar events.

`rescheduled` is **not** an allowed lifecycle value on any of the three tables, despite §12
asking for it. Double-booking protection is single-layered: one pre-insert re-check against
the provider, with no database uniqueness on any slot column, and the internal appointment
writer bypasses the check entirely. There is no calendar webhook receiver — `ABSENT`.

### 2.9 Sales and admin surfaces

**There is no per-human sales-rep configuration model.** `ABSENT`. No model is keyed to the
admin-user table as configuration. The nearest two are a brand × queue policy table, which
already holds daily capacity and one assignee and is wired into assignment, and a
knowledge-base contact directory that holds timezone, working hours and a calendar link but
has no account link, no brand and no capacity.

The routing table exists and **ships empty by design**:

`backend/src/seeds/growthJourney/policyDefinitions.ts:32` → "  assigned_to_id: null as string | null,"

So every handoff today lands queued and unassigned, which the seed's own comment calls the
honest state until Ali names someone.

Three disjoint role vocabularies exist. Notably `sales` is enforceable in middleware but is
not a role the role-assignment service will accept.

---

## Part 3 — Checkpoint questions, attempted against the repo first

§18 says to ask Ali only what remains truly undiscoverable. Three of the four narrow
sharply once the repo is read; the fourth is close to answered.

**Which brands should Rose initially own?** The repo spells the name **Roselen**, and she
exists only as knowledge-base seed data and in project-management scripts, with a role of
"Admissions & Sales" in a roster that records her as not yet provisioned. There is **no
admin-user row, no brand assignment, no queue assignee, no capacity, no CRM id and no
calendar id** for her anywhere. Four other people *are* provisioned with the sales role in
scripts — other people are provisioned with the sales role in three provisioning scripts
and she is in none of them. **Still a question for Ali**, but the answer is a brand
assignment, not a discovery.

**Which GHL sub-account/location is Rose using?** `ABSENT`. One non-default account key
exists and ships empty. **Still a question for Ali.**

**Does Rose already have an authoritative GHL user/calendar?** `ABSENT` — no staff model in
the repo has a CRM-id field at all, for anyone. The only calendar field for her is a
knowledge-base link, left unset. **Still a question for Ali.**

**Which paid offer is the primary conversion target for free learners?** **Mostly
answered.** Eleven offer families are declared, of which five are learner-side:

`backend/src/models/OfferFamily.ts:26` → "export type OfferFamilySlug ="

and the learner brand's policy allows exactly that learner set:

`backend/src/seeds/growthJourney/offerPolicyDefinitions.ts:128` → "offer_families: LEARNER_OFFER_FAMILIES,"

Four of the five are paid. So the question for Ali is not open — it is a choice among
**four named, already-legal options**: paid training, community subscription,
certification, internship. A deny in brand-offer policy is unconditional and outranks an
allow — and that is enforced, not merely documented:

`backend/src/services/growthJourney/offerEligibility.ts:137` → "return DENIED(brandId, offerFamily, 'explicit_deny', row.id);"

So whichever he picks is already enforceable.

---

## Part 4 — Findings that change how later phases should be planned

1. **Free-account creation does not reliably enter the Explorer lifecycle.** Two
   anonymous-reachable public paths write opposite flags; one population is invisible to
   the whole Explorer OS. This is Phase 2's central problem, not a detail.
2. **Person 360 suppresses the score the system exists to produce.** A person's stage is
   derived from the mere existence of an enrollment row by email, with no check of
   `enrollment_type`, `tier` or `payment_status`:

`backend/src/services/adminOs/personProfileService.ts:229` → "WHEN e.email IS NOT NULL THEN 'enrolled_student'"

   and that stage is treated as post-conversion, which nulls temperature and lead score
   **on the server**, not merely hiding them in the UI:

`backend/src/services/adminOs/personProfileService.ts:297` → "row.temperatureUpdatedAt = null;"

   with this explanation attached to the suppression:

`backend/src/services/adminOs/panels/acquisitionPanels.ts:92` → "+ 'someone is to convert, and this person already has.';"

   For an unpaid Explorer that sentence is false, and the suppressed population is exactly
   the one whose intent score is the point.
3. **Nothing re-ranks an open handoff**, so "live queue" cannot be built by sorting the
   existing value column — it needs a score that recomputes.
4. **The Governor can only choose a lesson**, because one of 21 asset types resolves.
   Richer journeys are a content-resolution problem before they are a decision problem.
5. **The human-ownership pause is enforced at three points, including immediately before
   send** — stronger than expected. The send-time check is the decisive one:

`backend/src/services/growthJourney/execution/planChecks.ts:90` → "if (evidence.human_conversation === 'yes') return { open: false, reason: 'human_in_conversation' };"

   The weakness is single-claimant safety, not the pause.

---

## Part 5 — Known limits of this inventory

- **It is a read of `origin/main` @ `541305a6`**, not of production. Nothing here was
  verified against the running system, and no production credential was used or minted.
- **Row counts and population facts** come from comments and tests in the code, not from
  querying the database. Where this document says a table is empty or a key ships empty, it
  means the seeded or default state in source. A live count would need database access this
  phase deliberately does not take.
- **The citation gate proves quotes are real, not apposite.** Three cited lines were
  re-read by hand to confirm each is the line that does the work rather than a signature or
  an import.
- **A backticked path with no line number is outside the gate.** Prose here names files
  that way, and those mentions are not evidence.
- **The seventeen `T-SCEN` scenarios are reported as "no test carries that identifier"**,
  which is weaker than "untested". Establishing real coverage is the harness task's job.
