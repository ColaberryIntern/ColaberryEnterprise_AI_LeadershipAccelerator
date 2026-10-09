# Phase 1 Checkpoint — Reconciliation and North Star Lock

**Session** `CC-20261005-r6h2` · **Date** 2026-10-05 (Central) · **Branch**
`workstream/growth-os-reset-phase1` · **Score 90 / 100**

Visual companion: `docs/growth-os-reset/PHASE_1_CHECKPOINT.html`.

---

## A · What this phase was supposed to accomplish

Stop the drift before changing more code. Read the original Explorer Growth design, the
current Explorer and Growth Journey implementations, campaign definitions, the content
registry, the human handoff system, the GHL integration, appointments and calendars, and the
sales and admin surfaces — then produce a source-of-truth architecture map, a gap matrix, a
resolution of the four-way semantic conflict around Explorer entry, contracts for the sales
rep model, the readiness score, the GHL calendar boundary and the human-ownership pause, an
acceptance harness of at least twelve representative journeys, and a North Star document that
later phases and tests reference. Mass-create no campaigns, activate no sending, create no
production GHL appointment, redesign no admin page, and invent no data to resolve uncertainty.

## B · What actually shipped

Verifier scores are the real ones. Where a task is ungraded, it says ungraded.

Evidence is given as the commit **subject**, not its SHA. Branch SHAs changed twice during
this phase because `main` moved under it and it was rebased; a SHA written here would have
been stale by the time you read it, and a stale identifier in a verification table is the
exact defect this phase has been correcting all day. The branch head at the time of writing
is `202c02c8`, and it will change again when this merges.

| Task | Artifact | Result | Evidence (commit subject) |
|---|---|---|---|
| — (enabling) | citation gate + CI wiring | **PASS 12/12** on attempt 3 | *Close the one way this gate could approve a fabricated quotation*; attempts graded 10/12 and 9/12 preceded it, both fixed |
| 1 | `CURRENT_STATE_INVENTORY.md` | **FAIL 10/12**, retry committed, **ungraded** | *Phase 1 inventory …* → *Inventory retry: give every claim the line that does the work* |
| 2 | `ARCHITECTURE_MAP.md` | shipped, **ungraded** | *Architecture map and gap matrix …* |
| 3 | `GAP_MATRIX.md` | shipped, **ungraded** | *Architecture map and gap matrix …* |
| 4 + 5 | `EXPLORER_ENTRY_SEMANTICS.md` | shipped, **ungraded** | *Explorer entry semantics: the data model is right, the writers are wrong* |
| 6 | `SALES_REP_CONTRACT.md` | shipped, **ungraded** | *Rep configuration and readiness score contracts* |
| 7 | `SALES_READINESS_SCORE_CONTRACT.md` | shipped, **ungraded** | *Rep configuration and readiness score contracts* |
| 8 | `GHL_CALENDAR_BOUNDARY.md` | shipped, **ungraded** | *GHL boundary, ownership-pause contract, and the acceptance harness* |
| 9 | `HUMAN_OWNERSHIP_PAUSE_CONTRACT.md` | shipped, **ungraded** | *GHL boundary, ownership-pause contract, and the acceptance harness* |
| 10 | `ACCEPTANCE_HARNESS.md` | shipped, **ungraded** | *GHL boundary, ownership-pause contract, and the acceptance harness* |
| 11 | `NORTH_STAR.md` + the HTML | shipped, **ungraded** | *North Star reference, and a visual whose figures cannot drift* |

**Two of eleven artifacts were graded by a verifier that did not write them.** Nine are
committed and ungraded. That is the −7 deduction in the score, not a footnote.

**Shared evidence across all of them:** 125 citations resolve with **zero drift**, 12 HTML
figures trace to a source document, and the diff is 15 files with **zero deletions**, nothing
outside the path allowlist. All re-run after the last edit, and re-run again after rebasing
onto a main that moved twice during the phase.

## C · Architecture changes

**None.** No backend service, controller, route, model, migration, frontend component or flag
default was modified. The only executable change is a new documentation checker and two added
steps in an existing CI job.

What changed is the *written* architecture: twelve nodes now have a named owner, 36 gaps have
a disposition and an owning phase, and six decisions resolve the entry semantics the next
phase depends on.

## D · Screens and UI

**No application screen changed.** One artifact is built to be looked at:

`docs/growth-os-reset/PHASE_1_CHECKPOINT.html` — the score and its two deductions, the
headline findings, the gap dispositions, phase ownership, the twelve-node map and the
acceptance-harness counts. Self-contained, works in light and dark.

**What to click:** open that file. Every figure on the page is traceable to a sibling
document, and the repository check enforces it, so the visual cannot drift from the documents
it summarises.

## E · Data and behaviour verification

No data was written and no behaviour exercised, because the phase changes neither. What was
verified instead:

- **125 citations** resolve against `origin/main`, with zero drift, re-run after the last edit.
- **The gate is proven able to fail**, by mutation, by name: mutating a literal in a committed
  document produced `literal not found anywhere in …` and exit 1, restored by string-replace
  with a matching md5. Mutating only the line number exits 0 with a drift note — which is the
  design, and is why the mutation proof had to be re-aimed at the literal.
- **The HTML figure rule** was mutation-proved on first use: an injected figure present in no
  markdown was caught by name.
- **Two counted claims carry positive controls.** The original design's seventeen named
  scenarios appear zero times in the codebase, against a control of a known symbol matching 8
  files. Twenty-one asset types are declared and one is ever written.
- **Scope containment:** 15 files, zero deletions, zero paths outside the allowlist.

## F · Production state

| | |
|---|---|
| Commit | `202c02c8` at the time of writing; it changes on merge |
| PR | opened at the end of this phase — see §J |
| Deploy status | **nothing deployed.** No runtime artifact exists to deploy |
| Production surface | **unchanged** |
| Feature flags | **unchanged.** No default moved |
| What is live | **nothing new.** One added CI check, which runs on pull requests |
| What remains dark | everything Phases 2–6 will build |

Stated plainly because the prior run's worst failure was in exactly this section: **merged is
not deployed, and nothing here is either.**

## G · Drift check

**1 · Does free-account registration still define Explorer entry?**
In the North Star, yes, and it is now written down as the canonical event. **In code, no** —
two public paths write opposite labels, and the Explorer OS gates on only one of them:

`backend/src/services/explorerGrowth/explorerIdentityBridge.ts:122` → "where: { enrollment_type: 'explorer', status: 'active' },"

so one whole population is invisible to it. That is the phase's central finding and Phase 2's
central problem.

**2 · Can we answer "Who is this?" better than before?**
Not yet in the product. But we now know why we cannot: Person 360 exists twice, carries no
Explorer intelligence, and derives a person's stage from the bare existence of an enrollment
row — which suppresses the intent score for precisely the population whose intent is the point.

**3 · Did this phase improve the learner's actual experience, or only add infrastructure?**
**Neither.** It changed no runtime behaviour at all. A reconciliation phase that claimed
learner impact would be lying about its purpose. The honest defence is that Phase 2 would
otherwise have built on a free-account entry path that silently excludes half its population.

**4 · Did we preserve one clear owner for each decision?**
Yes, and sharpened it: the Governor owns the next action, brand-offer policy owns legality, the
queue policy owns assignment, and the journey programme owns which journey applies. Six
decisions in the entry document exist specifically so two columns stop half-answering one
question.

**5 · Can a human take over without AI competing?**
**Today, mostly yes** — and that was the surprise. The pause is enforced at three points,
including immediately before the send on freshly re-resolved evidence:

`backend/src/services/growthJourney/execution/planChecks.ts:90` → "if (evidence.human_conversation === 'yes') return { open: false, reason: 'human_in_conversation' };"

What a human cannot yet do safely is *claim*: two concurrent accepts both succeed and the
second overwrites the assignee.

**6 · Did we add any duplicate system, table or score that should have been reused?**
No. The only new executable is a documentation checker. Every contract explicitly reuses:
the entry event reuses a signal name already in the catalogue, the claim fix reuses a
conditional-update pattern already in the same subsystem, `no_contact` routes into the
existing suppression store, and the rep model takes only the seven fields with no existing
home.

**7 · Is the system closer to paid conversion?**
Not mechanically. It is closer in one practical way: the primary conversion target is now a
choice among four already-legal offer families rather than an open question, so the decision
Ali makes is immediately enforceable without code.

**8 · What still prevents a rep from acting on the best lead immediately?**
Four things, each now owned: no readiness score exists, so "best" is undefined; the queue's
ordering puts unvalued handoffs above valued ones and pages unstably; nothing recomputes an
open handoff as new signals arrive; and the queue has a manual reload button and no stream.

### Score: 90 / 100

Computed against the published rubric in `NORTH_STAR.md` §6, whose arithmetic is checkable:
weights sum to 100, awarded sums to 90, deductions 3 + 7 = 10.

- **−3 · the gate cannot catch a fabricated count.** It proves a quoted literal is real,
  findable and unique, and says nothing about a number written in prose. I published three
  invented counts during this phase, each corrected in the record.
- **−7 · nine of eleven artifacts are not independently graded.** Verification was batched to
  keep the phase to one sitting. Recoverable without rework.

## H · Known gaps

Nothing hidden behind "future work".

1. **Nine of eleven artifacts are ungraded.** The largest known gap in the phase.
2. **The acceptance harness is a spec, not a suite.** Nothing is proven executable.
3. **Six of eleven GHL capabilities have no documented path confirmed**, and the calendar scope
   names are `UNVERIFIED`.
4. **28 `ABSENT` and 15 `UNVERIFIED` markers** across the documents — each a real gap, counted
   by the gate so they cannot hide.
5. **Seven of nineteen journeys have no equivalent coverage today.**
6. **Nine original scenarios have no home in the current journey list.** Seven are send-path
   safety invariants that must be confirmed in Phase 6 rather than assumed.
7. **No production read was taken.** Every absence finding is source-level; a live database
   could hold rows no seed creates.
8. **The gate does not guard the session log or commit bodies**, which is where all three
   fabricated counts occurred.
9. **One deliberate fail-open sub-case survives** in GHL routing: a corrupt route map degrades
   to the default account. Disclosed, owned by Phase 4.

## I · Decisions needed before Phase 2

Three genuinely need you. Each is a value, not a discovery — the repo was searched first.

1. **Which brands should the first rep own?** The name in the repo is spelled **Roselen** and
   appears only in knowledge-base seed data and project-management scripts. No account, brand,
   queue, capacity or CRM identifier exists for her.
2. **Which GHL sub-account and location does she use?** One non-default account key exists and
   ships empty.
3. **Does she already have an authoritative GHL user and calendar?** No staff model in the repo
   has a CRM-identifier field at all, for anyone.

And one that has **shrunk to a multiple choice** rather than remaining open:

4. **Which paid offer is the primary conversion target for free learners?** The learner brand's
   policy allows exactly five learner offer families, four of them paid: **paid training,
   community subscription, certification, internship.** A deny in that policy is unconditional,
   so whichever you pick is enforceable without code.

## J · Exact next-phase proposal

**Phase 2 — Canonical free-account entry and Person 360.** It owns 9 of the 36 gaps.

**What it will do:** make both public free-account paths write a consistent pair so the
portal-signup population stops being invisible; add one set-once entry timestamp and wire the
signal name that already exists in the catalogue; fix the enrollment-preference order so the
canonical row is the one Explorer can see; correct the stage derivation so an unpaid Explorer
stops being treated as converted and losing their intent score; bring Explorer intelligence
into Person 360 as a read-side join; name one canonical Person 360 assembler; add the missing
lifecycle stage; and backfill, as a migration with a dry run and a reversible plan.

**What it will explicitly not do:** adopt the unused `persons` identity spine (recorded as the
Phase 6 target — adopting an unread spine mid-reconciliation is larger than Phase 2 can
verify); build the readiness score; touch the queue; touch GHL; or create a sixth identifier
regime.

**Phase 2 does not start without your explicit word.** That is the §0 rule for this project and
it holds here.
