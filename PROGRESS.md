# PROGRESS.md
**Colaberry Enterprise AI Accelerator — Build Progress Tracker**

This file tracks all implementation work. Claude must read this at the start of every session and update it after each completed change.

---

## Current Focus
System Blueprint UX overhaul — transforming the portal from dashboard-first to guided build experience.

---

## Completed Work

### Phase 16 — Causality Replay + Distributed Validation Cognition (2026-05-07)
- [x] 11 new backend modules under `backend/src/intelligence/systemStateEngine/causality/`: `causalityTypes.ts`, `mutationLineageGraph.ts`, `contradictionPropagationTracker.ts`, `causalTrustPropagation.ts`, `distributedValidationHarness.ts`, `validationArbitrationEngine.ts`, `validatorTrustCalibrator.ts`, `rootCauseAnalyzer.ts`, `causalStabilizationEngine.ts`, `operationalEpidemiologyEngine.ts`, `causalityReplayEngine.ts`, `causalitySummaryCounters.ts`
  - Date: 2026-05-07
  - Verification: backend `npx tsc --noEmit` exit 0; full systemStateEngine jest suite **646 tests passing across 16 suites** including 56 new Phase 16 tests; sample script via temp `_phase16Sample.ts` exercised every module + the frozen-intent veto path on synthetic inputs (deleted post-run)
  - Note: Architectural commitment held per stress-test — validators are pure scoring algorithms inside the engine (NOT separate processes/agents/sub-Claudes), epidemiology is honest temporal+spatial clustering (NOT an SIR model), root-cause TARGETING is shipped but autonomous ancestor rollback is deferred to Phase 17, replay is a structured backend trace (NOT a graph viz library). Hard architectural caps: depth 5, decay 0.5/gen, replay trace 200 nodes, 30-min temporal window.
- [x] First-class `CausalConfidenceAttribution` payload on every root-cause result (`root_cause_confidence`, `supporting_evidence` array, `propagation_strength`, `contradiction_density`, `validator_agreement`, `lineage_depth_penalty`); root-cause analyzer returns top-5 surfaced roots with stabilization recommendations + rollback targeting suggestions
  - Date: 2026-05-07
  - Verification: 5 root-cause tests cover target-as-root + ancestry-with-penalty + supporting_evidence + rollback_targeting suggestion + confidence floor sanity
- [x] 5 distributed-cognition validators (`mutation_validator`, `rollback_validator`, `trust_validator`, `containment_validator`, `blast_radius_validator`) each returning `ValidatorVerdict` with rationale + disagreement_flags + propagation_concerns + stabilization_recommendations; arbitration engine produces consensus + `confidence_range:{min,max}` + minority_warning + arbitration_risk + escalation_required
  - Date: 2026-05-07
  - Verification: 7 validator tests + 6 arbitration tests; one test caught an early bug where containment_validator's "reject" couldn't outvote 4 "apply" verdicts even on a frozen intent — fixed by adding a hard veto rule (containment confidence ≤ 20 forces consensus to reject)
- [x] `ValidatorDisagreementProfile` persistence with per-pair disagreement_rate + topics + confidence_divergence + arbitration_frequency + escalation_rate; per-validator drift signal classification (`stable` / `over_triggering` / `under_detecting` / `inconsistent`)
  - Date: 2026-05-07
  - Verification: 5 validator-trust-calibrator tests cover cold-start + agreement-raises-trust + disagreement profiles + extractDisagreements + drift signal classification
- [x] `OperationalSpreadClassification` (6 classes: localized / branching / cascading / recurrent / isolated / suppressed) on every stabilization priority and every epidemiology entry; `StabilizationPriorityScore` composite of propagation_risk + contradiction_density + validator_consensus + trust_decay_impact
  - Date: 2026-05-07
  - Verification: 3 stabilization tests + 3 epidemiology tests cover classification logic, action recommendations, and diffusion score bounds
- [x] Causal trust propagation with hard depth cap (5) + decay factor (0.5/gen); a single weak ancestor 5 generations back contributes ≤ 1/32 of its weakness to descendants
  - Date: 2026-05-07
  - Verification: 4 trust-propagation tests verify decay constant, single-root zero decay, 1-gen halving math, and depth-cap enforcement on a 10-node chain
- [x] Phase 16 enums: 5 new `GovernanceAuditEntry.kind` values, 7 new `CognitiveEventKind` values, 2 new `RefreshTriggerKind` values, optional `causality_summary` block on `AuthoritativeSystemState`; populated synchronously in `buildAuthoritativeStateFromInputs` from in-memory counters (no DB read)
  - Date: 2026-05-07
  - Verification: 3 surface-population tests confirm counter reflection + zero state + per-project isolation; `tsc --noEmit` clean across all consumers
- [x] 5 new endpoints in `projectRoutes.ts`: `GET /governance/causality/lineage`, `GET /governance/causality/root-cause/:mutation_id`, `GET /governance/causality/propagation`, `GET /governance/causality/validators/:mutation_id`, `GET /governance/causality/epidemiology` — each composes the new engines on demand from up to 7 days of audit rows
  - Date: 2026-05-07
  - Verification: backend `tsc --noEmit` clean; all routes reuse the inline `buildProjectLineageGraph` helper that translates audit rows into lineage nodes
- [x] 6 new frontend hooks: `useOperationalLineage`, `useContradictionPropagation`, `useCausalTrust`, `useValidatorArbitration`, `useRootCauseAnalysis`, `useCausalityReplay` (last one composes the lineage hook with a client-side BFS walk, also depth-capped at 5)
  - Date: 2026-05-07
  - Verification: frontend `npx tsc --noEmit` exit 0
- [x] `AutonomousExecutionDashboard.tsx` extended in place (no parallel component) with three new sections: Causal lineage (root/leaf badges + max-depth + node/edge counts), Contradiction propagation hotspots (top 5 ranked), Causal trust propagation alerts (latest decay events with effective-trust display)
  - Date: 2026-05-07
  - Verification: frontend tsc clean; lifted-state + collapse pattern preserved across all Phase 13-16 surfaces
- [x] `docs/PHASE_16_CAUSALITY_REPLAY_DISTRIBUTED_VALIDATION_VALIDATION_REPORT.md` written covering all 14 sections (files created/modified, lineage status with real edges, contradiction propagation with real hotspots, causal trust with real decay propagation through 4-node chain, root-cause attribution shape, distributed validation status with real verdicts, arbitration status with frozen-veto example, epidemiology status with classification table, replay status, performance, test results, gaps, next phase recommendation)
  - Date: 2026-05-07
  - Verification: doc exists at the documented path; matches the Phase 13-15 validation-report format; cross-references real sample-run outputs

### Phase 15 — Governed Direct Autonomous Mutation (2026-05-07)
- [x] 8 new backend modules under `backend/src/intelligence/systemStateEngine/mutation/`: `mutationTypes.ts`, `mutationProvenanceChain.ts`, `mutationBlastRadiusForecaster.ts`, `mutationVerificationEngine.ts`, `mutationTrustCalibrator.ts`, `mutationRollbackCoordinator.ts`, `mutationContainmentEngine.ts`, `directMutationEngine.ts`, `mutationSummaryCounters.ts`
  - Date: 2026-05-07
  - Verification: backend `npx tsc --noEmit` exit 0; full systemStateEngine jest suite **590 tests passing across 15 suites** including 53 new Phase 15 tests; sample script via temp `_phase15Sample.ts` exercised every module on synthetic inputs and produced expected outputs (deleted post-run)
  - Note: Architectural commitment held — Phase 15 still does NOT mutate user code, run Claude Code in-process, or attempt screenshot/DOM-diff verification. It mutates the platform's own operational cognition state (queue/policy/trust/isolation/automation-mode) via a first-class `MutationEnvelope` abstraction and verifies empirically through telemetry + BuildManifest cross-check.
- [x] First-class `MutationEnvelope` primitive with 7 mutation intent classes (QUEUE_STABILIZATION, PRESSURE_REBALANCE, ISOLATION_CONTAINMENT, AUTOMATION_DEESCALATION, TRUST_RECALIBRATION, POLICY_NUDGE, SELF_HEALING_ACTION); each envelope carries scope + reversibility + rollback chain + blast forecast + per-intent trust + provenance lineage + audit/replay
  - Date: 2026-05-07
  - Verification: 53 Phase 15 tests cover envelope shape, gates, all 7 outcome branches in `directMutationEngine`, and surface presence in `AuthoritativeSystemState.mutation_summary`
- [x] Empirical verification engine triangulating 3 signals: UXRemediationOutcome telemetry deltas (Phase 11) + BuildManifest cross-check (Phase 3) + Phase 14 net_delta scorer; surface-touching intents get manifest cross-check, pure operational intents (TRUST_RECALIBRATION, POLICY_NUDGE) verify on cognition signal alone
  - Date: 2026-05-07
  - Verification: 6 verification-engine tests cover verified/regression/null-outcome/operational-only paths; one bug caught + fixed during testing — initial logic incorrectly treated absence of manifest evidence as confirmed failure (tightened to: rollback only on regression OR no positive cognition signal)
- [x] 5-mode rollback coordinator (full/staged/partial/replay_aware/containment) walking envelope rollback_chain in reverse; 7 step kinds with discriminated dispatch + exhaustiveness guard
  - Date: 2026-05-07
  - Verification: 5 rollback-coordinator tests cover all modes; counter integration verified via mutationSummaryCounters bumps
- [x] `containMutationCascade(input)` orchestrated workflow bundling automation_mode→supervised + isolation entry + 30-min cooldown gate + intent freeze + audit chain + event emission; idempotent on repeat invocation
  - Date: 2026-05-07
  - Verification: 5 containment tests cover cascade, idempotency, lift, snapshot, lift-on-uncontained edge case
- [x] Per-intent-class trust calibrator (cold-start 70, formula `success / (success + rollback + 0.5×verify_failure) × 100 − 5×contained`); freeze/unfreeze; `autonomy_recommended_intent` picks highest-trust non-frozen class with at least one success
  - Date: 2026-05-07
  - Verification: 11 trust-calibrator tests cover cold-start, success/rollback/containment/verification-failure math, freeze/unfreeze, recommendation logic, avg-trust averaging
- [x] Phase 15 enums: 7 new `GovernanceAuditEntry.kind` values, 8 new `CognitiveEventKind` values, 4 new `RefreshTriggerKind` values, optional `mutation_summary` block on `AuthoritativeSystemState`; populated synchronously in `buildAuthoritativeStateFromInputs` from in-memory counters + trust profile + containment snapshot
  - Date: 2026-05-07
  - Verification: 3 surface-population tests confirm counters reflect into the engine state; `tsc --noEmit` clean across all consumers
- [x] `cognitiveHealthIndex` extended to a 3-leg `operational_stability` blend: `round((80 + autonomy_health + mutation_health) / 3)`. Same denominator (operational_stability weight 1.0 unchanged from Phase 13) — zero churn on prior 537 systemStateEngine tests
  - Date: 2026-05-07
  - Verification: 2 health-index Phase 15 tests confirm output bounds + degradation reflects; existing health-index tests stay green
- [x] 5 new endpoints in `projectRoutes.ts`: `GET /governance/mutation/envelopes`, `POST /governance/mutation/:mutation_id/rollback`, `GET /governance/mutation/trust`, `GET /governance/mutation/containment`, `POST /admin/governance/mutation/freeze-class/:intent_class`
  - Date: 2026-05-07
  - Verification: backend `tsc --noEmit` clean; routes follow the existing requireParticipant pattern from Phase 12-14
- [x] 5 new frontend hooks: `useAutonomousMutations`, `useEmpiricalValidation`, `useMutationContainment`, `useMutationTrust`, `useAutonomousRecovery` (recovery hook unifies Phase 14 self-heal + Phase 15 containment/rollback events)
  - Date: 2026-05-07
  - Verification: frontend `npx tsc --noEmit` exit 0
- [x] `AutonomousExecutionDashboard.tsx` extended in place (no parallel component) with three new sections: Direct mutations (with rollback button), Mutation containment (contained/frozen badges), Mutation trust by intent class
  - Date: 2026-05-07
  - Verification: frontend tsc clean; lifted-state + collapse pattern preserved; recommended-intent surface visible in header
- [x] `docs/PHASE_15_GOVERNED_OPERATIONAL_MUTATION_VALIDATION_REPORT.md` written covering all 14 sections (files created/modified, mutation status with real envelopes, empirical validation triangulation, 5-mode rollback, blast forecasts, containment workflow, trust evolution, autonomous recovery, execution streams, performance, test results, gaps, next phase recommendation)
  - Date: 2026-05-07
  - Verification: doc exists at the documented path; matches the Phase 13/14 validation-report format; cross-references the actual modules + sample-run outputs

### Phase 14 — Autonomous Handoff + Closed-Loop Verification (2026-05-07)
- [x] 6 new backend modules under `backend/src/intelligence/systemStateEngine/autonomy/`: `autonomousHandoffEngine.ts`, `executionVerificationListener.ts`, `autonomousRollbackEngine.ts`, `selfHealingOrchestrator.ts`, `isolationRegistry.ts`, `executionSummaryCounters.ts`
  - Date: 2026-05-07
  - Verification: backend `npx tsc --noEmit` exit 0; full systemStateEngine jest suite **537 tests passing across 14 suites** including 42 new Phase 14 tests; sample script via temp `_phase14Sample.ts` exercised every module on synthetic inputs and produced expected outputs (deleted post-run)
  - Note: Architectural commitment unchanged — Phase 14 still does NOT execute Claude Code in-process and does NOT directly mutate user-facing files. It removes the operator click between "auto-approved" and "prompt issued to handoff queue." Stress-test corrections folded in: scope renamed from "Direct Autonomous Execution" to "Autonomous Handoff", `execution/` directory collision avoided (Phase 4 owns it), `AutonomousExecutionLog` table dropped in favor of `GovernanceAuditEntry` reuse, isolation manager dropped in favor of `decideByMode` block_reasons + audit-row helpers, module count 5→3+2, frontend hooks 6→4, routes 9→5, refresh triggers 6→4, self-heal branches 4→2.
- [x] PreparedRemediationPlan extended with `direct_executed_at` (DATE) + `execution_verification_status` (STRING(25), enum `pending|verified|failed|verification_timeout`); GovernanceAuditEntry kind union extended with 7 new values; CognitiveEventKind extended with 7 new values; refreshTriggers added 4 new reasons
  - Date: 2026-05-07
  - Verification: `tsc --noEmit` clean; existing PreparedRemediationPlan / GovernanceAuditEntry consumers unaffected; no schema migration required for existing rows (additive nullable columns only)
- [x] `safeExecutionGuardrails.ts` extended with `assessBlastRadius` + `evaluateBlastRadiusGate` (heuristic composite blast_score with 4 risk factors; high tier hard-blocks autonomous handoff regardless of confidence)
  - Date: 2026-05-07
  - Verification: 5 unit tests in `phase14.test.ts` cover low/moderate/high tier inputs and gate decisions; sample run produced blast_score 100/100 → reject for the worst-case input
- [x] `autonomyTrustState.ts` extended with verification counters + `verificationSuccessRate` (cold-start returns 100); `cognitiveHealthIndex.ts` enriched so `autonomy_health = trust × success_rate × verification_success_rate × (1 - rollback_freq)`. Same denominator (operational_stability weight 1.0 unchanged) — zero churn on prior 495 systemStateEngine tests
  - Date: 2026-05-07
  - Verification: existing health-index tests pass; 4 new verification-counter tests cover cold-start, all-success, mixed, all-failure
- [x] `AuthoritativeSystemState.execution_summary` block added (sync, in-memory only) populated in `buildAuthoritativeStateFromInputs` from counters + verification rate + sync isolation count
  - Date: 2026-05-07
  - Verification: 2 tests confirm counters reflect into `execution_summary`; missing-counter case returns zero-state without crash
- [x] `systemStateEngine/index.ts` re-exports all Phase 14 modules and auto-starts `executionVerificationListener` + `selfHealingOrchestrator` on first import (idempotent guards; mirror of Phase 11 listener pattern)
  - Date: 2026-05-07
  - Verification: tsc clean; jest passes for all 14 suites with no double-start side effects
- [x] 5 new endpoints in `projectRoutes.ts`: `GET /governance/autonomy/handoffs`, `POST /governance/autonomy/:plan_id/verify`, `GET /governance/autonomy/isolations`, `POST /governance/autonomy/:plan_id/cancel-handoff`, `POST /admin/governance/autonomy/lift-isolation/:cluster_signature`
  - Date: 2026-05-07
  - Verification: `tsc --noEmit` clean; routes follow the existing requireParticipant pattern from Phase 12/13 endpoints
- [x] 4 new frontend hooks: `useAutonomousHandoffs`, `useExecutionVerification`, `useIsolationZones`, `useSelfHealingActivity` (SSE auto-refresh on the relevant `autonomy.*` event kinds via `useRealtimeAwareness`)
  - Date: 2026-05-07
  - Verification: frontend `npx tsc --noEmit` exit 0
- [x] `AutonomousExecutionDashboard.tsx` extended in place (no parallel component) with three new sections: Handoffs feed (with cancel), Isolation zones (with admin lift), Self-healing activity (with by_action summary)
  - Date: 2026-05-07
  - Verification: frontend tsc clean; lifted-state + collapse pattern preserved
- [x] `docs/PHASE_14_AUTONOMOUS_HANDOFF_VERIFICATION_VALIDATION_REPORT.md` written covering all 14 sections (files created/modified, handoff flow, verification flow, rollback flow, blast radius gate, isolation registry, self-heal branches, engine surface, health index, tests, stress-test corrections, risk register, out-of-scope deferrals)
  - Date: 2026-05-07
  - Verification: doc exists at the documented path; matches the Phase 13 validation-report format; cross-references the actual modules and test counts shipped

### IOU Demo De-Coopification Pass 1: Vertical-Neutral Demo Content (2026-05-06)
- [x] Stripped 54 co-op-specific language tokens from `frontend/src/config/demoScenarios.json` so the same library serves both co-op and IOU landing pages cleanly
  - Date: 2026-05-06
  - Verification: `node -e "JSON.parse(...)"` confirms JSON validity post-edit; zero residual matches for `cooperative|co-op|member service|member satisfaction`; commit `46cef7c` deployed via nginx rebuild
  - Note: David Lahme flagged that the IOU page's demo content (agent dialogue, narration, simulation steps) still mentioned cooperatives/members on the inside even though the page is branded IOU. Root cause: the demoScenarios.json was authored co-op-first; IOU_SCENARIO_LABELS in UtilityIOULandingPage only renamed the cards, not the demo content. Pass 1 is the broad-strokes neutralization. Pass 2 (IOU-specific narration overlay for the 4 priority scenarios: Crew Productivity, Outage Prediction, Storm Response, Rate Case Automation) is committed for end-of-week and requires architectural change to InlineDemoPlayer to accept per-scenario narration overrides.
- [x] Patch is idempotent and re-runnable via `backend/src/scripts/stripCoopFromDemoScenarios.js`
  - Date: 2026-05-06
  - Verification: re-running on already-clean JSON produces 0 replacements

### Behavioral Trigger Activation: Audit + Page Categorization Fix + Draft Campaigns (2026-05-06)
- [x] Audit script `auditBehavioralTriggers.js` written and run against prod Postgres
  - Date: 2026-05-06
  - Verification: Read-only audit returned: 0 active behavioral_trigger campaigns, 6 signal types firing in last 7d (return_visit 66/22 unique, advisory_page_visit 55/19, long_session 28/15, multi_page_session 22/11, cta_click_other 6/6, form_started 1/1), 25 visitors hot (>=75) and 4 warm (50-74) sitting unactioned
  - Note: Headline finding was that the signal layer is functional but routes nowhere because no campaigns are wired to it
- [x] `categorizePagePath` in `visitorTrackingService.ts` extended with 7 commercial-intent pages (`/utility-iou`, `/utility-ai`, `/freight-ai`, `/aixcelerator`, `/pilot-zero-risk`, `/pilot-ai-team`, `/pilot-exclusive`) categorized as `pricing`
  - Date: 2026-05-06
  - Verification: `tsc --noEmit` passes; commit `7b2b89d` deployed to prod backend container
  - Note: Root cause for pricing_visit signal under-firing — those pages were falling through to category `other`, generating only weak signals (multi_page_session at strength 15) instead of pricing_visit at strength 35
- [x] Three draft behavioral_trigger campaigns created in prod Postgres via `seedBehavioralTriggerCampaigns.js`
  - Date: 2026-05-06
  - Verification: Campaign IDs returned and confirmed: Hot Lead Personal Reach `8bfb08cb-df15-44ac-850e-900c7451eda0` (intent>=75 → Ali Personal Outreach Sequence, 168h cooldown); Advisory Page Deep Engagement `1fc821b3-916f-4de8-a41c-7759b3f0b018` (advisory_page_visit + long_session, intent>=40 → AI Workforce Designer Entry, 72h cooldown); Returning Engaged Visitor `8466f6fd-97e8-4f42-8411-3b20a45a45f2` (return_visit>=2, intent>=35 → Inbound Warm Lead Nurture Sequence, 96h cooldown)
  - Note: All three created with status=draft initially. Seed script is idempotent (skips by name on re-run).
- [x] Hot Lead Personal Reach campaign activated (status: draft → active)
  - Date: 2026-05-06
  - Verification: SQL UPDATE confirmed (`8bfb08cb-df15-44ac-850e-900c7451eda0`, started_at=2026-05-06T14:50:20Z); Ram informed via email message-id `5c14b217-02b9-1774-abc6-828260ef6dab@colaberry.com`
  - Note: First of the three trigger campaigns now live. Will catch the 25 hot leads currently scored intent>=75 and enroll them in Ali Personal Outreach (max 5 leads/cycle, 9-5 weekdays). Other two campaigns held in draft pending observation of first wave's conversion.

### LinkedIn Byline Policy: Strip on AUTHORITY_BROADCAST (2026-05-06)
- [x] `enforceSignOff()` in `openclawPlatformStrategy.ts` now actively strips the "- Ali Muwwakkil (ali-muwwakkil on LinkedIn)" byline (and the SHORT_SIGN_OFF variant) from AUTHORITY_BROADCAST output, instead of merely skipping the append step
  - Date: 2026-05-06
  - Verification: `tsc --noEmit` passes; commit `ab64d8a` deployed to prod backend
- [x] CLAUDE.md gains an "Outreach Byline Policy" section codifying when to append the byline (PASSIVE_SIGNAL, HYBRID_ENGAGEMENT) vs strip it (AUTHORITY_BROADCAST)
  - Date: 2026-05-06
  - Verification: Section visible at line 600 of CLAUDE.md
  - Note: Triggered by Dhee flagging the byline on a LinkedIn-native post draft. Root cause: hand-drafted post yesterday included the byline (carried over from cross-platform-comment template). The deterministic gate now ensures any future hand-drafted or LLM-drafted content destined for an owned channel gets the byline stripped before publishing.

### CLAUDE.md Production Hardening Frameworks Added (2026-05-05)
- [x] Modular Composition Rule (size targets, composition rules, imports as dependency declarations)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 63, no original section removed
- [x] Contract Enforcement Layer (TypeScript/Zod/typed boundaries, breaking-contract = failing build)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 90
- [x] Test Strategy Framework (70/20/10 pyramid, risk-based prioritization, mandatory test types)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 236
- [x] Idempotency & Replayability (NON-NEGOTIABLE) (concrete patterns table for Mandrill, Basecamp, webhooks, briefings)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 271
- [x] Failure-First Design (4 mandatory questions, external boundary table, forbidden patterns)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 298
- [x] Production Readiness Principles (12-Factor Adapted) (9-row principle/application table)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 327
- [x] Security Enforcement Layer (input validation, secrets, external calls, dependencies, authn/authz)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 347
- [x] Build-Break-Harden Loop (CORE EXECUTION MODEL) (3-phase rhythm, completion rule)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 384
- [x] Observability Framework (structured JSON logs, metrics, correlation IDs, error classification)
  - Date: 2026-05-05
  - Verification: Grep confirms section present at line 494
- [x] All 14 original sections preserved verbatim, no contradictions, no removals
  - Date: 2026-05-05
  - Verification: Section header inventory matches pre-change list; commit `0adf814` is +282 lines, 0 deletions
  - Note: Net file change 382 -> 664 lines. Cross-references between new sections (Failure-First → Idempotency, Observability → structured logs, Security → Contract Enforcement) added intentionally and consistently.

### CLAUDE.md v2 Reality Alignment (2026-05-05)
- [x] Adopted v2 structural improvements (Autonomy Model merge, Confidence/Diagnostic/Stall merge, hardened PROGRESS.md gate, end-of-session audit, autonomy log target)
  - Date: 2026-05-05
  - Verification: User confirmed Option B; commit `a772233` pushed
- [x] Rewrote Architecture & Folder Responsibilities sections to match actual repo layout (`/backend`, `/frontend`, `/scripts`, `/docs`, `/directives`, `/tests`, `/nginx`)
  - Date: 2026-05-05
  - Verification: `ls` confirmed described folders match what exists; `/agents`, `/services/worker`, `/config` references removed
- [x] Removed Visual-Changes Walkthrough Workflow section (transplant from advisor.colaberry.ai repo, references walkthrough scripts and AI Pathway personas not in this repo)
  - Date: 2026-05-05
  - Verification: `walkthrough_report.py` confirmed not present; advisor repo memory `reference_advisor_repo.md` confirms it lives in separate Python/FastAPI repo
- [x] Reframed Daily Executive Report to point at the Cory briefing service in `backend/src/services/` instead of nonexistent `/services/worker/daily_report.ts`
  - Date: 2026-05-05
  - Verification: User confirmed Cory briefing already implemented (per prior PROGRESS.md entry "Confirmed Ram on daily Cory briefing emails")
- [x] Softened `/tmp/autonomy_log.json` gate to "when writer lands"; stop-gap is commit body + PROGRESS.md note
  - Date: 2026-05-05
  - Verification: User confirmed Option B accepted this softening so DoD doesn't block on missing infrastructure
- [x] Added explicit "minimum now" tier to Testing & Validation Rules so DoD doesn't block on infrastructure that doesn't exist yet
  - Date: 2026-05-05
  - Verification: TypeScript still passes; PROGRESS.md hard gates retained verbatim
- [x] Pointed Escalation notify step at Mandrill email to ali@colaberry.com until `/backend` `notify_owner` worker exists
  - Date: 2026-05-05
  - Verification: Memory `reference_send_email_as_ali.md` confirms Mandrill backend transporter is the working notification path
  - Note: Net change 473 -> 382 lines (commit `a772233`). Same governance posture, accurate paths. PROGRESS.md catch-up rule and end-of-session audit retained verbatim from v2 paste.

### Medium Platform Deactivation (2026-05-05)
- [x] Removed `'medium'` from `ARTICLE_PLATFORMS` in `openclawAuthorityContentAgent.ts` — no more Medium articles generated
- [x] Removed `medium` rows from `PLATFORM_STRATEGY` and `PLATFORM_EXECUTION` maps in `openclawPlatformStrategy.ts`
- [x] Removed `medium` from `isLinkAllowed` article-platform allowlist
- [x] Guarded `postToMedium()` with immediate throw in `openclawPlatformPostingService.ts`; removed `'medium'` from `hasPlatformCredentials`
- [x] Removed `'medium'` from `hasBrowserSupport` allowlist and dispatcher in `openclawBrowserPostingService.ts`
- [x] Removed `case 'medium':` and `postToMedium` import from `openclawBrowserWorkerAgent.ts`; dropped Medium from `useHeadless` lists
- [x] Removed `'medium'` from circuit breaker platform list in `openclawCircuitBreaker.ts`
- [x] Removed Medium RSS scanner case from `openclawMarketSignalAgent.ts`
- [x] Admin auto-publish route in `openclawRoutes.ts` now returns HTTP 410 for Medium
- [x] Deployed (commit `7c650dc`, backend container rebuilt on VPS)
  - Note: Medium permanently banned the Colaberry account (Trust & Safety confirmed not eligible for restoration). Implementation code (`postToMedium`, `postToMediumBrowser`) left intact as dead reference; historical DB records and existing tracked URLs untouched.

### OpenClaw Outreach Persona Realignment (2026-05-05)
- [x] Rewrote `SYSTEM_PROMPT` and `SYSTEM_PROMPT_WITH_LINK` in `openclawContentResponseAgent.ts` from "founder of 6-week accelerator" to "AI Systems Architect who designs and builds AI systems for operating companies"
- [x] Replaced "I wrote more about this here" link framing with "working tool" framing pointing at `advisor.colaberry.ai/advisory`
- [x] Added explicit no-cohort/no-class/no-curriculum rule across all outreach prompts
- [x] Rewrote fallback templates in `openclawContentResponseAgent.ts` to match new positioning
- [x] Updated `openclawLinkedInCommentMonitorAgent.ts` reply persona and rules
- [x] Updated `openclawAuthorityContentAgent.ts` LinkedIn post + article generation prompts with AI-org-redesign thesis
- [x] Removed "Join our next cohort" example CTA from `AUTHORITY_BROADCAST` strategy in `openclawPlatformStrategy.ts`
- [x] Deployed (commit `5eb0804`, backend container rebuilt on VPS)
  - Note: Triggered by Dhee flagging that posts said "I wrote more about this here" and linked to a suspended Medium account. Core thesis is now "companies do not get AI leverage from picking better tools, they get it by redesigning the operation around AI as the operating layer."

### Investor-Owned Utility (IOU) Landing Page (2026-05-04)
- [x] Created `frontend/src/pages/UtilityIOULandingPage.tsx` — parallel of `UtilityCoopLandingPage` reframed for IOUs (Duke, Oncor, Exelon)
- [x] Audience reframed: Wall Street pressure, PUC scrutiny, rate-case defendability, IBEW/union sensitivity
- [x] Scale shifted: $50–500M field-ops budgets (vs $8–25M co-op), $25M+ savings on $250M base
- [x] Tech stack mentions: Oracle CIS, SAP, Maximo, OSI Monarch OMS, GE Smallworld, AMI head-ends, data lake
- [x] Compliance: NERC CIP, SOX, SOC 2, FERC/PUC reporting
- [x] Funding hook: IRA Section 45 grid program, DOE GRIP/GRP, grid resilience tax credits (replaced USDA RUS)
- [x] "Capability Build" / "Managed Delivery" path labels for enterprise procurement vocabulary
- [x] `IOU_SCENARIO_LABELS` map overrides title/description/KPI for member-services, storm-response, smart-metering, rate-case, regulatory-compliance scenarios
- [x] Role-personalized variants via `?role=ceo|cio|cfo|ops` URL param
- [x] Presenter mode via `?presenter` URL param (5 narration pause points)
- [x] Booking attribution: `pageOrigin: '/utility-iou'` for clean funnel separation
- [x] Route registered in `frontend/src/App.tsx`
  - Note: Built in response to David Lahme's IOU prospect requests (Duke, Oncor, Exelon connections). 4-bullet talking script per demo also delivered to David for the walkthrough team.

### Enhancement Prompt Builder (2026-04-20)
- [x] Extended `DetectedGap` with `suggested_agent` field in `gapDetectionEngine.ts`
- [x] Autonomy gaps included eagerly in BP detail response (`projectRoutes.ts`)
- [x] Combined prompt endpoint + `generateCombinedPrompt` function (`promptGenerator.ts`)
- [x] Backend context auto-loads on mount (removed manual button)
- [x] Created `EnhancementPromptBuilder.tsx` — unified execution steps + autonomy gaps with checkboxes
- [x] Replaced Section 8 in `PortalBusinessProcessDetail.tsx` with EnhancementPromptBuilder
- [x] Removed duplicate Path to Autonomous from PredictionModal + standalone report modal
- [x] TS strict null fix in `backendContextService.ts`
  - Note: Pre-existing error blocked prod build; fixed regex match null check

### System Blueprint — Prompt #1 (2026-04-21)
- [x] Created `SystemBlueprint.tsx` — new default portal page
- [x] Updated `portalRoutes.tsx` — `/portal/project` redirects to `/portal/project/blueprint`
- [x] Old dashboard moved to `/portal/project/system`
- [x] Updated `PortalLayout.tsx` — added Blueprint + System View nav links with `end` prop

### System Blueprint — Prompt #2: Inline Build Experience
- [x] Generate Build Prompt button → calls existing prompt generator
- [x] Prompt display with copy-to-clipboard
- [x] Execution input textarea for pasting Claude Code output
- [x] Validate Build button → calls existing validation-report endpoint
- [x] Auto-advance: re-fetches data after validation, updates progress without reload
- [x] Component grid highlights active component, dims others during build flow

### System Blueprint — Prompt #3: Intelligence Layer
- [x] "Why This Step Matters" — deterministic reasoning from layer state + coverage
- [x] Improved step titles (human-readable from prompt target)
- [x] System Status card — Backend/Frontend/Agents Ready/Missing
- [x] "What Just Improved" — post-validation delta display with before/after metrics
- [x] "After This Step" — preview of upcoming step
- [x] Micro-feedback during prompt generation

### System Blueprint — Prompt #4: Continuous Build Flow
- [x] Auto-copy prompt to clipboard on generation
- [x] "Open Claude" button → claude.ai in new tab
- [x] Waiting state with pulsing animation + guidance text
- [x] Smart paste detection (green border + "Ready to validate")
- [x] "Analyzing your build..." validating state
- [x] Full-width celebration card with staggered animations
- [x] Focus mode — hides summary/status/grid during build flow
- [x] "Switch Step" link to exit flow

### System Blueprint — Prompt #5: UX Polish + Demo Mode
- [x] Demo mode via `?demo=true` URL param or "Watch 60s Demo" button
- [x] 7-step demo with mock data (zero backend calls)
- [x] Demo overlay with fade-in animation
- [x] Upgraded celebration: rocket icon, dynamic subtext, `celebrationPop` animation
- [x] Updated waiting state copy: "Run this in Claude Code — your system is about to evolve"
- [x] `getCelebrationSubtext()` — contextual messages based on files created

### System Blueprint — Prompt #6: Production Polish
- [x] Demo timing slowed: 5s→6s per step, celebration 7s→9s (total ~34s)
- [x] Demo overlay text polished (7 updated copy lines)
- [x] "Guided Build Mode (Beta)" dismissible banner
- [x] Staggered fade-in animation for celebration improvements (`fadeSlideUp`)
- [x] Demo entry fade animation (`demoFadeIn`)
- [x] Demo auto-start guard via `useRef` (prevents re-trigger on re-render)
- [x] Comment header for demo mode documentation

### System Blueprint — Prompt #7: Pre-Deploy Adjustments
- [x] Demo timing increased: +1s each step, celebration to 9s (total ~42s)
- [x] Banner dismissal persisted via `localStorage`
- [x] Celebration subtext: "You're now closer to a production-ready system."
- [x] TS fix: `target || 'backend_improvement'` fallback for null promptTarget

### System View — Prompt #8: 3-Tab Restructure
- [x] Replaced 5 tabs (Overview/BP/Execution/Code Intelligence/System Evolution) with 3 tabs (Understand/Build/Improve)
- [x] Legacy hash URLs auto-mapped to new tabs
- [x] "Show Advanced Details" toggle on each tab for power users
- [x] Understand: KPI bar + Architecture + BP grid + GitHub
- [x] Build: Full BP list with detail panels + War Room + Requirements (advanced)
- [x] Improve: Add BP + System Documents + Mode Selector + Readiness (advanced)

### System View — Prompt #9: Visual Builder + Component Linking
- [x] Blueprint component cards navigate to System View with `?componentId=xyz#build`
- [x] `PortalBusinessProcessesTab` accepts `initialSelectedId` prop
- [x] Visual Builder in Improve tab: live preview iframe + 5 quick action buttons
- [x] Issue detection + display with Fix/Dismiss buttons
- [x] Fix All button → generates consolidated prompt
- [x] Inline validation textarea + Validate Fix button
- [x] Preview auto-refresh after validation (iframe key increment)

### System View — Prompt #10: UX Continuity
- [x] Component persistence via `localStorage` (`active_component_id`)
- [x] No-preview empty state: "Preview not available yet" + "Build Frontend" button
- [x] Fix flow feedback: "Applying improvements and refreshing your UI..." transition
- [x] 400ms delay before preview refresh for smooth UX

### Cory AI — Prompt #11: Autonomous Mode
- [x] Cory panel on Blueprint with 1-3 deterministic suggestions
- [x] Autonomous mode toggle (Manual ↔ Autonomous) — visual only
- [x] "Apply Suggestion" triggers build flow
- [x] "Dismiss" removes suggestion for session
- [x] AI Suggestions section in System View Improve tab (groups by Behavior/Intelligence/Optimization/Reporting)

### Cory AI — Prompt #12: Plan + Approval System
- [x] Plan/Suggestions toggle in Cory panel (Plan is default)
- [x] 3-phase evolution plan: Foundation → Usability → Intelligence
- [x] Each step: checkbox, title, impact badge, Apply button
- [x] Start Phase button for batch execution
- [x] Progress tracking with completion %, done states
- [x] Cory Plan section in System View Improve tab (read-only)

### Cory AI — Prompt #13: Autonomous Execution Queue
- [x] "Execute Plan" button collects all incomplete steps into queue
- [x] Execution Mode header: step X of N, progress bar, completed step badges
- [x] Auto-advance to next step after validation
- [x] Pause/Resume controls
- [x] Exit Plan to abandon queue
- [x] Queue-aware "Next Step" / "Complete Plan" button in build flow

---

### Executive Inbox Chief of Staff System (2026-04-16 → 2026-04-17)
- [x] 9 Sequelize models: InboxEmail, InboxClassification, InboxVip, InboxRule, InboxReplyDraft, InboxStyleProfile, InboxLearningEvent, InboxDigestLog, InboxAuditLog
- [x] 11 backend services: inboxSyncService, msGraphService, graphMailService, hardRuleEngine, llmClassificationService, inboxStateManager, replyDraftService, askUserDigestService, autoArchiveService, inboxAuditService, styleLearningService, inboxScheduler, smsAlertService, calendarIntelligenceService
- [x] Routes + controller: 20 API endpoints under /api/admin/inbox/*
- [x] 6 admin pages: Decisions Queue, Draft Approval, Rule Builder, VIP Manager, Learning Insights, Audit Log
- [x] 5 shared components: ClassificationBadge, EmailPreviewCard, DraftEditor, RuleFormModal, InboxBatchActionBar
- [x] Consolidated to single /admin/inbox route with InboxCOSPage (tabbed wrapper)
- [x] Gmail API (ali@colaberry.com + alimuwwakkil@gmail.com) with gmail.modify scope for archiving
- [x] Microsoft Graph API (ali_muwwakkil@hotmail.com) via Azure AD app registration
- [x] 852 AUTOMATION emails archived from actual Gmail inboxes
- [x] SMS alerts via T-Mobile gateway: VIP emails, urgent keywords, ASK_USER digest, daily summary
- [x] Calendar intelligence: morning brief, meeting prep (15 min before), conflict detection (once/day)
- [x] Hotmail forwarding disabled after native Graph API access established
- [x] Bug fixes: confidence x100 display, invalid dates, missing subjects, UUID type mismatches, draft field mappings, provider color-coding
  - Note: Multiple TypeScript type fixes needed for UUID string vs number mismatches across all inbox pages

### AI Advisory Taxonomy System (2026-04-15 → 2026-04-18)
- [x] taxonomy_registry.py: deterministic seed → cache → sync LLM generation for industry taxonomies
- [x] recommendation_engine.py: outcomes weighted by taxonomy pain_catalog, system labels from taxonomy
- [x] capability_mapper.py: pain-driven score boost, Q4/Q8 frustration weighting, taxonomy dept expansion
- [x] agent_generator.py: all taxonomy agent_roles surface for generated industries
- [x] routes.py: swapped detect_industry+get_profile for lookup_taxonomy (impacts agent_generator + impact_calculator)
- [x] 20-scenario smoke test passing: all 20 industries produce industry-specific, pain-grounded recommendations
- [x] Added staffing seed profile (Talent Matching Intelligence, AI Resume Matcher, etc.)
- [x] Fixed law firm → real estate alias collision (renamed label, front-of-text label weighting)
- [x] Fixed nonprofit → increase_revenue (suppressed for nonprofits)
- [x] Fixed outcome scoring: taxonomy pains weighted 5x, tightened improve_cx keywords
- [x] Fixed system label mapping: SYSTEM_TO_DEPT_CANDIDATES multi-key lookup for generated taxonomies
- [x] LLM prompt: require canonical dept keys, clarify system_names are AI system names not tool names
  - Note: Jim Weikert demo revealed vague responses; 6 iterations to fix all 20 scenarios

### Campaign Graduation System (2026-04-20)
- [x] campaignGraduationService.ts: Phase 1 → Phase 2 → Phase 3 automatic promotion
- [x] Phase 1→2: completed + engaged (opened or clicked), Phase 2→3: completed
- [x] Runs every 6 hours via scheduler
- [x] Initial graduation: 584 leads Phase 1→2, 30 leads Phase 2→3, 206 skipped (no engagement)

### OpenClaw Fixes (2026-04-20)
- [x] Fixed quality gate: LinkedIn sign-off only required for LinkedIn posts (was rejecting 653 Medium posts)
- [x] Fixed link strategy: Dev.to + Hashnode articles now include tracked CTA links
- [x] Fixed Dev.to 404/429 handling: verify article exists, handle rate limits, auto-cancel stale articles
- [x] Added 72-hour stale response auto-expiry to supervisor (prevents backlog)
- [x] Cleaned 740 stale responses from backlog
- [x] Re-queued 632 wrongly rejected responses
  - Note: Medium + LinkedIn blocked by Cloudflare on Hetzner IP — moved to manual posting workflow

### Content Queue System (2026-04-20)
- [x] ContentQueuePage.tsx: card-based UI with Copy/Mark Posted/Skip per piece
- [x] contentQueueRoutes.ts: API for manual posting queue
- [x] Sidebar link added next to Inbox COS
- [x] 131 Medium + 17 Product Hunt responses available for manual posting

### Lead Ingestion Controls (2026-04-20)
- [x] Disabled auto-enrollment for external source leads (colaberry.ai, trustbeforeintelligence.ai)
- [x] External leads ingested but NOT enrolled in Inbound Warm Lead Nurture
  - Note: User wants to decide approach for outside leads separately with team

### Apollo Cold Lead Import (2026-04-20)
- [x] Searched 4 ICP profiles: VP AI/DT, CTO/CIO, SVP/VP Engineering, Utilities operations
- [x] 210 new leads imported with enrichment (phone reveal)
- [x] 300 total enrolled in Cold Outbound Q1 sequence (210 new + 90 previously unenrolled)
- [x] All synced to GHL

### Calendar & SMS Fixes (2026-04-17 → 2026-04-21)
- [x] Fixed SMS encoding: =?utf-8?Q??= artifact in T-Mobile gateway texts
- [x] Fixed conflict detection: ignore all-day events, multi-day spans, same-title recurring
- [x] Fixed conflict alert spam: once per day only (was every 5 minutes)
- [x] Fixed meeting prep spam: once per meeting, tracked by event key
- [x] Calendar brief: summary only ("13 meetings today (9:30-1:30). Next: Colaberry.AI at 9:30")

### Miscellaneous (2026-04-16 → 2026-04-20)
- [x] Disabled StudentProgressMonitor (class hasn't started, was sending excessive absence alerts)
- [x] Confirmed Ram on daily Cory briefing emails (admin_notification_emails setting)
- [x] Created Ryan Landry demo meeting (Tue Apr 21, 2pm CDT, Google Meet)
- [x] Dhee outreach email sent with new daily schedule + step-by-step instructions
- [x] Basecamp + UptimeRobot rules created (auto-filter to AUTOMATION)
- [x] 107 Basecamp/UptimeRobot emails reclassified + archived from Gmail

---

## Upcoming Work

### BP "Next Step" Always Advances Forward (2026-04-27)
- [x] `requirementToStepService.ts` — removed `!hasSystemGap` escape that re-emitted completed steps; tag every step `status: 'pending'`
- [x] `projectRoutes.ts:enrichCapability` — union `last_execution.completed_steps` with derived signals (system-layer presence, coverage thresholds, quality scores) so completion stays in sync regardless of how a requirement was finished
- [x] `projectRoutes.ts` BP detail endpoint — new `enhancement_plan` array + `next_action_kind: 'build'|'enhance'|'done'` field; defense-in-depth filter on `execution_plan` for any leftover completed entries
- [x] `EnhancementPromptBuilder.tsx` — accepts `enhancementPlan` + `nextActionKind`, renders an enhance-mode list with "Run Improvement" CTA; defensive `status !== 'completed'` filter on execution steps
- [x] `PortalBusinessProcessDetail.tsx` — forwards new fields to the builder; section title flips between Enhancement Prompt Builder / Improvement Options / Status
- [x] `SystemViewV2.tsx` — added `getEnhanceCards` helper; Overview/Build/Health/Improve tabs now surface unified enhancement options when `next_action_kind === 'enhance'` and a "Fully built — pick another BP" empty state when `'done'`
- [x] One-shot data backfill on ShipCES (`8047024f-…`) — recomputed `last_execution.completed_steps` for 59 of 72 capabilities so existing 100% BPs jump straight to enhance mode without waiting for the next user action
  - Note: User reported CES project was stuck — every "next suggested step" was already completed, forcing the user to skip tasks to move forward. Root cause was three layers of stale completion tracking diverging.

### Architect Build Status Bug Fixes (2026-04-27)
- [x] Fixed `getArchitectStatus` regex matching wrong element — was capturing the parent `phase-nav` container instead of the active `phase-nav-item current` (caused `complete: true` to never be reported)
- [x] Added definitive completion signal via redirect URL (`/<slug>/complete`)
- [x] Removed timestamp suffix from Architect-side project name so the doc title equals the project title (was `"Project Name - mohivmqv — Build Guide"`, now `"Project Name — Build Guide"`)
- [x] Added `documentTitle`, `documentFilename`, `requirementsLoaded` to `architect-status` response for any download UI
- [x] SystemBuildDemo now also accepts `requirements_loaded` (not just `activated`) to skip the scripted animation on refresh — covers cases where activation fails silently but the doc was saved
  - Note: All three user-visible symptoms (demo spins forever, refresh restarts the demo, doc filename includes timestamp) traced to the single regex bug and the timestamped naming. Pending production deploy after hours.

### AI System Pilot Program (2026-04-22)
- [x] seedPilotProgramCampaigns.ts — 3 sequences (12 AI-generated emails), 3 campaigns, 3 LandingPage records
- [x] PilotZeroRiskPage.tsx — "Deploy a Real AI System in 14 Days" for skeptical executives
- [x] PilotAITeamPage.tsx — "Replace a Junior Developer With an AI System" for cost-conscious operators
- [x] PilotExclusivePage.tsx — "We're Building 10 AI-Driven Companies" for ambitious founders
- [x] importPilotLeads.js — Apollo import script for 300 leads (100 per campaign)
- [x] Routes registered in publicRoutes.tsx, seed integrated into seedAllCampaigns.ts
- [ ] Deploy + seed + Apollo import + QA + activate campaigns

---

- [ ] Fix SMS encoding on T-Mobile gateway (vtext.com vs tmomail.net — needs user confirmation which worked)
- [ ] LinkedIn content strategy: generate drafts for manual posting via Content Queue
- [ ] Medium browser session refresh (or transition fully to manual posting)
- [ ] Review 283 high-intent OpenClaw responses for manual follow-up
- [ ] Set up routing rules for external lead sources (colaberry.ai, trustbeforeintelligence.ai)
- [ ] Expand demo mode with project-specific mock data
- [ ] Add onboarding tour for new users

---

## Key Files Modified (This Session)

| File | Changes |
|------|---------|
| `frontend/src/pages/project/SystemBlueprint.tsx` | Created — full guided build experience |
| `frontend/src/pages/project/ProjectDashboard.tsx` | Restructured tabs, Visual Builder, Cory Plan, AI Suggestions |
| `frontend/src/routes/portalRoutes.tsx` | Added /blueprint route, moved dashboard to /system |
| `frontend/src/components/Layout/PortalLayout.tsx` | Updated nav links |
| `frontend/src/components/project/PortalBusinessProcessesTab.tsx` | Added initialSelectedId prop + localStorage persistence |
| `frontend/src/components/project/EnhancementPromptBuilder.tsx` | Created — unified prompt builder |
| `frontend/src/components/project/PortalBusinessProcessDetail.tsx` | Backend context auto-load, removed duplicate Path to Autonomous |
| `frontend/src/components/project/PredictionModal.tsx` | Removed Path to Autonomous section |
| `frontend/src/services/portalBusinessProcessApi.ts` | Added generateCombinedPrompt |
| `backend/src/intelligence/requirements/gapDetectionEngine.ts` | Added suggested_agent field |
| `backend/src/intelligence/promptGenerator.ts` | Added generateCombinedPrompt function |
| `backend/src/routes/projectRoutes.ts` | Eager autonomy gaps + combined-prompt endpoint |
| `backend/src/services/backendContextService.ts` | TS null fix |
| `docs/ACCELERATOR_PORTAL_SYSTEM.md` | Created — comprehensive system documentation |
| `CLAUDE.md` | Added Session Start Protocol + Progress Update Rule |
| `PROGRESS.md` | Created (this file) |
| `frontend/src/pages/UtilityIOULandingPage.tsx` | Created — IOU landing page parallel to co-op page (2026-05-04) |
| `frontend/src/App.tsx` | Registered `/utility-iou` route (2026-05-04) |
| `backend/src/services/agents/openclaw/openclawContentResponseAgent.ts` | Rewrote system prompt + link framing for AI Systems Architect persona (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawLinkedInCommentMonitorAgent.ts` | Updated reply persona to AI Systems Architect (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawAuthorityContentAgent.ts` | Realigned post/article prompts + Medium removed from `ARTICLE_PLATFORMS` (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawPlatformStrategy.ts` | Replaced cohort CTA + removed Medium routing (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawPlatformPostingService.ts` | Guarded `postToMedium` with throw + removed Medium from credential check (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawBrowserPostingService.ts` | Removed Medium from browser-support list and dispatcher (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawBrowserWorkerAgent.ts` | Removed Medium dispatcher case + import + headless flag (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawCircuitBreaker.ts` | Removed Medium from rate-limit tracking list (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawMarketSignalAgent.ts` | Removed Medium RSS scanner case (2026-05-05) |
| `backend/src/routes/admin/openclawRoutes.ts` | Auto-publish returns HTTP 410 for Medium (2026-05-05) |
| `CLAUDE.md` | v2 reality alignment: actual paths, advisor walkthrough section removed, autonomy_log gate softened (2026-05-05) |
| `CLAUDE.md` | +9 production hardening sections (Modular Composition, Contract Enforcement, Test Strategy, Idempotency, Failure-First, Production Readiness, Security, Build-Break-Harden, Observability) (2026-05-05) |
| `backend/src/services/agents/openclaw/openclawPlatformStrategy.ts` | enforceSignOff actively strips byline for AUTHORITY_BROADCAST destinations (2026-05-06) |
| `CLAUDE.md` | Outreach Byline Policy section: append byline for cross-platform comments, strip for AUTHORITY_BROADCAST (2026-05-06) |
| `backend/src/services/visitorTrackingService.ts` | categorizePagePath extended with 7 vertical/pilot landing pages mapped to 'pricing' category (2026-05-06) |
| `backend/src/scripts/auditBehavioralTriggers.js` | New read-only audit script for behavioral_trigger campaign coverage and signal firing (2026-05-06) |
| `backend/src/scripts/seedBehavioralTriggerCampaigns.js` | New idempotent seed script creating 3 draft behavioral_trigger campaigns wired to existing sequences (2026-05-06) |
| `frontend/src/config/demoScenarios.json` | Stripped co-op-specific language (cooperative, members, Member Service Bot, etc.) so the shared scenario library serves both IOU and co-op pages cleanly (2026-05-06) |
| `backend/src/scripts/stripCoopFromDemoScenarios.js` | New idempotent script that performs the de-coopification replacements (2026-05-06) |
