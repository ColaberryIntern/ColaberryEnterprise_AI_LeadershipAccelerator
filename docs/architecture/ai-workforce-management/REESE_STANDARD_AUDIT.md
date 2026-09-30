# Reese Employee Standard 2.0 Audit

Program Phase 0, AI Employee Consolidation. Produced by a read-only discovery agent against worktree HEAD `2543d85e`; persisted by the orchestrator (session CC-20260915-a1x7) after the worktree was fast-forwarded to `14dc8266`.

**Orchestrator corrections applied AFTER the agent's read (the tree moved under it by 6 commits, one file):**

- **Gap 2 (autonomy classification not wired to boot) is CLOSED.** PR #2540 merged 2026-09-15T22:29Z. `agentRegistrySeed.ts` now imports `classifyNewAgentAutonomyLevel` and `maybeReclassifyAutonomyLevel` from `agentAutonomyReclassificationService.ts` and calls both in the registry loop. Everywhere below that says "PR #2540 OPEN" read "merged and wired".
- **Gap 7 (enforce mode would hard-block Reese's outreach as `level_forbids:write`) is CLOSED for Reese by the same PR, pending one production check.** `agentAutonomyReclassificationService.ts:30` stamps `autonomy_level_set_at` together with `autonomy_level_source: 'auto'`; production shows Reese at `autonomy_level: communicate`, `source: auto` (query 2026-09-15). With the stamp present, `resolveLevel` honours the column and `communicate` permits `write`. Phase 1 must confirm `autonomy_level_set_at IS NOT NULL` on Reese's production row. Reese still has no `AGENT_PERMISSIONS` entry (verified: `grep Reese agentPermissionService.ts` is empty); that is a documentation-of-intent gap now, not a blocking one.

Everything else in the agent's report stands as written. Score restated with the corrections: **19 PRESENT / 12 PARTIAL / 5 ABSENT**, and **8 open gaps** (skill's #1, #3, #4 plus new #5, #6, #8, #9, #10; with #11-#14 as lesser findings).

Sources read in full by the agent: `backend/src/services/reese/*.ts` (20 files, 2,924 lines), `backend/src/services/agentBlueprint/*.ts` (10 files, 1,313 lines), `agentRegistrySeed.ts` Reese entries (lines 2425-2577, 3034-3051), `.claude/skills/onboard-ai-agent/SKILL.md`, plus the governance modules each obligation routes through.

---

## 1. Obligation scorecard

Legend: G = GENERIC (keyed on any ai_agents.id / email), R = REESE-SPECIFIC (hardcodes Reese constants or imports reeseIdentitySeed).

### Identity and presence
| # | Obligation | Score | Evidence (file:line) | G/R |
|---|---|---|---|---|
| 1 | Canonical AiAgent record | PRESENT | agentRegistrySeed.ts:2427-2451 (`agent_name:'Reese'`, `system_prompt: REESE_PERSONA_BLOCK`, `tools_granted` x4, `persona_version:'2026-08-06'`); refreshed every boot at :3008-3010 | G (registry loop) / R (entry data) |
| 2 | AdminUser + Enrollment + CommunityMember linkage | PRESENT | agentIdentitySeed.ts:227-273 (findOrCreate x3, `agent_id` FK link, self-heal :271); called via reeseIdentitySeed.ts:68-91; boot hook agentRegistrySeed.ts:3039 | G (seedAgentIdentity) / R (config wrapper) |
| 3 | reports_to resolves to a real human | PRESENT | reeseIdentitySeed.ts:90 `reportsToAgentName:'workforce_intelligence_engine'`; seed writes `reports_to_type='agent'` at agentIdentitySeed.ts:326-337; WIE has `reportsToOrgMemberId: ORG_MEMBER.KES` (ticketCreatorIdentitySeed.ts:153) = org_member `3df017df-affa-49ab-884f-a99a4bd2ef4e` (:20). Chain: Reese -> workforce_intelligence_engine -> [human] Kes, walked by ticketCreatorReportsToResolver.ts:91-111. Seed is self-heal-only-when-null (:320), so a stale DB value would not be corrected. **Orchestrator note: `workforce_intelligence_engine` is `enabled=false` in production.** | G |
| 4 | Avatar/profile metadata | PARTIAL | CommunityMember.avatar_url exists (CommunityMember.ts:11,29,58) but seedAgentIdentity never sets it (agentIdentitySeed.ts:244-252 sets only display_name/role/last_active_at). Nothing in reese/ or agentBlueprint/ references avatar. | G (column) / no seed path |
| 5 | Shared always-online presence heartbeat with truthful activity | PARTIAL | reesePresenceHeartbeat.ts:21-34 touches only `last_active_at` every minute (schedulerService.ts:1716). REESE-SPECIFIC: imports `REESE_EMAIL` (:2) and queries by it (:22). No "current activity / last action" text is written anywhere; presence reads online whether or not Reese is doing work. Truthful last-action signal exists separately via `trust_contract.last_activity_at` (agentDetailService.ts:365,486). | R |
| 6 | Agent Detail page, all tabs | PRESENT | getAgentDetail(agentId) agentDetailService.ts:270-491 generic; 8 tabs in AgentDetailV2Header.tsx:12-22 (At a Glance, Live Status, Overview, Work & Decisions, Talk, Reports, Performance, Trust & Control). SKILL.md line 43 lists an older tab set - stale. | G |
| 7 | Talk experience using real prompt + approved memory | PRESENT | agentManagerConversationService.ts:408 passes `agent.system_prompt`; :409 tags `agent_id`; agentManagerConversationPrompt.ts:64-84 injects directives + `getApprovedMemoryTexts`. SKILL.md line 44 cites the wrong path (real path is `services/agentBlueprint/`). | G |

### Role and accountability
| # | Obligation | Score | Evidence | G/R |
|---|---|---|---|---|
| 8 | Role charter | PARTIAL | Model + service generic (agentRoleCharterService.ts:24-87), injected into both prompt paths (agentContextLayers.ts:18-29; agentSystemPrompt.ts:107-110). No seed writes a charter for Reese; only writer is the manager PUT route (:67). Runtime returns `''` when unset. | G (mechanism) / ABSENT (Reese content) |
| 9 | Mission / responsibilities / boundaries / KPIs | PARTIAL | Charter carries roleTitle/mission/responsibilities/kpis (agentRoleCharterService.ts:11-18) - no `boundaries` field. Boundaries exist only as prompt prose (reeseSystemPrompt.ts:44-54) and code constants (reeseAutonomousOutreachService.ts:23-26). | G / R |
| 10 | Owned outcomes | PARTIAL | Per-outreach `goal` string persisted on ReeseOutreach (reeseAutonomousOutreachService.ts:28-31,190) and closed with evidence (reeseOutreachFollowUpService.ts:78-115). No agent-level owned-outcome record; agentGoalService is manual. | R / G |
| 11 | Named human manager | PRESENT | See #3 (resolves to Kes). Manager authorization gate agentManagerAuthMiddleware.ts:50-94 uses `isAgentInHumanDownstream(orgMember.id, agentId)`. | G |
| 12 | Escalation policy | PARTIAL | `escalate()` reeseOutreachFollowUpService.ts:117-128 after MAX_ATTEMPTS=3: adds a ticket comment and sets row `status:'escalated'`. Does NOT reassign the ticket to the resolved human, does not change ticket status, sends no notification. | R |
| 13 | Inter-agent handoff contract | ABSENT | No handoff/delegation path in reese/. Reese never routes work to workforce_intelligence_engine or any sibling. | - |
| 14 | Manager directives and 1:1s | PRESENT | managerDirectiveService.ts:64-112 (injected at agentSystemPrompt.ts:115-116 and agentManagerConversationPrompt.ts:70-78); agentOneOnOneService.ts:62-98; routes gated by requireAgentManagerOrAdmin. | G |
| 15 | Report subscriptions and commitments | PARTIAL | agentReportSubscriptionService.ts:82-126 generic CRUD + report runs/preview routes. No "commitments" concept for agents. No subscription seeded for Reese. | G |

### Intelligence and evidence
| # | Obligation | Score | Evidence | G/R |
|---|---|---|---|---|
| 16 | Domain-specific context assembly | PRESENT | buildAgentSystemPrompt (agentSystemPrompt.ts:95-146) layers: safety rules -> charter -> persona -> directives -> memory -> reliability -> learner context -> extra blocks -> closing. Reese adds highlights via `extraBlocksBeforeClosing` (reeseSystemPrompt.ts:93-99). | G / R (highlights) |
| 17 | Source provenance and freshness | PARTIAL | SnapshotField carries sourceSystem/sourceRecordIds/observedAt/freshnessPolicy (studentSuccessSnapshot/types.ts:19-28). Freshness is a declared policy string only - `'stale'` is defined (types.ts:17) but never produced by any source. | G (student-keyed) |
| 18 | Evidence reliability states | PRESENT | FieldStatus known/unknown/not_applicable/stale/quarantined/conflicting (types.ts:17-27); assembleEvidence partitions usable vs excluded (evidenceAssembly.ts:97-132); reliability block always present in prompt (agentContextLayers.ts:38-46). | G |
| 19 | Metric quarantine | PARTIAL | metricReliabilityService.ts generic (fail-closed isMetricUsable :121). Only `attendance` is gated (attendanceSource.ts:24-32). Outreach signals (reeseSignalService.ts:64,106) have NO quarantine gate - outreachChecklist.ts:38 hard-codes `validate_evidence_reliability: false`. | G / gap on Reese's signals |
| 20 | Explicit uncertainty | PRESENT | Below MINIMUM_KNOWN_CATEGORIES=3 no LLM call, band 'insufficient_evidence' (evidenceAssembly.ts:13,56-61; assessStudentHealth.ts:66-76); unansweredQuestions persisted (:108); reeseTools.ts:59 returns `notKnown`; platformSafetyRules.ts:36-37. | G |
| 21 | Stateful work plans and mandatory checklists | PARTIAL | Three checklists (checklistDefinitions.ts:33-70), persisted per run. Outreach/closure checklists are OBSERVATIONAL ONLY - written after the send/close, never gating (outreachChecklist.ts:9-14; closureChecklist.ts:9-12). Only the assessment checklist gates anything. | G (engine) / R (derivations) |
| 22 | Approved memory only; no self-approval | PRESENT | Runtime reads only `status:'approved'` (agentMemoryProposalService.ts:132-135); proposals always 'pending' (:74); approve/reject only via requireAgentManagerOrAdmin routes (agentMemoryProposalRoutes.ts:17-26). No agent code path can approve; no explicit reviewer!=proposer check. | G |

### Tools and execution
| # | Obligation | Score | Evidence | G/R |
|---|---|---|---|---|
| 23 | Structured real tools mapped to implementation | PRESENT | tools_granted x4 (agentRegistrySeed.ts:2449) documented in TOOL_CAPABILITIES (agentToolCapabilities.ts:44-62); 2 are real LLM function tools (reeseTools.ts:26-43, :87-99); `read_attachments` grant in agentToolRegistry.ts:22 (key `'reese'`). Three disjoint tool registries: tools_granted (DB), TOOL_CAPABILITIES, agentToolRegistry GRANTS - `read_attachments` is NOT in tools_granted. | G / R (grants by name) |
| 24 | Authorization before every write / external side effect | PARTIAL | Outreach path: authorizeTicketDispatch BEFORE initiateDm (reeseAutonomousOutreachService.ts:154-163). Reply path: NONE (reeseReplyService.ts:199-202; PR #2477 OPEN). Follow-up sends: NONE (reeseOutreachFollowUpService.ts:130-146). Welcome DMs: NONE (reeseWelcomeService.ts:222-226). Ticket closes/escalations: NONE. Bridge is shadow-only by contract (agentActionAuthorizationBridge.ts:11-16) and passes agentName as agentId (:74). | G (bridge) / R (call sites) |
| 25 | Risk tier | PARTIAL | `RISK_TIER='R3'` (reeseAutonomousOutreachService.ts:26), stamped on ticket (:139) and ReeseOutreach (:195). Only the outreach path carries a tier. | R |
| 26 | Autonomy classification derived from tools | PRESENT (corrected) | Classifier agentCapabilityClassifier.ts:107-137 returns `communicate` for Reese (`respond_to_dm` :56). Boot wiring merged (#2540) and stamps `autonomy_level_set_at` (agentAutonomyReclassificationService.ts:30). Reese absent from AGENT_PERMISSIONS (documentation gap). | G |
| 27 | Activity logging success AND failure | PARTIAL | Reply: success :212-219 and failure :255-261 (reeseReplyService.ts). Outreach: success only (:174-181); sendNewOutreach has no try/catch so a failure is logged under the SIBLING cron row (cronInstrumentation.ts:88), not Reese's id. Follow-up/closure/escalation/welcome/supersession: none. The decoy `aiEventService.ts:49` writes the SAME table but throws on failure and uses snake_case params; the real difference is fail-open vs throw. | G / R (call sites) |
| 28 | Per-call LLM cost attribution | PARTIAL | reeseReplyService.ts:38-44 and reeseOutreachMessageService.ts:26-32 pass `agent_id`; manager Talk passes it (:409). Health assessment path does NOT: assessStudentHealth.ts:79 -> runtimeAi.chatJson -> getInstrumentedOpenAI({ workflow_id }) only (runtimeAi.ts:67). | G / R |
| 29 | Ticket visibility | PRESENT | ensureAgentTicketForRoom + logAgentExchangeActivity (agentTicketLinkService.ts:40-105) via reeseTicketLinkService.ts:21-60; outreach tickets :117-131; agentDetailService ticket_breakdown :333-353. Welcome DMs create no ticket. | G / R (titles) |
| 30 | Idempotency / retry / dedup / rollback | PARTIAL | Dedup on (entity_type, entity_id, type) with `${enrollmentId}:${signalType}` (:107-129); ReeseOutreach partial unique (ReeseOutreach.ts:84); ReeseWelcome unique claim-before-send (:72; reeseWelcomeService.ts:215-219); ledger idempotencyKey `reese-exchange:<messageId>` (agentTicketLinkService.ts:93); ApprovalRequest findOrCreate (bridge :108). Retry: none automatic. Rollback: dryRun on both sweeps; a sent DM is irreversible. | Mixed |
| 31 | Individual kill switches | PRESENT | Four registry rows (section 2) gated by instrumentCronJob enabled/paused (cronInstrumentation.ts:46). Welcome path only env `REESE_WELCOME_ENABLED`; reply path has no switch except the parent row's enabled flag, which `maybeTriggerReeseReply` does NOT read. | G / R |

### Verification
| # | Obligation | Score | Evidence |
|---|---|---|---|
| 32 | Identity seed tests | PRESENT | reeseIdentitySeed.test.ts (10), agentIdentitySeed.test.ts (35), ticketCreatorIdentitySeed.test.ts (17) |
| 33 | Prompt assembly tests | PRESENT | reeseSystemPrompt.test.ts (12), agentSystemPrompt.test.ts (18), agentManagerConversationPrompt.test.ts (12), agentContextLayers.test.ts (7) |
| 34 | Reply / outreach / follow-up tests | PRESENT | reeseReplyService.test.ts (18), reeseAutonomousOutreachService.test.ts (21), reeseOutreachFollowUpService.test.ts (12) |
| 35 | Presence / eligibility / signals tests | PRESENT | reesePresenceHeartbeat.test.ts (4), reeseEligibilityService.test.ts (11), reeseSignalService.test.ts (12) |
| 36 | Tools / capabilities / detail tests | PRESENT | reeseTools.test.ts (8), agentToolCapabilities.test.ts (17), agentDetailService.test.ts (41) |
| 37 | Ticket link / activity log / aliases tests | PRESENT | reeseTicketLinkService.test.ts (8), agentTicketLinkService.test.ts (8), agentActivityLogService.test.ts (3), legacyCreatorAliases.test.ts (8), agentRecentActivitySummary.test.ts (5), checklists (7+8), welcome (36), highlights (11+5) |
| 38 | Tests for the gaps | ABSENT | No test asserts authorization on the reply, follow-up or welcome send; no test asserts agent_id on the assessment LLM call; no test asserts escalation reaches a human; no test covers charter seeding. |

## 2. Reese behaviour rows (kill switches) - agentRegistrySeed.ts

All share `module:'reese'`, `agent_type:'ai_staff_mentor'`, `category:'student_success'`; surfaced as `related_tasks` on the parent's detail page (agentDetailService.ts:392-394).

| Row | Lines | Trigger / schedule | enabled | What toggling it stops | Real call site |
|---|---|---|---|---|---|
| Reese (parent) | 2427-2451 | event_driven | true | Nothing directly - `maybeTriggerReeseReply` never reads this row's enabled flag; only affects authorizeAgentAction's `agent_disabled` verdict (shadow) and the UI. | dmService.ts:179-180 |
| ReesePresenceHeartbeat | 2496-2510 | cron `*/1 * * * *` | true | The 60s `last_active_at` touch -> Reese drops to offline after 90s. | schedulerService.ts:1716-1718 |
| ReeseAutonomousOutreachSweep | 2519-2534 | cron `0 15 * * *` | true | Daily pilot-cohort scan, new outreach DMs, outreach tickets, R3 authorization rows, outreach checklists. | schedulerService.ts:1897-1899 |
| ReeseOutreachFollowUps | 2536-2550 | cron `0 16 * * *` | true | Follow-up DMs (attempts 2-3), evidence closures, escalations, closure checklists. | schedulerService.ts:1914-1916 |
| ReeseStudentSupportSupersessionResolver | 2563-2577 | cron `0 17 * * *` | **false** | Auto-closing superseded student_support tickets. | schedulerService.ts:1933-1937 |
| (no row) Welcome DMs | reeseWelcomeService.ts:83-85 | on login / enrollment | env `REESE_WELCOME_ENABLED` | Account + student intro DMs. Not in Admin > Agents. | freeSignupService.ts:115, participantService.ts:186, portalEnrollmentService.ts:136 |
| (no row) Vision attachments | agentToolRegistry.ts:25-31 | env `AGENT_TOOLS_DISABLED` | - | `read_attachments` for key 'reese'. | reeseReplyService.ts:122 |

## 3. KNOWN GAPS

### The skill's four (SKILL.md lines 86-106), verified 2026-09-15
1. Reply path skips authorization - **OPEN**. reeseReplyService.ts:199-202 still calls sendDmMessage with no authorizeTicketDispatch. PR #2477: OPEN, REVIEW_REQUIRED.
2. Autonomy classification not wired to boot - **CLOSED** (orchestrator correction: PR #2540 merged 2026-09-15T22:29Z; wired in agentRegistrySeed.ts).
3. GOALS zero-activity fallback inflated - **OPEN**. agentGoalsDimensionsService.ts:50 observability=3, :51 solid=5, :52 availability=5 for on_demand / 2 otherwise, :58 governance=5 fixed, :81 lexicon=4 fixed.
4. Role Charter never auto-populated - **OPEN**. Only writer is AgentRoleCharter.upsert in agentRoleCharterService.ts:67. No seed path.

### New gaps found
5. **Follow-up sends bypass authorization and activity logging**: reeseOutreachFollowUpService.ts:130-146 (`sendFollowUp`) calls initiateDm with no authorizeTicketDispatch and no logAgentActivity. Autonomous outbound messages (attempts 2 and 3). Not covered by PR #2477.
6. **Welcome DMs are fully ungoverned**: reeseWelcomeService.ts:201-239 sends real student DMs with no authorization, no activity log, no ticket, no registry row, only an env-var kill switch.
7. Enforce-mode would hard-block Reese's outreach - **CLOSED for Reese by #2540** (orchestrator correction; see header). Remaining: no AGENT_PERMISSIONS entry for Reese (agentPermissionService.ts:38-97).
8. **Assessment LLM cost not attributed**: assessStudentHealth.ts:79 -> runtimeAi.chatJson (runtimeAi.ts:62-67) passes workflow_id only; ai_events rows for `student_health_assessment` have agent_id null even when Reese triggered them.
9. **Escalation does not reach a human**: escalate() reeseOutreachFollowUpService.ts:117-128 = ticket comment + row status; no reassignment to Kes, no updateTicketStatus, no notification.
10. **Presence heartbeat is Reese-specific and content-free**: reesePresenceHeartbeat.ts:2,22 hardcode REESE_EMAIL; no generic `runAgentPresenceHeartbeat(email)`; no current-activity text.
11. Outreach failure path unlogged under Reese's id (sendNewOutreach has no catch; cronInstrumentation.ts:88 attributes to the sibling row).
12. Three disjoint tool registries: tools_granted (DB), TOOL_CAPABILITIES (agentToolCapabilities.ts:42), GRANTS (agentToolRegistry.ts:16-23). `read_attachments` granted but absent from tools_granted, so the classifier and the detail page never see it.
13. reports_to self-heal is null-only (agentIdentitySeed.ts:320): a manually changed DB value is never re-verified against code.
14. SKILL.md doc drift: line 43 tab list stale (real tabs AgentDetailV2Header.tsx:12-22); line 44 path wrong (real: `services/agentBlueprint/`); line 52's decoy description inaccurate.

## 4. REUSABLE GENERIC INFRASTRUCTURE (zero Reese-specific code)
- `agentBlueprint/agentIdentitySeed.ts`: seedAgentIdentity(config), previewAgentIdentity, getAgentEnrollmentId/getAgentAdminUserId/getAgentId(email) - enforces reports_to + tools_granted + displayName at registration (:176-225).
- `agentBlueprint/agentSystemPrompt.ts`: buildAgentSystemPrompt(...) 9-layer assembly incl. safety rules, charter, directives, approved memory, reliability, learner context.
- `agentBlueprint/agentManagerConversationPrompt.ts` + `agentManagerConversationService.ts`: Talk tab, agent-agnostic.
- `agentBlueprint/agentContextLayers.ts`, `platformSafetyRules.ts`, `agentTicketLinkService.ts`, `agentActivityLogService.ts` (fail-open), `agentRecentActivitySummary.ts`, `legacyCreatorAliases.ts`.
- `reese/agentDetailService.ts` getAgentDetail(agentId) and `reese/agentToolCapabilities.ts` - generic despite living under reese/ (candidates to move).
- `workLedger/agentActionAuthorizationBridge.ts` authorizeTicketDispatch; `agentAuthorizationService.ts`; `agentCapabilityClassifier.ts`; `agentAutonomyReclassificationService.ts` (merged).
- `agentRoleCharterService.ts`, `managerDirectiveService.ts`, `agentMemoryProposalService.ts`, `agentOneOnOneService.ts`, `agentReportSubscriptionService.ts`, `agentGoalService.ts`, `agentGoalsDimensionsService.ts`, `agentManagerAuthMiddleware.ts`.
- `checklist/*`, `metricReliabilityService.ts`, `studentSuccessSnapshot/*` (student-keyed), `studentHealthAssessment/*`, `openaiInstrumented.ts`, `cronInstrumentation.ts` instrumentCronJob(agentName), `ticketCreatorReportsToResolver.ts`.
- `agents/tools/agentToolRegistry.ts` + readAttachmentsTool (add a GRANTS key per agent).

## 5. REESE-SPECIFIC code to re-derive per employee
- `reeseIdentitySeed.ts`, `reeseSystemPrompt.ts` (REESE_PERSONA_BLOCK, closing line, highlight wiring), `reeseTools.ts`, `reeseStudentSuccessHighlights.ts`, `reeseHealthAssessmentHighlights.ts`.
- `reeseReplyService.ts`, `reeseInitiateDmService.ts`, `reeseOutreachMessageService.ts`, `reeseSignalService.ts`, `reeseEligibilityService.ts`, `reeseAutonomousOutreachService.ts` (GOALS, caps, RISK_TIER, ticket type), `reeseOutreachFollowUpService.ts`, `reeseWelcomeService.ts`, `reeseTicketLinkService.ts`, `outreachChecklist.ts`/`closureChecklist.ts`, `reesePresenceHeartbeat.ts`.
- Models: ReeseOutreach, ReeseWelcome; dmService.ts Reese bypasses (:36-55, :130-139, :171-186); agentToolRegistry GRANTS key 'reese'; agentRegistrySeed.ts rows 2427-2577; schedulerService.ts crons 1709-1722 and 1890-1944; intelligence/autonomy/reeseStudentSupportSupersession*.ts.
