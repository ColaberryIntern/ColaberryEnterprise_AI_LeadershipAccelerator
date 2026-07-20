# Architect Mindset / The Architect Time Machine: Curriculum Specification

> **Status:** Phase 1 (Documentation + Design). Conforms to `00-canonical-decisions.md` (Source of Truth).
> **Session:** CC-20260720-am01 · **Date:** 2026-07-20 · **DRI:** Ali Muwwakkil (ali@colaberry.com)
> Every identifier, weight, dimension, stage name, state, and configuration value in this document is
> inherited verbatim from the canonical file. If anything here appears to diverge, the canonical file
> wins and this file is the defect. Titles and principles (canonical §3) are quoted verbatim.

---

## Overview

**Architect Mindset** (student-facing: **The Architect Time Machine**) is a 13-part weekly series that
delivers the lessons an architect usually earns only through years of project scars, and delivers them
early. The tagline states the intent plainly: *Gain the lessons experience usually teaches too late.*
Each week is not a lecture and not a quiz. It is a single, self-contained interactive architectural
simulation: the student is handed a deceptively simple request, acts on it, then is pulled backward and
forward through time to witness the full system the request was actually hiding and the consequences of
the choices they made. The series exists because architectural judgment is a way of seeing, not a stack
of tools, and because AI now lets us expose that way of seeing before a decade of production incidents
does it the slow way.

### The weekly experience: the Time Machine Loop (16 steps)

The weekly experience is **one interactive simulation** run through a fixed, named flow: **the Time
Machine Loop (16 steps)**. The Loop is the student-facing framing of the LOCKED 24-state experience
machine in canonical §4. The 24 states remain authoritative for persistence and transition validation;
the 16 steps are how the student experiences them. The mapping is exact and never contradicts the state
machine:

| # | Loop step (student-facing) | Canonical state(s) (§4) |
|---|---|---|
| 1 | Arrival (time-tunnel entry) | `arrival` |
| 2 | The Request | `request_viewed` |
| 3 | First Decision (draft) | `first_decision_draft` |
| 4 | First Decision (submit) | `first_decision_submitted` |
| 5 | Zoom-Out / System Reveal | `zoom_out_in_progress` → `zoom_out_complete` |
| 6 | Architect Interview, Part 1 | `interview_part_1_in_progress` → `interview_part_1_complete` |
| 7 | Architecture Selection | `architecture_selected` |
| 8 | Consequence Simulation | `consequence_in_progress` → `consequence_complete` |
| 9 | Architect Interview, Part 2 | `interview_part_2_in_progress` → `interview_part_2_complete` |
| 10 | Re-Architecture (draft) | `rearchitecture_draft` |
| 11 | Re-Architecture (submit) | `rearchitecture_submitted` |
| 12 | Experience Receipt | `receipt_unlocked` |
| 13 | Architect Decision Record | `adr_generated` |
| 14 | Project Transfer | `project_transfer_in_progress` → `project_transfer_complete` |
| 15 | Mindset Evaluation | `evaluation_pending` → `evaluation_complete` |
| 16 | Completion & Ledger Update | `completion_eligible` → `completed` |

The retry and error branches (`not_started`, `evaluation_failed_retryable`, and the retry return path)
sit outside the 16 happy-path steps and are handled by the state machine exactly as canonical §4
specifies. Draft steps (3, 10) autosave but never count as completion.

### What every week produces

Every scored week (Weeks 1 through 12) produces the six persisted artifacts declared in the curriculum
type outputs (canonical §2), in this order:

1. **Architect Interview responses** (`interview_responses`): initial and revised answers, per question.
2. **Architect Decision Record (ADR)** (`architect_decision_record`): a structured, student-owned record, persisted as a `PortfolioArtifact` of `kind: 'architecture_decision'` (canonical §6.1).
3. **Mindset Score** (`mindset_score`): transparent dimension breakdown, total, stage, and delta from the initial response.
4. **Mindset Ledger update** (`mindset_ledger_delta`): the cumulative contribution to the enrollment's derived Mindset Ledger.
5. **Project-transfer reflection** (`project_transfer`): that week's lesson applied to the student's own personalized project.
6. **Experience Receipt** (`experience_receipt`): the patterns and perspectives represented, the illustrative estimate, and the mandatory qualification.

### Week 0 is the baseline; Week 1 is the first scored lesson

**Week 0 is baseline and unscored** (canonical §3, §9). It exists to introduce the whole series and to
demonstrate the Time Machine format itself. It runs the same Loop, but instead of a numbered ADR and a
formal Mindset Score it produces a **baseline Mindset observation** (not a score) and an **Architect
Commitment** (the student's baseline decision record), plus the student's first Mindset Ledger entry.
Week 0 is explicitly not counted as the first official weekly score. **Week 1 is the first formally
scored lesson** and the first to author a numbered ADR (ADR-001).

### Experience compression is a communication device, not a claim

Every Experience Receipt carries an illustrative estimate of the real-world patterns a week represents,
governed by the ETHICS-GATED compression model (canonical §8). The estimate uses the fixed rubric
(major project cycle 600h, major incident 120h, distinct role perspective 80h, significant
architectural tradeoff 50h, lifecycle stage 100h, major redesign 400h) and is **always** paired with
this label, verbatim:

> *Illustrative · Scenario-based · An estimate of patterns represented · Not employment experience
> earned · Not a guarantee of competence or job readiness.*

We never claim a 25-minute experience confers thousands of hours of real employment. The Experience
Compression Ratio (represented-hours ÷ lesson-hours) is shown as a vivid illustration of density, never
as evidence of earned competence, and it is always shown next to the sentence: *"This represents
patterns studied, not employment experience earned."*

### The student's own project runs through all 13 weeks

Every week ends with a **Project Transfer** step that turns that week's lens onto the student's own
personalized project. Week 0 captures the baseline; Weeks 1 through 12 compound one architectural lens
at a time onto the same real project. By Week 12 the student has applied all eleven prior lessons to
their own system and made a final, whole-horizon decision about it.

---

## Per-week specifications (Weeks 0 through 12)

Titles and principles below are quoted verbatim from canonical §3 and are LOCKED. ADRs are numbered
ADR-001 (Week 1) through ADR-012 (Week 12); Week 0 produces the Architect Commitment in place of a
numbered ADR. Durations conform to canonical §2 (`est_minutes: 28` for Weeks 1 through 12; Week 0
authored to about 13 minutes). All represented-hours figures are illustrative and carry the standard
qualification.

---

### WEEK 0: "You Don't Become an Architect by Learning More Tools" (baseline, unscored)

**Principle (LOCKED):** An architect sees the entire system surrounding the requested feature. (Series
intro plus format demo; baseline only, not a scored lesson.)

**Purpose.** Week 0 does two jobs at once: it introduces the entire series and it demonstrates the Time
Machine format so the student knows exactly what every future week will feel like. Before the simulation
begins, Week 0 explains, in plain professional language:

- **What the series is:** thirteen weekly interactive simulations that expose the difficult system
  lessons normally learned only through years of project experience.
- **Why architectural mindset matters:** systems fail not because people cannot use tools, but because
  they cannot see the whole system a request implies. Mindset, not tooling, separates a builder from an
  architect.
- **Why years of experience mattered so much:** experience is how most people eventually learn to see
  hidden users, hidden data, hidden decisions, and hidden operational cost, usually the hard way, one
  incident at a time.
- **How AI exposes patterns earlier:** AI can simulate the hidden system and its consequences on demand,
  so a student can encounter, in minutes, the shape of lessons that used to require years of scars.
- **What experience compression does and does NOT mean:** it means the student studies the *patterns*
  that real experience contains, compressed into a guided simulation. It does **not** mean the student
  has earned real employment experience, competence, or job readiness. (This is the ETHICS-GATED model
  of canonical §8, stated to the student up front.)
- **What the student does each week:** receives a deceptively simple request, makes a first decision,
  zooms out to see the real system, is interviewed, chooses an architecture, watches the consequences,
  is interviewed again, re-architects, and reflects onto their own project.
- **What artifacts they produce:** the six weekly outputs listed in the Overview (interview responses,
  ADR, Mindset Score, Ledger update, project-transfer reflection, Experience Receipt), with Week 0
  producing the baseline variants (baseline observation and Architect Commitment).
- **How the Mindset Ledger grows:** each week adds a cumulative, derived record of principles
  internalized, decisions made, assumptions discovered, and dimension scores over time.
- **Why the student's own project is used throughout:** the point is not to admire a fictional system
  but to change how the student sees their own real work, week after week.

**Deceptively simple request.** *"Build an AI assistant that answers employee questions using company
documents. We need a demonstration in two weeks."* The system as described contains exactly three
things: an **Employee**, an **AI assistant**, and **Company documents**.

**First-decision options (Loop step 3-4).** The student must choose where they would start. Each is a
plausible professional instinct, not a trap:

- Choose the AI model.
- Build the chat interface.
- Upload the company documents.
- Ask more questions about the system.
- Create a project plan.
- Start a proof of concept.
- "I would do something else" (requires a written explanation).

**Hidden system (the zoom-out, Loop step 5).** The simulation then reveals the system the request was
actually describing, across four layers:

- **People (users/roles):** full-time employees, contractors, managers, executives, HR, Legal, IT
  support, administrators.
- **Information (data classes):** employee handbook, benefits, compensation policies, performance
  information, legal policies, security procedures, customer information, internal strategy, outdated
  versions, draft documents, conflicting documents.
- **Decisions:** a low-risk factual answer; personal information retrieval; policy interpretation;
  legal or employee-relations escalation; an unauthorized request; and the case of insufficient
  evidence requiring abstention.
- **Operations:** document ownership, content updates, access changes, logging, monitoring, incident
  response, cost, model changes, human escalation, and long-term maintenance.

**Stakeholders.** HR, Legal, IT support, security/administration, managers, executives, contractors,
and the full-time employees who will actually ask the questions.

**Signature reveals (verbatim, Loop step 5).**

- *"The request contained one user. The real system contained at least eight roles."*
- *"The request contained one source called 'company documents.' The real system contained multiple
  information classes, owners, permissions, and conflicting versions."*
- *"The assignment was described as question answering. It was actually an identity, access, policy,
  evidence, governance, and operational system."*

**Architect Interview (Loop steps 6 and 9).** Eight questions, each offering plausible professional
multiple-choice options plus an "I see it differently / write my own" custom option (custom answers must
be meaningful and non-empty per canonical §5, gate 5). The options are realistic instincts, not
one-obvious-answer plus absurd distractors:

1. **What did you focus on when you first received the request?**
   - The AI model and the technical approach for answering accurately.
   - The chat interface and how employees would interact with it.
   - Getting the company documents loaded so the assistant had something to answer from.
   - The two-week timeline and what could realistically be demonstrated.
   - The people and policies the request quietly assumed.
   - I see it differently / write my own.

2. **Which newly revealed part of the system changed your thinking the most?**
   - That "employees" was actually eight or more distinct roles with different rights.
   - That "company documents" held conflicting, draft, and outdated versions.
   - That some questions require decisions the AI should never make alone.
   - That someone has to own, update, and monitor the system after launch.
   - That sensitive information (compensation, performance, legal) was in scope.
   - I see it differently / write my own.

3. **What assumption in the original request created the greatest risk?**
   - That every employee should see the same answer to the same question.
   - That "company documents" were a single, trustworthy, current source.
   - That answering questions was a low-risk, purely factual task.
   - That a two-week demonstration was the same as a production system.
   - That the assistant could operate without a defined owner.
   - I see it differently / write my own.

4. **Which decision should the AI be prohibited from making alone?**
   - Interpreting policy in a disputed or ambiguous situation.
   - Releasing personal information (compensation, performance, medical).
   - Handling legal or employee-relations matters.
   - Acting on a request the person is not authorized to make.
   - Answering when the available evidence is insufficient.
   - I see it differently / write my own.

5. **What would you need to observe after launch?**
   - Whether answers were correct, and how often they were confidently wrong.
   - Which questions were escalated to a human, and whether escalation completed.
   - Who accessed what information, and whether that access was appropriate.
   - Cost, latency, and reliability over time.
   - Where users abandoned, got stuck, or lost trust.
   - I see it differently / write my own.

6. **Who should own the system after the demonstration?**
   - IT, as the technical operator of the platform.
   - HR, as the owner of the employee information and policy content.
   - A shared owner: HR owns content, IT operates, Legal governs the sensitive areas.
   - The team that built the demonstration.
   - No single owner is needed until it becomes a real product.
   - I see it differently / write my own.

7. **What is the difference between building the assistant and architecting the assistant?**
   - Building answers the question; architecting decides who may ask and what may be answered.
   - Building makes it work once; architecting makes it safe, owned, and operable over time.
   - Building focuses on the model; architecting focuses on identity, evidence, and governance.
   - Building is the demo; architecting is the system the demo will become.
   - There is no meaningful difference at demonstration scale.
   - I see it differently / write my own.

8. **What will you begin doing before you build?**
   - Map the real users, roles, and their different permissions.
   - Inventory the documents, their owners, versions, and conflicts.
   - Define which decisions the AI may, may not, and must escalate.
   - Define what success and failure look like and how they will be observed.
   - Confirm who owns and operates the system after launch.
   - I see it differently / write my own.

**Architecture options and consequence (Loop steps 7-8).** Because Week 0 is a format demonstration, the
"architecture" step is deliberately light: the student re-frames the assignment from "build a question
answerer" to "architect an identity, access, policy, evidence, governance, and operational system," and
the consequence layer shows, at a glance, how the naive framing would have failed on each of the four
hidden layers. No branch is scored.

**Final commitment (Loop steps 10-11).** The student completes the sentence:
*"Before I build, I will always ______."* This becomes the student's **Architect Commitment**.

**Experience Receipt (Week 0, Loop step 12).** Represents: 1 simple feature request · 8 user roles ·
10 information classifications · 6 decision categories · 7 architectural concerns · 4 implementation
strategies · 12 hidden assumptions · 5 professional perspectives · 2 project phases · **~450 collective
project hours represented** · about 12 to 15 minutes in-experience. Illustrative Experience Compression
Ratio: roughly 2,080 : 1 (about 450 hours ÷ about 13 minutes).
**Mandatory qualification:** *Illustrative · Scenario-based · An estimate of patterns represented · Not
employment experience earned · Not a guarantee of competence or job readiness. This represents patterns
studied, not employment experience earned.*

**ADR / decision record.** Architect Commitment (baseline; no numbered ADR).

**Project-transfer exercise (Loop step 14).** The student names their own personalized project and
records a baseline: what they would have done first before this experience, and the one thing they now
intend to do before building anything.

**Evaluation focus (Loop step 15).** Baseline observation only (unscored). The system records an initial
read across all eight Mindset dimensions to anchor future deltas, but assigns no stage and no total. This
is the baseline against which Week 1's first real score is measured.

**Completion (Loop step 16).** Week 0 completes as a **baseline demonstration**: produce a baseline
Mindset observation; save the required interview responses; create the first Mindset Ledger entry; create
the student's Architect Commitment. Week 0 is **NOT** counted as the first official weekly score.

**Estimated duration:** about 12 to 15 minutes (authored to about 13; canonical §2).

---

### WEEK 1: "The Request Is Not the Requirement" (first scored lesson)

**Principle (LOCKED):** Stakeholders request an imagined solution; the architect discovers the underlying
outcome, root causes, constraints, and evidence.

**Deceptively simple request.** *"Our students ask the same questions repeatedly. Build us an AI chatbot
so they stop contacting the staff."*

**Capture the initial response (Loop steps 3-4).** Before any reveal, the student records: what they
would build; what information it would need; how a student would use it; how they would measure success;
and what questions they would ask first. These initial answers are stored so the final Mindset Score can
show the delta from first instinct to revised architecture.

**Simulated first result (Loop step 8, consequence): the 30-day dashboard.** The student's chatbot is
"built" and run for 30 simulated days. The dashboard reports:

| Metric | Result |
|---|---|
| Questions answered | 82% |
| Staff contacts reduced | 9% |
| Repeated questions reduced | 4% |
| Student satisfaction | down 11% |
| Enrollment completion | no change |
| Incorrect confident answers | 7% |
| Human escalations completed | 38% |
| Students abandoning chat | 31% |

The simulation then asks: *"If the chatbot answered 82% of questions, why did staff workload fall by only
9%?"* (plausible multiple-choice plus a custom option):

- Many answered questions were not the ones that drove students to contact staff.
- Students did not trust the answers and contacted staff anyway to confirm.
- The 82% counted attempts, not resolved problems.
- Staff time shifted to escalations and corrections the chatbot created.
- The real workload came from tasks the chatbot never touched.
- I see it differently / write my own.

**Hidden system and stakeholder interviews (Loop step 5).** The student interviews a chosen set of
stakeholders: program director, admissions representative, instructor, student support specialist,
current student, former student, data analyst, compliance representative, technology administrator.
The interviews reveal that the single "repeated questions" complaint was actually several distinct
problems, spanning these root causes:

- **Efficiency** (some questions genuinely are repetitive and automatable).
- **Confidence and qualification** (students need to know whether an answer is authoritative).
- **Conflicting information** (different sources say different things).
- **Trust and reassurance** (students want a human to confirm high-stakes answers).
- **Navigation** (students cannot find where to go, not just what to know).
- **Missing next-step guidance** (they get an answer but not the action).
- **Broken workflow** (the underlying process itself is the problem).
- **Governance** (no rule for who may answer what).
- **Source-of-truth ownership** (no one owns the canonical answer).

**Signature reveal (Loop step 5).** *"The client requested one solution. Investigation revealed seven
different problems. A chatbot directly addressed only two."*

**Architecture options (Loop step 7).** The student selects and must defend one:

1. Improve the chatbot.
2. Redesign the knowledge and workflow foundation.
3. AI triage with human support.
4. A phased, combined architecture.
5. Propose my own architecture.

**Architect Interviewer challenge (Loop step 9).** After the selection, the AI Architect Interviewer
pushes back, in sequence:
*"The client asked for a chatbot in six weeks. Your recommendation changes processes, information
ownership, staff responsibilities, and technology. Why should the client accept the larger scope?"*
then:
*"What can be delivered in six weeks without creating a system the organization will regret?"*

**Re-architecture: the Outcome Architecture (Loop steps 10-11).** The revised decision is captured as an
**Outcome Architecture** with these required fields: requested feature; observable business outcome; user
outcomes; root causes; system response; non-goals; success measures; assumptions; constraints;
alternatives; accepted tradeoffs; evidence that would change the decision; and ownership.

**Experience Receipt (Week 1, Loop step 12).** Represents: discovery / requirements 700h · stakeholder
collaboration 480h · failed / incomplete solution exposure 900h · workflow redesign 600h · operational
measurement 520h · **total ~3,200 collective project hours represented.** Illustrative Experience
Compression Ratio: roughly 6,860 : 1 (about 3,200 hours ÷ about 28 minutes).
**Mandatory qualification:** *Illustrative · Scenario-based · An estimate of patterns represented · Not
employment experience earned · Not a guarantee of competence or job readiness. This represents patterns
studied, not employment experience earned.*

**ADR name.** **ADR-001: "Define the Outcome Before Selecting the Solution."**

**Project-transfer exercise (Loop step 14).** Applied to the student's own project:
- What solution has already been assumed?
- What outcome should it create?
- Who experiences the problem?
- Who owns the problem?
- What evidence proves the problem exists?
- Which root causes might remain even after the assumed solution?
- What would success look like without naming a technology?
- What is the smallest responsible release?
- What evidence would support a different solution?

**Evaluation focus (Loop step 15).** Stresses **System scope recognition**, **Assumption discovery**,
**Stakeholder awareness**, and **Decision communication**, with credit for reframing "solution requested"
into "outcome required." As the first scored lesson, the Mindset Score is shown in full (dimension,
evidence used, strength, gap, suggested improvement, change from initial response, and evaluation
limitation / confidence, per canonical §9) and the delta is measured against the Week 0 baseline.

**Estimated duration:** about 25 to 30 minutes (target 28; canonical §2).

---

### WEEK 2: "Boundaries Create the Architecture"

**Principle (LOCKED):** Divide responsibility by ownership, change, risk, data, authority, scaling, and
failure containment.

**Deceptively simple request.** *"Just add a feature so the assistant can also submit IT tickets, update
employee records, and send company-wide announcements. It's all the same assistant, so keep it in one
place."* The reveal shows that the "one assistant" quietly fuses three fundamentally different
responsibility domains: read-only question answering (low risk), employee-record mutation (high risk,
HR-owned), and broadcast messaging (communications-owned). They have different owners, change at
different rates, carry different blast radii, and require different authority. Collapsing them into one
module means one bug can take down all three, one deployment blocks all three, and one permission model
cannot correctly fit any of them. **Hidden system:** three owners, three change cadences, three failure
domains, and three authority levels hiding behind one chat box. **Stakeholders:** HR systems owner, IT
service-desk lead, internal communications, security, the platform team, and employees.

**Signature reveal.** *"One assistant was requested. The responsibilities inside it belonged to three
different owners, changed at three different rates, and failed with three different blast radii."*

**Architecture options.** (1) Keep one monolithic assistant. (2) Split into bounded services by owner and
risk (Q&A, records, communications). (3) One assistant front end with separate backend capability
services behind an authorization gateway. (4) Phase it: isolate the high-risk record-mutation path first.
(5) Propose your own boundary map.
**Consequence simulation summary.** The monolith path shows a records bug taking down question answering
and a communications outage blocking record updates; the bounded path contains each failure and lets each
owner change independently.
**ADR name.** ADR-002: "Draw the System Boundaries by Ownership and Change."
**Project-transfer exercise.** Where in your own project have you collapsed different owners, risks, or
change rates into one module, and where should a boundary go?
**Evaluation focus.** System scope recognition, Tradeoff quality, Failure anticipation, Governance &
ownership.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~2,800 represented hours (about 1 project cycle, 6 role
perspectives, several boundary tradeoffs, 1 redesign, and multiple failure-containment incidents);
ratio roughly 6,000 : 1. *Illustrative · Not employment experience earned · Not a guarantee of competence
or job readiness.*

---

### WEEK 3: "Design for Failure Before Success"

**Principle (LOCKED):** A demo proves the happy path once; architecture governs partial failure, retries,
duplication, timeout, and recovery.

**Deceptively simple request.** *"The assistant worked perfectly in the demo. Just turn it on for all
4,000 employees on Monday."* The reveal is that the demo proved exactly one request on a good day.
Production faces the model timing out, the document store being briefly unreachable, duplicate
submissions from double-clicks, a partial write that creates a ticket but never records it, rate limits
under Monday-morning load, and an evaluation service that returns "success" with the wrong shape. The
demo had no timeout, no capped retry, no idempotency key, no dead-letter capture, and no recovery
runbook. **Hidden system:** every rare failure becomes a daily event at scale, and each needs a defined
behavior. **Stakeholders:** SRE / ops, the service desk, employees, the model vendor, the platform team,
and the executive sponsor who chose Monday.

**Signature reveal.** *"The demo succeeded once. Production would run the same operation forty thousand
times a week, and every rare failure would become a daily event."*

**Architecture options.** (1) Launch as-is and fix issues as they appear. (2) Add timeouts, capped
retries, and idempotency keys before launch. (3) Launch to a small pilot cohort behind a circuit breaker
with a manual fallback. (4) Phased rollout with dead-letter capture and a written recovery runbook.
(5) Propose your own reliability design.
**Consequence simulation summary.** The as-is path produces duplicate tickets, a stuck queue, and a
silent partial failure on Monday morning; the hardened path contains and recovers from each.
**ADR name.** ADR-003: "Design the Failure Path Before the Happy Path."
**Project-transfer exercise.** For one operation in your project, answer: what happens if it fails, will
it retry and with what strategy, what is the recovery path when retries are exhausted, and which failure
modes are explicitly not handled?
**Evaluation focus.** Failure anticipation (primary), System scope recognition, Tradeoff quality,
Governance & ownership.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~3,400 represented hours (about 1 project cycle plus several major
incidents, role perspectives, and reliability tradeoffs); ratio roughly 7,290 : 1. *Illustrative · Not
employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 4: "Every Convenience Creates Coupling"

**Principle (LOCKED):** Shortcuts and direct integrations create dependencies whose cost appears during
change, scale, migration, and failure.

**Deceptively simple request.** *"Just have the assistant read directly from the HR database so we don't
have to build anything extra."* The reveal is that the convenient direct connection couples the assistant
to HR's schema, release cadence, uptime, and security boundary. A column rename breaks the assistant; HR
can no longer migrate without coordinating; a read path quietly becomes a trust-and-access path; and
scaling reads hits the production HR database. The coupling cost is invisible today and arrives all at
once at the first change, scale event, migration, or outage. **Hidden system:** an unowned, undocumented
dependency spanning two teams' schemas, uptime, and security. **Stakeholders:** the HR database owner,
the DBA, security, the assistant team, compliance, and the future maintainer who will attempt a
migration.

**Signature reveal.** *"The direct connection saved two weeks of work and created a dependency that would
cost six months at the first schema change."*

**Architecture options.** (1) Direct database read (fastest now). (2) A stable, published interface owned
by HR. (3) An event-driven or replicated read model the assistant owns. (4) A cached, contracted export
refreshed on a schedule. (5) Propose your own integration boundary.
**Consequence simulation summary.** The direct-read path shows a routine HR migration silently breaking
the assistant and a load spike degrading the HR system; the contracted path decouples both change and
failure.
**ADR name.** ADR-004: "Choose Coupling Deliberately, Not by Convenience."
**Project-transfer exercise.** Where has a shortcut integration created a dependency in your project, and
what will it cost at the first change, scale event, or migration?
**Evaluation focus.** Tradeoff quality (primary), System scope recognition, Failure anticipation,
Governance & ownership.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~3,600 represented hours (about 1 project cycle, a migration, role
perspectives, and coupling tradeoffs); ratio roughly 7,710 : 1. *Illustrative · Not employment experience
earned · Not a guarantee of competence or job readiness.*

---

### WEEK 5: "Data Has a Lifecycle, Not Just a Schema"

**Principle (LOCKED):** Design creation, validation, classification, use, sharing, change, retention,
audit, archival, and deletion.

**Deceptively simple request.** *"Just store the questions and answers so we can improve the assistant
later."* The reveal is that "store the Q&A" silently spans a full lifecycle: creation, validation,
classification (some entries contain PII, compensation, or health data), use (answering versus training),
sharing (who may read the logs), change (documents update and old answers go stale), retention (how long
is defensible), audit (who accessed what), archival, and deletion (subject-access requests, right to be
forgotten, and legal holds). A schema captures shape; a lifecycle governs obligations. **Hidden system:**
ten lifecycle stages and at least three regulated data classes behind one word, "store."
**Stakeholders:** the data-protection / compliance officer, legal, security, data engineering, HR, and
the employees whose data is captured.

**Signature reveal.** *"The request named one action, 'store.' The data it stored had ten lifecycle
stages and at least three regulated classes."*

**Architecture options.** (1) Log everything in one table indefinitely. (2) Classify on ingest and apply
per-class retention and access. (3) Store structured decision evidence only and exclude sensitive
content. (4) A tiered lifecycle with audit, retention, and deletion workflows. (5) Propose your own
data-governance design.
**Consequence simulation summary.** The log-everything path produces a subject-access request and a
stale-answer incident with no deletion path; the governed path handles classification, retention, and
deletion cleanly.
**ADR name.** ADR-005: "Govern the Data Lifecycle End to End."
**Project-transfer exercise.** Pick one data element your project stores and trace its full lifecycle from
creation to deletion; name the stage you have not yet designed.
**Evaluation focus.** Evidence & observability, Governance & ownership, System scope recognition,
Assumption discovery.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~3,800 represented hours (about 1 project cycle, roughly 10
lifecycle stages, role perspectives, and a redesign); ratio roughly 8,140 : 1. *Illustrative · Not
employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 6: "Security Is a System Property"

**Principle (LOCKED):** Security emerges from identity, authorization, trust boundaries, tool
permissions, data movement, secrets, defaults, logs, and operations.

**Deceptively simple request.** *"Give the assistant access to everything so it can answer any question
employees have."* The reveal is that "access to everything" collapses identity (who is asking),
authorization (what they may see), trust boundaries (the model, its tools, its plugins), tool permissions
(may it write, email, or pay?), data movement (prompts leaving to a vendor), secrets (keys ending up in
prompts or logs), defaults (open versus closed), logging (sensitive content in logs), and operations
(rotation, incident response). Security is not a feature bolted on top; it emerges from every one of those
surfaces. **Hidden system:** granting the model "everything" hands it the combined permissions of every
employee at once. **Stakeholders:** the CISO / security team, the identity / IAM owner, legal / privacy,
the model vendor, IT, and employees.

**Signature reveal.** *"'Access to everything' was one sentence. It silently granted the model the
combined permissions of eight thousand employees."*

**Architecture options.** (1) Broad access with a content filter on top. (2) Per-user authorization so
the assistant sees only what the asker may see. (3) Least-privilege tools with an explicit allow-list and
human approval for writes. (4) Layered: per-user authorization plus tool permissioning plus egress and
secret controls. (5) Propose your own security architecture.
**Consequence simulation summary.** The broad-access path shows one employee retrieving another's
compensation and a secret leaking into logs; the least-privilege path contains both.
**ADR name.** ADR-006: "Treat Security as a System Property."
**Project-transfer exercise.** In your project, whose identity does each action run as, what is the least
privilege it truly needs, and where does data cross a trust boundary?
**Evaluation focus.** Governance & ownership (primary), System scope recognition, Failure anticipation,
Assumption discovery.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~4,200 represented hours (about 1 project cycle, security
incidents, many role perspectives, and access-control tradeoffs); ratio roughly 9,000 : 1. *Illustrative ·
Not employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 7: "Observability Is Part of the Product"

**Principle (LOCKED):** If the organization cannot tell what the system did, why, on what evidence, at
what cost, and whether it worked, it is incomplete.

**Deceptively simple request.** *"It's live and people are using it. We're good, just let us know if
something breaks."* The reveal is that "let us know if something breaks" assumes the system can already
tell what it did, why, on what evidence, at what cost, and whether it worked. Without structured logs,
correlation IDs, per-answer evidence, cost and latency metrics, escalation tracking, and rolling
success / failure rates, a confidently wrong answer is invisible until a human complains. You cannot
operate, improve, or defend what you cannot observe. **Hidden system:** an operating system with no
instrumentation, where correctness is unprovable. **Stakeholders:** ops / SRE, support, the executive who
will ask "is it working?", compliance (audit trail), the data analyst, and employees.

**Signature reveal.** *"The system answered ten thousand questions in its first month. Without
observability, the organization could prove exactly none of them were correct."*

**Architecture options.** (1) Basic uptime monitoring only. (2) Structured event logging with correlation
IDs and per-answer evidence. (3) Full metrics (success, failure, retry, latency, cost) plus escalation
and abandonment tracking. (4) Observability tied to the decision record so every answer is explainable
and auditable. (5) Propose your own observability design.
**Consequence simulation summary.** The uptime-only path yields a month of confidently wrong answers no
one can trace; the instrumented path surfaces the regression on day two via correlation IDs.
**ADR name.** ADR-007: "Make the System Observable by Design."
**Project-transfer exercise.** For one action in your project, can you trace a symptom to its root cause
with a single correlation ID, and can you prove it worked and at what cost?
**Evaluation focus.** Evidence & observability (primary), Failure anticipation, System scope recognition,
Decision communication.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~3,900 represented hours (about 1 project cycle, incidents surfaced
by instrumentation, role perspectives, and observability tradeoffs); ratio roughly 8,360 : 1.
*Illustrative · Not employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 8: "AI Confidence Is Not Business Confidence"

**Principle (LOCKED):** Model confidence must combine with evidence quality, business impact,
uncertainty, action authority, abstention, and escalation.

**Deceptively simple request.** *"The model says it's 95% confident, so just let it answer and act
automatically."* The reveal is that model confidence is a statement about tokens, not about business
risk. A 95%-confident answer about the cafeteria menu and a 95%-confident answer about terminating
benefits carry the identical model number and wildly different business consequence. A real decision
must combine model confidence with evidence quality, business impact, uncertainty, action authority, an
abstention option, and an escalation path. **Hidden system:** an authority model that treats every action
as equally safe because the model felt equally sure. **Stakeholders:** the risk owner, legal /
compliance, HR, the model vendor, ops, and the employees affected by automated actions.

**Signature reveal.** *"The model was 95% confident in both answers. One was about parking. The other
would have changed someone's health coverage."*

**Architecture options.** (1) Act automatically above a confidence threshold. (2) Tier actions by
business impact, not by model confidence. (3) Require evidence-quality and authority checks before any
consequential action. (4) A confidence-plus-impact matrix with abstention and human escalation for
high-impact, low-evidence cases. (5) Propose your own decision-authority model.
**Consequence simulation summary.** The threshold-only path executes a confident, wrong, high-impact
action; the impact-tiered path abstains and escalates it.
**ADR name.** ADR-008: "Separate AI Confidence from Business Confidence."
**Project-transfer exercise.** For one AI-driven action in your project, what business impact does it
carry, and what evidence and authority should be required before it acts alone?
**Evaluation focus.** Failure anticipation, Governance & ownership, Tradeoff quality, Assumption
discovery (AI decision-governance emphasis).
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~4,000 represented hours (about 1 project cycle, incidents from
mis-scoped automation, role perspectives, and authority tradeoffs); ratio roughly 8,570 : 1.
*Illustrative · Not employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 9: "Optimize the Decision, Not the Model"

**Principle (LOCKED):** The strongest individual model is not necessarily the strongest business decision
system.

**Deceptively simple request.** *"Swap in the newest, most powerful model. It scores highest on the
benchmarks, so our results will be better."* The reveal is that the strongest model on a benchmark is not
the strongest business decision system. Decision quality depends on retrieval quality, evidence, routing,
guardrails, latency, cost per decision, abstention behavior, and how the answer is actually used, far
more than on raw model horsepower. A more powerful model attached to the same weak retrieval and no
governance produces more fluent wrong answers, faster and more expensively. **Hidden system:** a decision
pipeline where the model is one component among many, and rarely the limiting one. **Stakeholders:** the
product owner, finance (cost per decision), ops (latency), the model vendor, the data / retrieval owner,
and employees.

**Signature reveal.** *"The new model scored eight points higher on the benchmark and made the same wrong
decisions more convincingly, at triple the cost."*

**Architecture options.** (1) Upgrade the model and keep everything else. (2) Invest in retrieval,
evidence, and routing around a smaller model. (3) Route by decision type: a cheap model for low-impact,
a strong model for high-impact. (4) Optimize the whole decision pipeline (retrieval, guardrails,
abstention, escalation) and measure decision quality rather than model score. (5) Propose your own
decision-system design.
**Consequence simulation summary.** The model-swap-only path shows higher cost, the same error rate, and
more convincing mistakes; the pipeline path improves decision quality at lower cost.
**ADR name.** ADR-009: "Optimize the Decision System, Not the Model."
**Project-transfer exercise.** What would most improve the decisions your project makes: a stronger model,
better evidence and retrieval, or better routing and governance? What is your evidence?
**Evaluation focus.** Tradeoff quality (primary), Evidence & observability, System scope recognition,
Decision communication.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~4,300 represented hours (about 1 project cycle, a pipeline
redesign, role perspectives, and cost / quality tradeoffs); ratio roughly 9,210 : 1. *Illustrative · Not
employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 10: "Systems Live Longer Than Their Builders"

**Principle (LOCKED):** Systems must stay understandable, reproducible, changeable, operable, and
governable after the builder leaves.

**Deceptively simple request.** *"You built it and you know it best, so just keep it running. We don't
need documentation."* The reveal is that the system will outlive the builder's attention, memory, and
employment. Without reproducible builds, documented decisions, clear ownership, runbooks, and a change
process, the system becomes an un-modifiable, un-operable black box the moment the builder leaves. "Keep
it running" quietly assumes one irreplaceable person forever. **Hidden system:** an operating system whose
entire operating knowledge lives in a single head. **Stakeholders:** the engineering manager, the future
maintainer, ops, the business owner, compliance / audit, and the builder who would like a vacation.

**Signature reveal.** *"The system was designed to run for years. Its entire operating knowledge lived in
one person's head and would leave the building with them."*

**Architecture options.** (1) Keep the builder as the single owner. (2) Document decisions (ADRs),
runbooks, and reproducible builds. (3) Transfer ownership to a named team with an operability review.
(4) Design for succession: reproducibility, ownership, governance, and a decommissioning plan.
(5) Propose your own longevity design.
**Consequence simulation summary.** The single-owner path shows an outage the on-call team cannot resolve
after the builder leaves; the succession path lets a new owner operate and safely change the system.
**ADR name.** ADR-010: "Design for Life After the Builder."
**Project-transfer exercise.** If you disappeared for six months, what part of your project could no one
else run or change, and what would make it survivable?
**Evaluation focus.** Governance & ownership (primary), System scope recognition, Decision communication,
Evidence & observability.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~4,600 represented hours (about 1 project cycle, a major redesign
for succession, many role perspectives, and long-horizon tradeoffs); ratio roughly 9,860 : 1.
*Illustrative · Not employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 11: "Architecture Is Organizational Leadership"

**Principle (LOCKED):** Architecture succeeds through shared understanding, ownership, trust, sequencing,
communication, and adoption, not diagrams.

**Deceptively simple request.** *"The design is finished and approved. Just send the diagram to the teams
and have them build it."* The reveal is that a diagram is not adoption. The architecture succeeds only
through shared understanding, agreed ownership, trust, sequencing, communication, and change management
across HR, IT, security, and the teams who must build and operate it. A technically perfect design that
no one understands, owns, or sequences correctly will fail organizationally even when it is right on
paper. **Hidden system:** the human organization that must understand, own, and adopt the design for it to
become real. **Stakeholders:** the affected team leads, the executive sponsor, the HR / IT / security
owners, the people whose daily work changes, and the architect acting as communicator.

**Signature reveal.** *"The architecture was technically correct and organizationally rejected. No diagram
survives being handed to teams who were never brought along."*

**Architecture options.** (1) Publish the diagram and expect execution. (2) Run alignment sessions to
build shared understanding and ownership before building. (3) Sequence delivery so early wins build trust
and adoption. (4) Pair the technical design with an adoption plan: ownership, communication, sequencing,
and change management. (5) Propose your own organizational rollout.
**Consequence simulation summary.** The diagram-only path shows teams building divergent interpretations
and quietly not adopting; the leadership path builds shared understanding and sequenced adoption.
**ADR name.** ADR-011: "Lead the Organization Through the Architecture."
**Project-transfer exercise.** Who must understand, own, and adopt your project's design for it to
succeed, and how will you sequence and communicate it, not merely diagram it?
**Evaluation focus.** Decision communication (primary), Stakeholder awareness, Governance & ownership,
System scope recognition.
**Estimated duration:** about 25 to 30 minutes.
**Illustrative experience estimate.** ~4,800 represented hours (about 1 project cycle, an organizational
rollout, many role perspectives, and adoption tradeoffs); ratio roughly 10,290 : 1. *Illustrative · Not
employment experience earned · Not a guarantee of competence or job readiness.*

---

### WEEK 12: "The Architect's Final Horizon" (capstone)

**Principle (LOCKED):** The mature architect weighs delivery, value, risk, reversibility, operations,
ownership, future change, and the cost of being wrong, combining all eleven prior lessons.

**Deceptively simple request.** *"Leadership loved the pilot. Roll the assistant out company-wide across
every department, integrated with every system, by the end of the quarter. Make the call."* The reveal is
that this single decision reactivates every prior lesson at once. It demands the real outcome behind the
request (Week 1), the boundaries between owners (Week 2), the failure and recovery design (Week 3), the
coupling to every integrated system (Week 4), the data lifecycle across departments (Week 5), the
security and identity model at scale (Week 6), observability across the entire footprint (Week 7), AI
decision authority per action (Week 8), decision-system versus model optimization (Week 9), long-term
ownership and succession (Week 10), and the organizational leadership to sequence and drive adoption
(Week 11). The mature judgment is weighing delivery, value, risk, reversibility, operations, ownership,
future change, and the cost of being wrong, under a deadline. **Hidden system:** the whole company, every
integrated system, and every stakeholder from the previous eleven weeks, all in scope simultaneously.
**Stakeholders:** the full cross-functional set from all prior weeks (executive sponsor, HR, IT,
security, compliance, ops, the department leads) and the employees.

**Signature reveal.** *"Eleven weeks taught eleven lessons. This one decision demanded all eleven at the
same time, under a deadline, with the cost of being wrong at its highest."*

**Architecture options.** (1) Full company-wide rollout by the deadline as requested. (2) A sequenced,
reversible phased rollout by department and risk. (3) A bounded, well-governed initial footprint with
explicit expansion gates. (4) A recommendation that reshapes scope, timeline, and ownership to match the
real risk. (5) Propose your own final architecture and delivery decision, and own the cost of being
wrong.
**Consequence simulation summary.** The all-at-once path compounds coupling, failure, security, and
adoption risk into a single company-wide incident; the sequenced, reversible path delivers value while
containing the cost of being wrong. This week **requires combining all prior lessons** (outcome
discovery, boundaries, failure design, coupling, data lifecycle, security, observability, AI decision
governance, business optimization, long-term ownership, and organizational communication); no single
lesson alone produces a defensible call.
**ADR name.** ADR-012: "Weigh the Whole Horizon Before Committing."
**Project-transfer exercise.** Make the final call on your own project: combine outcome, boundaries,
failure, coupling, data, security, observability, AI authority, decision system, ownership, and
organizational adoption into one decision, and state exactly what you would do if you turned out to be
wrong.
**Evaluation focus.** All eight Mindset dimensions (capstone), with emphasis on System scope recognition,
Tradeoff quality, Failure anticipation, Governance & ownership, and Decision communication.
**Estimated duration:** about 28 to 30 minutes (capstone; canonical §2 target 28).
**Illustrative experience estimate.** ~6,800 represented hours (multiple project cycles and redesigns
across departments, many incidents, the full set of role perspectives, and the highest-stakes
tradeoffs); ratio roughly 14,570 : 1. *Illustrative · Not employment experience earned · Not a guarantee
of competence or job readiness.*

---

## Cross-week arc

### The Mindset Ledger grows as a derived record

The **Mindset Ledger** is a derived projection (canonical §6.1, DL-003): it is computed on read by
aggregating the enrollment's `architect_mindset` progress rows, with no dedicated table. Across the 13
weeks it accumulates a single, coherent story of the student's development:

- **Principles internalized** (one per week, Weeks 0 through 12, quoted from the LOCKED principle set).
- **Decision records authored** (the Architect Commitment from Week 0, then ADR-001 through ADR-012).
- **Discovery counters** that grow week over week: assumptions discovered, stakeholders recognized,
  failure modes named, tradeoffs explained, and evidence classes identified.
- **Dimension scores over time**, so the Ledger shows not just where the student is but how far they have
  moved from the Week 0 baseline.

Week 0 seeds the Ledger with the baseline observation (unscored) and the Architect Commitment; every
scored week (1 through 12) appends its `mindset_ledger_delta`. Because the Ledger is derived, it stays
consistent by construction: there is no counter to keep in sync, and re-reading a completed enrollment
always reproduces the same Ledger.

### The Architect Radar fills in and rounds out

The **Architect Radar** is the visualization of the eight LOCKED Mindset dimensions and their weights
(canonical §9): System scope recognition (20%), Assumption discovery (15%), Stakeholder awareness (10%),
Tradeoff quality (15%), Failure anticipation (15%), Evidence & observability (10%), Governance &
ownership (10%), and Decision communication (5%). Because each week deliberately stresses a different
subset of dimensions (see each week's Evaluation focus), the Radar begins uneven, spiking on the
dimensions a given week exercised, and rounds out as the series progresses:

- Weeks 1 through 2 push **System scope recognition**, **Assumption discovery**, and **Stakeholder
  awareness** (seeing the whole system and its people).
- Weeks 3 through 5 push **Failure anticipation** and **Tradeoff quality** (reliability, coupling, data
  lifecycle).
- Weeks 6 through 8 push **Governance & ownership** and **Evidence & observability** (security,
  observability, AI decision authority).
- Weeks 9 through 11 push **Tradeoff quality**, **Governance & ownership**, and **Decision communication**
  (decision systems, longevity, organizational leadership).
- Week 12 exercises all eight at once, so a well-developed Radar reads as balanced rather than spiky.

Stage progression follows the LOCKED bands (canonical §9): 0 to 29 Feature Thinker, 30 to 49 System
Explorer, 50 to 69 Tradeoff Thinker, 70 to 84 Architecture Thinker, 85 to 94 Architecture Leader, 95 to
100 Systems Steward. The intended arc moves a typical student from Feature Thinker (their Week 0
baseline, seeing only the requested feature) toward Architecture Thinker or beyond by the capstone,
with the exact trajectory driven by their own responses, never assumed.

### Project transfer compounds on the student's own project

The through-line of the series is the student's own personalized project, revisited at Loop step 14 every
week. Week 0 records the baseline (what they would have done first, and the one thing they now commit to
doing before building). Each subsequent week turns a new architectural lens onto that same project:
Week 1 asks what solution was already assumed and what outcome it should create; Week 2 asks where
boundaries belong; Week 3 asks what happens when it fails; and so on through Week 11's question of who
must adopt it. By Week 12 the student is not answering a hypothetical; they combine all eleven lenses
(outcome, boundaries, failure, coupling, data, security, observability, AI authority, decision system,
ownership, and organizational adoption) into a single, defensible decision about their real project, and
they state what they would do if that decision proved wrong. The compounding is the point: the same
project, seen through thirteen progressively wider lenses, is how the series turns a feature-thinker into
an architect who can see, and own, the whole system.

---

*This specification conforms to `00-canonical-decisions.md`. Any future change to identifiers, weights,
dimensions, stages, states, or configuration must be made in the canonical file first, then propagated
here.*
