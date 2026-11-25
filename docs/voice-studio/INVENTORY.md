# Voice AI Studio: Inventory

Every caller, consumer, route, cron and config of AI voice calls in the repo (VS1.1). Hand-read on 2026-11-24 against workstream/voice-studio-p1 (base origin/main 89e6bf3bb), cross-checked with the repeatable classifier.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md). Machine snapshot: [inventory.generated.json](inventory.generated.json) (`npm run voice:inventory -- --check` fails if the code drifts from it). Phone numbers, keys and agent IDs are never written here.

Status: **IMPLEMENTED_UNVERIFIED** until the VS1.1 task verifier passes.

## The one fact that shapes the migration

**Every outbound dial goes through one function:** `triggerVoiceCall` in `backend/src/services/synthflowService.ts:188`. It is the only code that POSTs to the Synthflow calls API, and it holds every global brake: kill switch, `ENABLE_VOICE_CALLS`, the `VOICE_CALL_PATHS` allowlist, skips for missing phone/key/agent, the branded-without-prompt refusal, the test-mode redirect, E.164 normalization, `checkDialGuard`, then `recordDial` after acceptance. The gateway (VS1.5) can replace its body and keep its signature (VS1.6 facade).

Other network touches: `fetchSynthflowCall` (GET one call, same file, used by pollers) and `systemHealthService.ts:294` (GET health probe, 5 s timeout; not a dial).

## Classifier snapshot (263 files matching the search set, after VS3.5)

Search set (the directive's list): synthflow, syntheflow, triggerVoiceCall, place_ai_call, voiceCall, SYNTHFLOW_*, ENABLE_VOICE_CALLS, VOICE_CALL_PATHS, call_id, CommunicationLog, VOICE_*. Scope: tracked non-test files under backend/src, frontend/src, scripts, nginx, docker-compose*.yml and .github. Excluded: tests, markdown, and the Voice Studio's own tooling (backend/src/scripts/voice/), which names every search term by design. The authoritative numbers are in inventory.generated.json; this table is a hand-refreshed copy of it.

| Role | Files |
|---|---|
| DISPATCH | 3 |
| CALLER | 11 |
| GUARD | 6 |
| INGEST | 3 |
| CONSUMER | 63 |
| CONFIG | 20 |
| UI | 31 |
| MENTION | 126 |

The three DISPATCH files are exactly the ones the no-direct-dispatch architecture test allows: `synthflowService.ts` (today's path, flag off), `voice/providers/synthflowLegacyProvider.ts` (the same Synthflow dial behind the Voice Gateway when `VOICE_GATEWAY_LEGACY_ENABLED=true`) and `voice/providers/twilioCarrier.ts` (the direct engines' Twilio dial, VS2.1). The drift check also runs as a jest test in CI (`voiceInventorySnapshot.test.ts`).

The hand reading below is wider than the classifier, because indirect callers (that reach `triggerVoiceCall` through `requestInstantCallback`, `requestEnterpriseIntakeCall` or `requestProjectDiscoveryCall`) never mention Synthflow. They are listed under "Indirect callers".

## Callers (direct)

| File | Path key / callType | Brand | Consent gate | Notes |
|---|---|---|---|---|
| services/schedulerService.ts (a) processVoiceAction | open_house / welcome / interest | Colaberry campaigns, Open House | `evaluateSend` in processScheduledActions | Cron `*/5`. open_house uses `countdownCallBrief`. |
| services/schedulerService.ts (b) HotLeadEscalation | interest | Colaberry Enterprise (Maya) | setting `hot_lead_voice_enabled` + `evaluateSend` | Cron weekdays; 100/day, 60 s spacing. |
| services/schedulerService.ts (c) SystemHealthMonitor | interest | internal (Cory to Ali) | none (staff number) | Borrows the sales interest agent for an internal alert. |
| services/automationService.ts runEnrollmentAutomation | welcome | Colaberry bootcamp | `consentService.evaluateConsent` (fails closed) | From the payment webhook (controllers/webhookController.ts:147). Skips `evaluateSend` suppression/rate checks. |
| services/automationService.ts runLeadAutomation | interest | Colaberry | **none** | **Dead code: zero callers (verified).** Remove or gate in VS1.6. |
| controllers/mandrillWebhookController.ts | interest | internal (Cory to Ali) | none (staff number) | **Hard-coded fallback alert phone when ADMIN_ALERT_PHONE is unset** (finding F-01). |
| services/alertDeliveryService.ts deliverViaVoice | welcome | internal executive alert | none (exempt setting `executive_phone_number`) | **Logs status "sent" even when the call was skipped** (finding F-03). |
| services/callbackRequestService.ts requestInstantCallback | callback + brandSlug from source | AI Flotation, Enterprise, CPN, other sources | `captureSignupConsent` then `evaluateSend` | Shared hub. An unknown source gets no prompt and is skipped (`no_prompt`), so training-site callbacks cannot dial today (finding F-04). |
| services/internship/internshipCallService.ts | internship_interview / colaberry-internship | Colaberry Internship | `permission_to_call` + cooldown; **no evaluateSend** | `scheduleCall` stores a booking nothing ever dials. |
| services/sbp/projectDiscoveryCallRequest.ts | project_discovery | Colaberry SBP | recorded consent box + advisory lock + 10-min cooldown; **no evaluateSend** | Own agent, shell explicitly forbidden. |
| services/agents/admissions/admissionsSynthflowCallAgent.ts | interest (no prompt) | Colaberry admissions | governance agent + `evaluateSend` | **Dormant**: `runAdmissionsSynthflowCall` has no callers. |
| services/agents/tools/agentCallTool.ts placeAgentCall | callback / agent-tool | calling agent persona | `readAgentGate('place_ai_call')` + `checkPhoneConsent` + once-a-day reservation | Only caller in code: Maya's voiceTool. |
| services/mayaTools/voiceTool.ts initiateVoiceCall | agent-tool | Colaberry Enterprise (Maya) | lead + `checkPhoneConsent` + Maya mode live (ships shadow) + 24 h dedupe | Reached from mayaActionService `initiate_voice_call`. |
| services/testing/campaignSimulator.ts | step voice_agent_type or interest | Colaberry QA | **none** | Admin simulation; test-override phone. |
| services/testing/campaignTestHarness.ts | interest | Colaberry QA | **none** | Called by CampaignQAAgent and CampaignSelfHealingAgent crons when a campaign's voice channel is on. |

## Indirect callers (reach the dispatch through a request function)

| File | Reaches | Path key |
|---|---|---|
| controllers/v1CallbackController.ts | requestInstantCallback | source from body (service token) |
| routes/admin/flotationIntakeRoutes.ts | requestInstantCallback | ai-flotation (admin asserts consent) |
| services/routingActionsService.ts | requestInstantCallback | `ctx.source_slug` (ai-flotation call_me_now, cpn scholarship_interview_call) |
| services/enterpriseIntake/enterpriseIntakeService.ts | requestInstantCallback | enterprise-intake (`intake.call_consent`) |
| controllers/enterpriseIntakeController.ts | requestEnterpriseIntakeCall | enterprise-intake (public, rate-limited) |
| services/enterpriseIntake/enterpriseIntakeReminders.ts | requestEnterpriseIntakeCall | enterprise-intake (cron, via enterpriseIntakeSweep) |
| controllers/internshipInterviewController.ts | internshipCallService.callNow | colaberry-internship |
| routes/sbpRoutes.ts:743 | requestProjectDiscoveryCall | project_discovery |
| services/alertService.ts, executiveAwarenessService.ts | deliverAlert('voice') | welcome (critical alerts, via opsAlertSubscriptionSeed) |
| services/agents/campaignQAAgent.ts, campaignSelfHealingAgent.ts | runCampaignTest | interest |
| services/aiOrchestrator.ts (+ -Ali-AI copy) | runAdmissionsSynthflowCall | dormant, no callers |

## Guards

voice/voiceCallPaths.ts (fail-closed path allowlist) · voice/voiceDialGuard.ts (10:00-20:00 Central, 2 dials/number/24 h, fails closed; exempts ADMIN_ALERT_PHONE and executive_phone_number; skipped when NODE_ENV=test unless VOICE_DIAL_GUARD_IN_TESTS=1) · voice/voiceDialPolicy.ts · scheduling/cancelScheduledMessage.ts · consentService.ts · communicationSafetyService.ts (**voice consent gate is shadow unless `consent_enforcement=enforce`, fails open**: finding F-05) · mayaTools/outboundConsent.ts · settingsService.ts (test overrides) · sbp/projectDiscoveryCall.ts · explorerGrowth/explorerVoiceEligibility.ts (unwired) · agentPermissionService.ts · maya/mayaToolGate.ts, mayaToolGovernance.ts, mayaPromotion.ts · middlewares/serviceAuthMiddleware.ts · schemas/v1CallbackSchema.ts · utils/phone.ts.

## Ingest (results coming back)

controllers/synthflowWebhookController.ts (branches: internship, intake, agent-tool, default Maya/campaign; writes CallContactLog, activity, transcript processing, post-call and voicemail SMS, enrolls the Strategy Call campaign) · voice/synthflowWebhookAuth.ts · routes/webhookRoutes.ts (`POST /api/webhook/synthflow/call-complete`) · pollers via fetchSynthflowCall: delivery/flotationCallCompletion.ts, internship/internshipCallReconcile.ts, agents/agentCommsSweep.ts; internship/internshipCallCompletion.ts; agents/tools/agentCallCompletion.ts · server.ts crons (agentCommsSweep `*/15`, flotation reconcile `*/5`, enterpriseIntakeSweep `*/5`).

## Consumers (must keep working after cutover)

callTranscriptProcessor.ts, internship/internshipTranscriptExtraction.ts, internship/internshipInterviewService.ts, delivery/projectIntake.ts, delivery/recordProjectUnderstanding.ts, maya/mayaMemory.ts, aiMessageService.ts, contextGraphService.ts, reporting/campaignGraphService.ts, mayaCampaignRouter.ts, mayaTools/voiceSummaries.ts, errorSpikeAlertService.ts, reliabilityAlertingService.ts, scripts/lib/vipSmsRouter.js, and readers of communication_logs / scheduled_emails voice rows (admin campaignRoutes, leadRoutes, productionActivationRoute, productionCleanupRoute, dashboardService, aliPersonalOutreachService, enterpriseIntake/enterpriseIntakeSync, agents/tools/agentEmailInboxReaders).

## Config

config/env.ts · docker-compose.production.yml (passes SYNTHFLOW_API_KEY, WELCOME, INTEREST, CALLBACK, ENABLE_VOICE_CALLS explicitly) · prompt builders: voiceCallPrompt.ts, cpn/scholarshipCallPrompt.ts, internship/internshipCallPrompt.ts, sbp/projectDiscoveryCallPrompt.ts, openHouseCountdown.ts · enterpriseIntake/enterpriseIntakeSource.ts · seeds/seedRoutingRules.ts · opsAlertSubscriptionSeed.ts (critical alerts to voice) · agentDomain/registeredTools.ts · agent registry seeds · models: CallContactLog (synthflow_call_id), InteractionOutcome, InternshipInterviewSession (provider_call_id), InternshipStatusEvent, DeliveryDiscovery, ProjectUnderstandingRecord, ScheduledEmail and FollowUpSequence (voice_agent_type) · db: ensureAgentCommsSchema (voice idempotency index), ensureInternshipSchema, ensureProjectUnderstandingSchema · sequenceService.ts, campaignBuilderService.ts, campaign seeds with voice steps.

## Env var names (values never recorded)

SYNTHFLOW_API_KEY, SYNTHFLOW_WELCOME_AGENT_ID, SYNTHFLOW_INTEREST_AGENT_ID, SYNTHFLOW_CALLBACK_AGENT_ID, SYNTHFLOW_AI_FLOTATION_AGENT_ID, SYNTHFLOW_ENTERPRISE_INTAKE_AGENT_ID, SYNTHFLOW_AGENT_TOOL_AGENT_ID, SYNTHFLOW_CPN_AGENT_ID, SYNTHFLOW_INTERNSHIP_AGENT_ID, SYNTHFLOW_PROJECT_DISCOVERY_AGENT_ID, SYNTHFLOW_OPEN_HOUSE_AGENT_ID, SYNTHFLOW_WEBHOOK_URL, SYNTHFLOW_WEBHOOK_TOKEN, ENABLE_VOICE_CALLS, VOICE_CALL_PATHS, ENABLE_VOICE_CALL_FOR_OVERVIEW, ADMIN_ALERT_PHONE, VOICE_DIAL_GUARD_IN_TESTS, EXPLORER_AUTO_DIAL_ENABLED (unwired), ENTERPRISE_CRM_TOKEN, CORA_SERVICE_TOKEN. Database settings: enable_voice_calls, synthflow_api_key, synthflow_welcome_agent_id, synthflow_interest_agent_id, executive_phone_number, hot_lead_voice_enabled, consent_enforcement, test overrides.

## Crons that can dial

1. schedulerService ScheduledActionsProcessor `*/5` (campaign and Open House voice steps).
2. schedulerService HotLeadEscalation (needs hot_lead_voice_enabled).
3. schedulerService SystemHealthMonitor (Cory to the admin alert phone).
4. server.ts enterpriseIntakeSweep `*/5` (intake reminder calls).
5. aiOpsScheduler CampaignQAAgent `0 */6` and CampaignSelfHealingAgent `15,45` (test calls when a campaign's voice channel is on).
6. Indirect: any critical Alert to `deliverAlert('voice')`.

Not dialing: AdmissionsCallbackManagement (marks scheduled only), internship `scheduleCall` (no sweep), result pollers.

## Findings for the gateway (carried into VS1.5 and VS1.6)

- **F-01** Ali's number is in the public repo on 32 lines, including a hard-coded fallback alert phone in mandrillWebhookController.ts (M0 question).
- **F-02** Five dial paths skip `evaluateSend` (internshipCallService, projectDiscoveryCallRequest, runEnrollmentAutomation, the two test harnesses) and three internal paths call staff numbers with no consent gate by design. The gateway must apply one policy to all, with an explicit, finite staff/test exemption.
- **F-03** alertDeliveryService logs "sent" on a skipped call (an honesty bug in reporting).
- **F-04** Unknown callback sources are skipped as `no_prompt`; training-site callbacks cannot dial today.
- **F-05** The voice consent gate in communicationSafetyService is shadow-mode and fails open unless `consent_enforcement=enforce`. The gateway fails closed regardless.
- **F-06** Dead or dormant dial code: runLeadAutomation (no callers, no consent), runAdmissionsSynthflowCall (no callers). Candidates for removal in VS1.6.
- **F-07** Internal alerts borrow customer-facing sales agents (interest, welcome) to call staff.
