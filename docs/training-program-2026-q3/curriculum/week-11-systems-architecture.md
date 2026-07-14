# Week 11 Content Spec: Systems Architecture + Solution Architecture Package

**Intensive:** 4 — Design AI That Scales  
**Theme:** Systems Architecture + Solution Architecture Package  
**Type:** Colaberry-original (no dedicated Anthropic Skilljar course)  
**Background course:** none — this week is documentation-and-synthesis, not new Anthropic API surface  
**Architecture Day:** Monday 2026-10-05  
**Build Day:** Thursday 2026-10-08  
**BC list:** Curriculum (https://app.basecamp.com/3945211/buckets/47502609/todolists/9946468992), Week 11 group  
**Status:** Draft — pending Ali approval

---

## Purpose

Week 11 is the synthesis week. By now the student has built ten weeks of components: an Architect Workspace (W1), three Agent Skills (W2), a Business Workflow Assistant (W3), a Prompt Library (W4), an MCP server (W5-6), a multi-agent system (W7-8), a reliability layer (W9), and a governance engine (W10). None of that is worth anything to an executive, hiring manager, or RFP reviewer unless it is documented as one coherent system.

This week's deliverable is the Solution Architecture Package, locked by the TWC-filed Seminar 4 outcome (`docs/training-program-2026-q3/TWC_INTENSIVE_OUTCOMES.md`): "system diagram, data flow, security model, integration model." It also directly produces the evidence for the LOCKED Capstone Evaluation Rubric's "Architecture clarity (system diagram, data flow, security)" dimension (A12, `docs/training-program-2026-q3/launch-briefs/11-swati-curriculum-twc.md`).

There is no Anthropic Skilljar course for this week because the content is not Claude-specific — it is the general discipline of documenting a system so someone who did not build it can understand, evaluate, and extend it.

---

## Learning Objectives

By the end of Week 11, a student can:

1. Produce a system diagram showing every major component built across Weeks 1-10 (Skills, Workflow Assistant, MCP server, multi-agent system, reliability layer, governance engine) and how they connect.
2. Produce a data flow diagram tracing one representative request end-to-end through the system, annotated with the validation, retry, confidence-scoring, audit-logging, and approval-gate checkpoints it passes through.
3. Write a security model section covering: where secrets live (never in source), what data is classified as sensitive and how it is handled, and what the least-privilege boundary is for each agent or component (which resources it can and cannot touch).
4. Write an integration model section covering: every external system the project touches (APIs, MCP resources, webhooks), the contract (request/response shape, auth mechanism, timeout, retry policy) for each, and what happens when an integration is unavailable.
5. Assemble all four sections into one Solution Architecture Package document that a reader with no prior context can follow start to finish.

---

## Read/Watch Layer

Assign before Architecture Day. Estimated pre-class time: 25 min.

| # | Resource | URL | What to read |
|---|---|---|---|
| 1 | Building Reliable Agentic Systems | https://docs.anthropic.com/en/docs/build-with-claude/agents-and-tools/build-agents | Reread with a documentation lens: which architectural decisions in this guide would a reader need explained if they were evaluating your system for the first time? |
| 2 | Anthropic API Overview | https://docs.anthropic.com/en/api/overview | Section on request/response shape — background for describing your own project's integration contracts with the same precision |

**Instructor reference (not assigned to students):** `docs/training-program-2026-q3/STUDENT_PLATFORM_BUILD_SPEC.md` and this platform's own `docs/ai-governance/abac-design.md` are examples of production-grade architecture documentation (system model, current-state table, design rationale) the instructor can show as a "what good looks like" reference — not for the student to read as source material.

---

## Architecture Day — Monday 2026-10-05

**Format:** Live, instructor-led, 90 min

### Agenda

| Time | Block | Description |
|---|---|---|
| 0:00–0:15 | Why documentation is the deliverable | Instructor shows two versions of the same system: one as a pile of committed code, one as a one-page system diagram plus four short sections. Ask which one an executive, a hiring manager, or an RFP reviewer can evaluate in 5 minutes. The code is necessary but not sufficient — the package is what gets read. |
| 0:15–0:35 | The system diagram | Instructor draws a system diagram live for a reference project: boxes for each major component (Skills, Workflow Assistant, MCP server, agents, reliability layer, governance layer), arrows for how they call each other. Students draft their own system diagram covering their Weeks 1-10 components. |
| 0:35–0:55 | The data flow diagram | Instructor traces one request through the reference project end-to-end, annotating each checkpoint it passes (input validation, retry-wrapped call, confidence score, audit log entry, approval gate if applicable). Students pick their own most representative request and trace it the same way. |
| 0:55–1:15 | Security model and integration model | Instructor walks through the security model template (secrets location, data classification, least-privilege boundaries) and the integration model template (external systems, contracts, failure behavior) using their own project's governance layer from Week 10 as the source material. Students draft both sections for their own project. |
| 1:15–1:25 | Assembling the package | Instructor shows the four sections assembled into one document with a short executive summary at the top. Students outline their own package structure. |
| 1:25–1:30 | Build Day assignment | Instructor assigns: write the full Solution Architecture Package (see Artifact Spec below). |

---

## Build Day — Thursday 2026-10-08

**Format:** Lab, live or async, 90 min

### Lab Assignment: Solution Architecture Package v1.0

Students write the complete four-section package for their own project, using the diagrams and drafts started on Architecture Day. At the end of Build Day, they present the package to a peer for a 10-minute "can you understand my system from this alone" read-through and incorporate one round of feedback.

---

## Tier-A Artifact: Solution Architecture Package

### File location in student project

```
docs/
  solution-architecture-package.md   # the assembled package (or .pdf export for the final submission)
```

### Required sections (every package must contain all four, in this order, after the executive summary)

1. **Executive summary** (3-5 sentences: what the system does, who it's for, what problem it solves)
2. **System diagram** — every major component from Weeks 1-10, with connections. Diagram tool is the student's choice (Mermaid, draw.io, Excalidraw, hand-drawn + photographed) as long as it is legible and embedded in the doc.
3. **Data flow** — one representative request traced end-to-end, with every checkpoint (validation, retry, confidence score, audit log, approval gate) labeled on the diagram or in an accompanying numbered list.
4. **Security model** — secrets location, data classification approach, least-privilege boundary per component (what each agent/service can and cannot touch).
5. **Integration model** — every external system touched, with contract (request/response shape, auth, timeout, retry policy) and documented failure behavior per integration.

### Acceptance criteria for Tier-A

- [ ] `docs/solution-architecture-package.md` present in the student's project repo
- [ ] Executive summary is 3-5 sentences and names the specific business problem the project addresses
- [ ] System diagram includes every component built in Weeks 1-10 that is still part of the project (no orphaned or missing components)
- [ ] Data flow section traces one real request with all checkpoints from the reliability (Week 9) and governance (Week 10) layers labeled in order
- [ ] Security model names where secrets live, at least one data classification decision, and the least-privilege boundary for at least 2 components
- [ ] Integration model lists every external system with contract details (auth mechanism, timeout, retry policy) and stated failure behavior for each
- [ ] Package has been read by one peer in a 10-minute read-through with one round of feedback incorporated (documented as a short "Feedback incorporated" note at the bottom of the doc)
- [ ] Committed at `docs/solution-architecture-package.md` with commit message: `docs(architecture): solution architecture package v1.0`

---

## Assessment Hooks (for Swati's assessment pack)

### Warmup quiz (5 questions, before Architecture Day)

1. What are the four required sections of a Solution Architecture Package, in order? (Answer: system diagram, data flow, security model, integration model — preceded by an executive summary)
2. Why is a data flow diagram traced through one representative request, rather than describing every possible request? (Answer: one concrete, fully-annotated trace is more useful to a reader than an abstract description of every path — it's verifiable and specific)
3. What does "least-privilege boundary" mean for a component in a security model? (Answer: the explicit statement of what that component can and cannot access or do — the smallest set of permissions it needs to do its job)
4. Name one thing an integration model must document for each external system. (Answer: any of: request/response shape, auth mechanism, timeout, retry policy, or failure behavior)
5. Why does the package require a peer read-through rather than just self-review? (Answer: the author already has all the context in their head — a peer with no prior context is the real test of whether the documentation stands on its own)

### Post quiz (10 questions, after Build Day)

- Given a system diagram missing the governance layer built in Week 10, identify the gap and describe what should be added
- Given a data flow description with no labeled checkpoints, rewrite it to show where validation, retry, confidence scoring, and audit logging occur
- Given a security model section that says "secrets are handled securely," identify why this fails and rewrite it with the specific location and mechanism
- Given an integration model entry missing a timeout and retry policy, add the missing fields
- A student's package has a system diagram but no data flow section. Identify what's missing and why it matters
- Given two components with overlapping access to the same resource, describe how to state their respective least-privilege boundaries clearly
- Given a package with no executive summary, write one in 3-5 sentences from a provided system description
- Given peer feedback that a diagram is "impossible to follow without the code," identify the documentation failure and one fix
- Name the platform's own governance-layer components (from Week 10) that should appear as checkpoints on a data flow diagram (Answer: audit log entry, approval gate, escalation path, circuit breaker state)
- Given a completed package missing the "Feedback incorporated" note, explain why the peer read-through step is part of the acceptance criteria, not optional polish

### Week 11 feedback survey (4 questions)

1. "I can explain my entire system to someone who has never seen it, using only this package." (1-5 scale)
2. "Drawing the system diagram helped me notice a gap or inconsistency I hadn't seen while building." (1-5 scale)
3. "The security model section forced me to think about least-privilege in a way I hadn't during the Week 10 build." (1-5 scale)
4. Open: "What did your peer reviewer misunderstand about your system, and what did that tell you about your documentation?"

---

## NotebookLM Video Hooks (for Swati)

**One video, target length 12–15 min.**

| Segment | Duration | Content |
|---|---|---|
| Code isn't the deliverable | 2 min | Open with the executive-review scenario: nobody with signing authority reads your commit history. Show the same system as a one-page diagram plus four sections — this is what gets evaluated. |
| Drawing the system diagram | 3 min | Walk through building a system diagram for a reference project live, one component at a time (Skills → Workflow Assistant → MCP server → agents → reliability → governance), narrating the "why does this box exist" for each. |
| Tracing the data flow | 3 min | Pick one request and trace it through the reference project's checkpoints — validation, retry, confidence score, audit log, approval gate — showing how the Week 9 and Week 10 modules become visible line items in a data flow diagram. |
| Writing the security and integration models | 3 min | Fill in the security model template (secrets, classification, least-privilege) and integration model template (contracts, failure behavior) for the reference project, showing how the Week 10 governance module directly supplies the content. |
| The peer read-through | 2 min | Show a mock 10-minute read-through: a peer with no context reads the package cold, asks two questions, the author identifies what to clarify. This is the real test of whether the package works. |

**Source material:** the 2 read/watch resources above + the student's own Weeks 1-10 project components + the instructor-reference architecture docs noted above.

---

## Non-Goals (Week 11 scope boundary)

These are explicitly deferred:

| Deferred topic | Where it belongs |
|---|---|
| Building new features or components not already built in Weeks 1-10 | Out of scope — this week documents what exists, it does not add new build scope |
| Formal architecture review board / RFP-response formatting | Week 12 (Capstone) — polish for the Architect Expo happens next week |
| Full ABAC implementation or production-grade access control | Post-program — see Week 10 Non-Goals; this week documents the simplified Week 10 governance layer as-built, not a production access-control system |
| Cost modeling and infrastructure sizing | Post-program — outside the 12-week scope; may be referenced as a stretch goal in the security/integration models but is not graded |

---

## Done Criteria

This week is complete when ALL of the following are true:

- [ ] Ali approves this spec
- [ ] The 2 read/watch resources are accessible via the links above (Anthropic public docs — no login required)
- [ ] Swati has built the assessment pack (5-question warmup + 10-question post quiz + 4-question feedback survey) using the hooks above
- [ ] Swati has produced the NotebookLM video (12–15 min) from the source material above
- [ ] The Solution Architecture Package template is embedded in the student portal Week 11 page (Design E dependency — deferred until portal week-detail pages land)
- [ ] Swati sign-off on full week as launch-ready
