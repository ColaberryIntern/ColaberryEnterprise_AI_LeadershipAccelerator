# Herriman Root-Cause Matrix (Reverse-Engineer to 92, R0)

**Fixture:** `Colaberry_Herriman_WOMS_Proposal_upgraded_2026-11-21.zip` (the package generated 2026-11-21).
**Project:** Gov Proposal Studio, delivery project `80b35be2-a0e9-4068-945b-328e9438bbc7` (Herriman City WOMS).
**Method:** reproduce each failure against real exported bytes, find the earliest responsible pipeline stage, fix it in the product (not the self-score), add a regression test.

**Current release status (honest):** `ENGINEERING_IN_PROGRESS` for content quality; `BLOCKED_NEEDS_HUMAN` for the >=92 / submission-ready goal. See [NEEDS_HUMAN.md](./NEEDS_HUMAN.md). **No >=92 is being claimed.**

---

## Pivotal R0 correction: the authoritative source WAS available all along, and it is NOT thin

A prior session concluded the Herriman RFP was a thin ~3-page process document and that the full solicitation had to be re-supplied (the Bonfire ZIP). **That was wrong.** The authoritative source bundle is stored in-system for this pursuit:

- `GovQualification` for project 80b35be2 → tenant `a1ccf4d3-...`, qual key `gws:b1fb990c-...`
- Source bundle: `/app/uploads/gov-source-bundles/4c81a09b-ea6c-4d5b-8c79-bcc3bdf0bc4b.zip`, sha256 `dd23611185e0a9e5...`
- Contents (4 PDFs, uploaded 2026-10-26): `1-Herriman RFP Work Order.pdf`, `2-/3-Questions and response v2.pdf`, `4-Herriman Work Order RFP Questions Part 2.pdf`

The source is **substantive**. Exact-text hits across the RFP + Q&A: `work order` x43, `GIS` x15, `integration` x11, `buildings` x8, `Bluestakes` x7, `inventory` x6, `LAMA` x6, `API` x6, `SpryPoint` x5, `SCADA` x5, `Madison` x5, `SSO` x5, `mobile` x5, `offline` x3, `migration` x2, plus `users` x19.

**Therefore the technical thinness is an EXTRACTION/ROUTING defect, not a thin RFP.** A genuinely substantive technical proposal is achievable from the already-stored source, with no new buyer file required. (Human-owned *submission* inputs — see F04 — are a separate blocker.)

---

## Reproduced failure (F01): administrative clauses drafted as technical answers — CONFIRMED, SEVERE

`pdftotext -layout 02-technical.pdf` — the Technical Proposal **opens** with:

> "Technical Proposal ... This section responds to requirement **REQ-003**. Submission Requirement: One (1) electronic (PDF) copy of Responses are required to be submitted by email to Herriman City/Steven Brown. **Benefit:** ... **Proof:** Proposals must be submitted no later than 5:00 p.m. MDT ..."

Then REQ-004 (deadline), REQ-005 (no late responses), REQ-006 (no facsimile), ... through REQ-022 (vendor negotiation / procurement). **27 drafted sections; ~20 are submission/administrative/evaluation/procurement content** (REQ-003..022). ~74% of the "technical" document is non-technical.

This is the single most damaging, most visible defect, and it is reproducible from the exported bytes.

---

## Root-cause map

| ID | Symptom | Earliest root cause | Code | Status |
|---|---|---|---|---|
| **F01** | Submission/admin clauses (REQ-003/004/005/006/013/014/015/019/020/021) drafted as technical sections | `deriveProposalDocuments()` routes requirements to documents by a **text-regex only**; the Technical Proposal rule is the catch-all `pattern: /.*/ `, so any requirement matching no specific submittal rule falls into Technical. The stored `kind='administrative'` and the `submit` category are never consulted at routing. | `govProposalDocuments.ts`; signals `requirementSignals.ts`; triage `requirementTriage.ts` | **FIXED (R1 + R3):** R1 drops submission-instructions (`isSubmissionInstructionRequirement`); **R3** drops non-technical administrative clauses — the City's evaluation process (review panel/scoring), procurement/contractual mechanics (written agreement, negotiation), residual submission rules (no late / no facsimile), and packaging/format (`isNonTechnicalAdministrativeRequirement`). 15 of the Herriman admin clauses are now kept out of Technical; a proposer-facing narrative ask (REQ-010) is preserved. |
| **F02** | "Coverage" rewarded presence of text / a `data-req` anchor, not a real answer | `checkCoverage` counted non-empty section or anchor as covered | `documentChecks.ts` | **Already fixed (#4264):** substantive-answer coverage (`isSubstantiveAnswer`, min length + concrete detail); structural notion split out as `checkLocationCoverage` |
| **F03** | No substantive treatment of Bluestakes/LAMA/SpryPoint/SCADA/Madison/GIS/offline/migration | **Extraction actually works** — it captured 27 genuine `scope` (functional) requirements (REQ-023..056: GIS read/write, Bluestakes, citizen portal, API integrations). The defect was that `deriveProposalDocuments` **dropped** every `scope` requirement at `govProposalDocuments.ts:138` as "build work, never a submittal document", so the Technical Proposal had nothing real to answer. | `govProposalDocuments.ts:138` | **FIXED (R2, this PR):** scope requirements are now routed to the Technical Proposal narrative (they still feed the solution_build track). `runProposalDocumentChecks` passes no `buildRequirementIds`, so they count toward technical coverage |
| **F04** | Missing signed Exhibit B, authorized pricing, 3rd qualifying reference | Human-owned inputs absent | package gates | **BLOCKED_NEEDS_HUMAN** (see NEEDS_HUMAN.md). Never fabricated |
| **F05** | No credible implementation schedule / acceptance / migration plan | No implementation-planning module | — | OPEN — R4 |
| **F06** | Screenshots treated as proof of live integration | Exhibit A asserts "working build" for ArcGIS/SSO/etc. from screenshots | `proofProvenance` (to build) | OPEN — R3/R6; screenshots now ride a DRAFT packet, and the pilot doc already scores proof low |
| **F07** | AI scorer could award proof=100 on zero claims; 8,000-char truncation | `aiProof` returned 100 for `claims=[]`; evaluator truncated | `documentChecksAI.ts` | **Already fixed (#4264):** zero claims → UNVERIFIED (0) + finding; windowed whole-document read (`MAX_PROMPT_CHARS=48000`) |
| **F08** | Readiness % concealed fatal submission gaps | pass-% omitted pricing/forms | `proposalReadiness` / hard gates | **Already fixed (#4264):** `proposalHardGates.ts` 5-gate readiness, separate from per-doc pass; DRAFT banner |
| **F09** | Export readiness vs actual PDF bytes could disagree | render count incremented without null check; manifest off HTML hash | `buildProposalPackage.ts` | **Already fixed (#4264):** render fails closed; page counts from fresh bytes; version-bound Gold (`goldApprovedForVersion`) |
| **F10** | No versioned source-of-truth for buyer facts (deadline/time-zone, quantities) | No buyer-fact registry | — | OPEN — R1/R3; note the "5:00 p.m. MDT" winter-date zone question stays a verify-flag, never auto-corrected |
| **F11** | Capability/past-performance cross-contamination (Accelerator cited as municipal proof) | No scoped capability claims with evidence | `govCompanyLibrary` | OPEN — R3 |
| **F12** | System can iterate without materially repairing output | review cycle can revise wording without closing real gaps | `runReviewCycle.ts` | PARTIAL — the cycle already **stops at `open_questions`** instead of padding; blind-rescore loop is R5 |

---

## F01 fix (this PR)

`deriveProposalDocuments()` now drops a requirement from document derivation when it would default into the Technical Proposal (`rule.key === 'technical'`) **and** `isSubmissionInstructionRequirement(statement)` is true. That classifier (shipped in #4271, `documentChecks.ts`) matches submission mechanics (submit / electronic copy / email to / no later than / page limit / sealed / file naming) **and excludes** anything naming a technical capability (GIS, work order, integration, offline, SCADA, SSO, migration...), so a genuine "the proposal must include a technical approach" requirement is not swept up. The obligation is still enumerated in the generated Compliance Matrix (built from the full extracted requirement set), so nothing is lost — it simply stops being drafted as technical prose.

**Regression test** (`govProposalDocuments.test.ts`): the exact REQ-003 "submit one (1) electronic (PDF) copy by email" and REQ-004 deadline passages are asserted to NOT produce a technical section; a "must include a technical approach" requirement still routes to Technical; a "submit a description of the GIS integration" requirement is NOT dropped (names a technical capability).

**Scope honesty:** this removes submission-instruction leaks. It does not by itself make the technical document *substantive* — that requires F03 (scope extraction + solution blueprint from the stored source), which is R2.

---

## Honest ceiling (why >=92 is BLOCKED today)

Three of the eight rubric dimensions (45 of 100 weight) are gated on human-owned inputs that must never be fabricated: **Mandatory compliance (20)** needs signed Exhibit B + authorized pricing + verified references; **Pricing (10)** needs authorized pricing; **Evidence & past performance (15)** needs qualifying government references (only 2 of 3 on file, unvetted). Even with the agent-controllable dimensions driven high, the weighted ceiling without those inputs is ~60/100, every one of the three gated categories misses the 85 floor, and the mandatory hard gate fails — so submission-eligible is false regardless of score. **>=92 + submission-ready is `BLOCKED_NEEDS_HUMAN`.**

What engineering CAN raise honestly, from the stored authoritative source, without any human input: Technical responsiveness, Implementation & delivery, Buyer differentiation, Risk/security, Presentation — by fixing extraction/routing (F01 done; F03/F05 next). That is the value this program delivers while the human blockers are collected in parallel.

---

## Release order (status)

- **R0** recon + reproduce + causal map — THIS document. Done.
- **R1** correct routing so administrative requirements stop leaking into Technical — THIS PR.
- **R2** scope extraction + buyer solution blueprint from the stored source (the substance lever) — next.
- **R3** evidence/commercial/people needs + proof typing — partly human-blocked.
- **R4** implementation/risk completeness.
- **R5** independent whole-package evaluator.
- **R6** package renderer hardening — largely landed (#4264); preflight re-open-the-ZIP to add.
- **R7** UI trust/evaluation views.
- **R8** final Herriman experiment + blind audit (requires R2 + deploy authorization + human inputs for the gated dimensions).
