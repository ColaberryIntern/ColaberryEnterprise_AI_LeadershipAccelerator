# Gap Matrix — original intent vs current behaviour vs disposition

**Phase 1, task 3.** Session `CC-20261005-r6h2`. Read against `origin/main` @ `541305a6`.

Every gap gets a disposition — **KEEP**, **FIX**, **BUILD** or **REMOVE** — and every BUILD
names the phase that owns it, so nothing is orphaned. Every REMOVE names what would break.

**On the two kinds of "intent".** Where intent comes from the original design document it is
cited like any other claim. Where it comes from Ali's build prompt
(`CLAUDE_CODE_EXPLORER_GROWTH_RESET_HITL_SALES.md`), it is referenced by section number and
**not** cited, because that document is not in the repo and the gate can only verify what is.
Those references are marked §N and should be read as "the prompt asks for", not as evidence.

---

## A · Entry and identity

### A1 — Free-account creation does not reliably enter the Explorer lifecycle
**Intent:** §1 makes successful free-account creation the canonical entry event.
**Current:** two anonymous-reachable public paths write opposite labels, and the Explorer OS
gates on only one of them.

`backend/src/services/explorerGrowth/explorerIdentityBridge.ts:122` → "where: { enrollment_type: 'explorer', status: 'active' },"

**Disposition: FIX — Phase 2.** The mechanism exists; one of two populations is excluded
from it. This is the single most consequential gap in the matrix.

### A2 — No canonical entry event, timestamp or emitter
**Intent:** §1 requires entry to be immediate and deterministic.
**Current:** `ABSENT` on all three. The de-facto timestamp is `enrollments.created_at`,
derived at read time under two different labels.
**Disposition: BUILD — Phase 2.** Smallest honest version is one column plus one emitted
event, not a new table.

### A3 — `pickBestEnrollment` prefers the row Explorer cannot see
**Intent:** one canonical row per person.
**Current:** explorer rows sort *after* non-explorer ones, so a person who used both public
paths logs in against the invisible row.

`backend/src/services/enrollmentPick.ts:38` → "e.enrollment_type === 'explorer' ? 1 : 0,"

**Disposition: FIX — Phase 2.** Must be fixed *with* A1, not before: changing the preference
while the guest population is still invisible moves the problem rather than solving it.

### A4 — Five identifier regimes, and an identity spine nothing reads
**Intent:** §5 says to consolidate using existing data rather than inventing another identity.
**Current:** email, `enrollment_id` over `lead_id`, `lead_id`, all-four-at-once, and visitor
fingerprint — plus a `persons` spine with a migration and no application reader.
**Disposition: FIX — Phase 2**, by declaring a precedence order and making the resolvers
agree. **Not BUILD**: adding a sixth regime is exactly what §5 forbids.

### A5 — `tier` is declared the source of truth for access and governs no gate
**Intent:** the model comment says `tier` is authoritative for access level.
**Current:** the paywall reads payment status, comp, staff and cohort type, never `tier`.

`backend/src/models/Enrollment.ts:211` → "// self-serve preview account (0 points, no cohort). Source of truth for"

**Disposition: FIX — Phase 2**, by correcting the comment or the code. Today a guest row is
gated because it is unpaid, not because it is a guest; had anything ever marked a guest paid,
the "source of truth" would have been bypassed silently.

---

## B · Person 360 and intelligence

### B1 — Person 360 suppresses the readiness score for the population it is about
**Intent:** §5 and §6 require one evidence view that carries intent and readiness.
**Current:** stage is derived from the existence of an enrollment row by email, with no check
of type, tier or payment, and post-conversion stages null the score on the server.

`backend/src/services/adminOs/personProfileService.ts:229` → "WHEN e.email IS NOT NULL THEN 'enrolled_student'"

**Disposition: FIX — Phase 2.** The narrowest correct change is to the stage derivation, not
to the suppression rule: suppressing intent for someone who really has converted is right.

### B2 — Explorer E/I/F does not reach Person 360
**Intent:** §5 lists Explorer scores, affinities, state and overlays as part of the package.
**Current:** the profile type carries none of them.
**Disposition: BUILD — Phase 2.** A read-side join, not a second store.

### B3 — Two Person 360 assemblers that do not know about each other
**Intent:** §5 says explicitly not to create a second profile that drifts.
**Current:** there are already two.
**Disposition: FIX — Phase 2.** Name one canonical and make the other delegate or retire.
**Would break if removed outright:** the older one has its own consumers; retiring it blind
is the "stale branch reverts later work" failure this repo has already paid for.

### B4 — No lifecycle stage for Explorer or guest
**Intent:** the lifecycle module claims to be the single definition every dashboard imports.
**Current:** nine stages, none of them Explorer, while the Explorer vocabulary is a parallel
set nothing in the admin tree imports.
**Disposition: FIX — Phase 2**, by adding the stage to the one canonical list.

---

## C · Content and experiences

### C1 — 21 asset types declared, one ever written
**Intent:** §13 names twenty content domains to connect.
**Current:** the only writer hardcodes one kind.

`backend/src/services/explorerGrowth/content/syncTimelineCards.ts:226` → "('LESSON', :source_system, :source_id, :title, :summary, :url,"

**Disposition: BUILD — Phase 5.** Resolvers for the kinds with authoritative sources.
**Explicitly not all twenty:** §13 says to keep a named gap where no authoritative source
exists rather than inventing content.

### C2 — Four Explorer content purposes and all three journey purposes are declared dead ends
**Intent:** §13 wants the Governor choosing richly.
**Current:** the code records the gap and refuses rather than substituting — which is correct
behaviour, and is why the Governor can only choose a lesson.
**Disposition: KEEP the refusal, BUILD the sources — Phase 5.** The refusal mechanism is the
good part and must survive.

### C3 — Zero brand-scoped content rows
**Intent:** multi-brand journeys.
**Current:** every non-Training brand resolves nothing.
**Disposition: BUILD — Phase 5.**

### C4 — The weekly digest is a campaign name, not an assembly
**Intent:** §15 requires a real weekly assembly from authoritative sources, enforced as a
weekly delivery slot.
**Current:** a one-step sequence; the Governor's selected assets are never passed to the
send; and nothing enforces weekliness — a generic contact policy bounds frequency instead.

`backend/src/services/growthJourney/execution/enrollmentAdapter.ts:202` → "await enrollLeadInSequence(leadId, campaign.sequence_id, campaign.id);"

**Disposition: BUILD — Phase 5.** Two distinct pieces: an assembly step, and a delivery-slot
check. Neither is a new campaign.

### C5 — Event attendance cannot be derived
**Intent:** §14 wants attended and no-show to become evidence immediately.
**Current:** attendance availability is hardcoded false, with an explicit instruction never
to read absence as non-attendance.
**Disposition: BUILD — Phase 5**, and the instruction is **KEEP**: inferring a no-show from
missing data is exactly the fabrication the standing constraints forbid.

---

## D · Sales queue and readiness

### D1 — Three different orderings for one queue, none readiness-first
**Intent:** §6 requires `readiness_score DESC` with deterministic tiebreakers.
**Current:** SQL ordering with no `NULLS LAST` and no unique tiebreaker; an in-memory
comparator that treats NULL as the opposite; and a digest ranking on a different column.

`backend/src/controllers/growthJourneyHandoffController.ts:57` → "export const HANDOFF_QUEUE_ORDER"

**Disposition: FIX — Phase 3.** One ordering, one place.

### D2 — The ranked assignment pass has no `ORDER BY`
**Intent:** deterministic assignment.
**Current:** a bounded fetch with no ordering, so which rows get ranked is arbitrary past the
bound.
**Disposition: FIX — Phase 3.** A one-line fix with a real correctness consequence.

### D3 — Nothing re-scores an open handoff
**Intent:** §9 requires the queue to react to meaningful events.
**Current:** the value column is computed once at creation.
**Disposition: BUILD — Phase 3.** This is why "live queue" cannot be built by sorting the
existing column.

### D4 — No Sales Readiness Score exists
**Intent:** §6, explicitly not the legacy lead score.
**Current:** `ABSENT`. Two unrelated scoring systems exist — Explorer E/I/F and the legacy
lead score — with different keys, populations and scales.
**Disposition: BUILD — Phase 3**, in shadow mode with provisional weights, per §6.

### D5 — The human's own moves are not race-safe
**Intent:** §2 requires that a second rep cannot claim the same open lead.
**Current:** accept, disposition and release use an unconditional update with an in-memory
guard and no transaction. The race-safe pattern exists elsewhere in the same subsystem.
**Disposition: FIX — Phase 4.** Reuse the pattern already present; do not invent a lock.

### D6 — `no_contact` and `disqualified` write no suppression record
**Intent:** §2 requires `no_contact` to preserve suppression.
**Current:** only the handoff row, an outcome row and a ledger row.
**Disposition: FIX — Phase 4.** **Must not become a second opt-out store** — the standing
constraints forbid a second suppression mechanism, so this routes into the existing one.

### D7 — Five of six dispositions are unreachable from the UI
**Intent:** §8 lists disposition as a primary action.
**Current:** the detail page hardcodes one.

`frontend/src/pages/admin/HandoffDetailPage.tsx:231` → "onClick={() => move('Disposition', () => dispositionHandoff(id, { disposition: 'qualified', reason }))}>"

**Disposition: FIX — Phase 4.** The API already accepts all six.

---

## E · Rep model and routing

### E1 — No per-human rep configuration model
**Intent:** §7 requires rep config supporting brand assignments, queues, timezone, capacity
and external CRM ids, with Rose as rep #1 rather than a special case.
**Current:** `ABSENT`. The nearest is a brand × queue policy table holding capacity and one
assignee, already wired into assignment.
**Disposition: BUILD — Phase 4**, but **narrowly**: §7 says to introduce a dedicated model
only if the existing one cannot safely hold the data. Brand, queue and capacity already have
a home; timezone, availability and CRM ids do not.

### E2 — The routing table ships empty, so every handoff lands unassigned
**Intent:** §7 wants configuration to determine routing.
**Current:** by design, no assignee is seeded.

`backend/src/seeds/growthJourney/policyDefinitions.ts:32` → "  assigned_to_id: null as string | null,"

**Disposition: KEEP the design, CONFIGURE in Phase 4.** The seed comment is right that an
unassigned queue is the honest state until a human is named. This is a data gap, not a code
gap, and it is one of the checkpoint questions.

### E3 — `sales` is enforceable in middleware but not assignable
**Intent:** one coherent role model.
**Current:** middleware recognises the role; the role-assignment service's union does not
contain it.
**Disposition: FIX — Phase 4.** **Not a new RBAC role** — the standing constraints forbid
adding one; this is making two existing vocabularies agree.

---

## F · GHL, calendar, appointments

### F1 — No GHL calendar, user, slot or appointment capability
**Intent:** §10 lists eleven adapter capabilities.
**Current:** `ABSENT` for all of them; six contact endpoints on the v1 API.

`backend/src/services/ghlService.ts:54` → "const GHL_BASE = 'https://rest.gohighlevel.com/v1';"

**Disposition: BUILD — Phase 4**, as a bounded adapter. **KEEP the v1 contact sync
untouched** — §10 says so explicitly, and rewriting it while adding calendars is how both
break at once.

### F2 — The "Open in GHL" link is duplicated six times with a hardcoded location
**Intent:** §11 requires the correct sub-account and a tested resolver.
**Current:** six copies of a constant location id, none derived from the routed account.
**Disposition: FIX — Phase 4.** Today it is latent because no lead reaches a second account;
the moment F4 is configured it becomes a wrong-account link.

### F3 — No retry on any GHL call
**Intent:** the repo's own Failure-First rules require a documented retry policy at every
external boundary.
**Current:** one fetch, a 15-second timeout, no backoff.
**Disposition: FIX — Phase 4.**

### F4 — The only non-default GHL account key ships empty
**Current:** both routed source groups resolve to `unconfigured` and are withheld.
**Disposition: CONFIGURE — Phase 4**, and **KEEP fail-closed**:

`backend/src/services/leads/ghlAccountRouting.ts:95` → "return { status: 'unconfigured', accountKey, settingKey };"

### F5 — A corrupt route map fails open to the default account
**Current:** a deliberate choice with a test asserting it.
**Disposition: FIX — Phase 4.** A fail-open path inside a fail-closed design contradicts the
standing constraint, and the standing constraint should win.

### F6 — The internal appointment table has no provider id
**Intent:** §12 requires a mirror carrying external ids for audit and reconciliation.
**Current:** `ABSENT`, while an agent creates a real calendar event per row and keeps the id
in free text.
**Disposition: FIX — Phase 4.** Additive column, not a new table.

### F7 — `rescheduled` is not a lifecycle value anywhere
**Intent:** §12 lists it.
**Current:** absent from all three appointment tables; `cancelled` is deliberately unmapped
in the outcome normaliser.
**Disposition: BUILD — Phase 4.**

### F8 — Double-booking protection is single-layered and bypassable
**Current:** one pre-insert provider re-check, no database uniqueness, and the internal
writer skips the check.
**Disposition: FIX — Phase 4.**

---

## G · Real-time

### G1 — The only SSE implementation serves the wrong domain
**Intent:** §9 says to reuse the pattern but not to couple sales to an unrelated event bus.
**Current:** one transport, participant-authenticated, project-scoped, carrying
cognitive-governance events.

`frontend/src/hooks/useRealtimeAwareness.ts:54` → "const src = new EventSource(url, { withCredentials: true });"

**Disposition: BUILD — Phase 4**, reusing the transport's shape and discipline with a sales
event type and guard. **REMOVE nothing** — the existing stream has its own consumers.

### G2 — The handoff queue has no refresh mechanism at all
**Current:** a manual reload button.

`frontend/src/components/growthJourney/HandoffsTab.tsx:115` → '            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={state.reload}>'

**Disposition: BUILD — Phase 4.** §22 forbids calling a manually refreshed queue "live".

---

## H · Testing and evidence

### H1 — The original plan's seventeen named scenarios do not exist as tests
**Intent:** the design document says they all become named tests.

`docs/EXPLORER_GROWTH_OS_PLAN.md:1719` → "### 31.2 The 17 critical scenarios (from the brief) — all become named tests"

**Current:** the literal appears zero times in `backend/src`, `frontend/src` or `tests`
(positive control: the same grep form matches a known symbol in 8 files).
**Disposition: BUILD — Phase 6**, mapped through the acceptance harness. The honest claim is
that no test carries those identifiers, not that the behaviours are untested.

### H2 — The original design document is stale in places
**Current:** its scenario-8 note describes a defect that is fixed.
**Disposition: KEEP as history, do not treat as current.** `NORTH_STAR.md` supersedes it for
anything a later phase or test references.

---

## Disposition counts

**36 gaps, 36 disposition lines.** Counted by taking the FIRST disposition keyword on each
line as that gap's primary disposition, which is the only unambiguous rule: five lines carry
a second keyword because the mechanism is right while the data or coverage is missing.

| Primary disposition | Count |
|---|---|
| FIX | 18 |
| BUILD | 14 |
| KEEP | 3 |
| CONFIGURE | 1 |
| REMOVE | **0** |
| total | 36 |

The five dual-disposition gaps are C2 (KEEP the refusal, BUILD the sources), C5 (BUILD the
derivation, KEEP the refusal to infer), E2 (KEEP the design, CONFIGURE the data), F1 (BUILD
the adapter, KEEP the v1 sync untouched) and F4 (CONFIGURE the key, KEEP fail-closed).

*The first version of this table said FIX 16, BUILD 11, KEEP 5, CONFIGURE 2 — all four
wrong, because I wrote the numbers before counting and because a naive grep double-counts
every dual-disposition line. The numbers above are computed, and the rule for computing them
is stated so the count can be re-derived rather than trusted.*

**REMOVE is zero, and that is the finding.** This is a reconciliation, not a demolition:
nothing in the current implementation needs deleting. Eighteen things need correcting,
fourteen need building, one needs configuring, and three existing behaviours need
protecting. A matrix full of REMOVE rows would have meant the prior work was wrong. It was
not — it was unfinished at the seams, which is a very different thing and much better news.

## Phase ownership

| Phase | Gaps it owns |
|---|---|
| 2 — free-account entry + Person 360 | A1, A2, A3, A4, A5, B1, B2, B3, B4 |
| 3 — Sales Readiness Score | D1, D2, D3, D4 |
| 4 — Sales Command Center, GHL, calendar | D5, D6, D7, E1, E2, E3, F1–F8, G1, G2 |
| 5 — experience library + weekly digest | C1, C2, C3, C4, C5 |
| 6 — shadow validation + activation | H1 |
| none — history | H2 |

**No gap is unowned.** Phase 4 carries the most, which matches §18's shape: it is the phase
that turns the queue into an operating surface.
