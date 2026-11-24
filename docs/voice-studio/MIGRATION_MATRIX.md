# Voice AI Studio: Migration matrix

One row per repo voice route (seeded by VS1.1 from [INVENTORY.md](INVENTORY.md)). VS5.1 adds one row per Synthflow assistant the API key can see (14 as of 2026-11-23) and joins them to these routes. Agent IDs and numbers are never written here; only env var names.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md). Status words: NOT_STARTED, IN_PROGRESS, IMPLEMENTED_UNVERIFIED, PASS, FAIL, BLOCKED, APPROVAL_REQUIRED, RETIRED.

| Route (path key) | callType | Brand | Today's agent (env name) | Fallback rule today | Prompt | Callers | Consent today | New profile | Stage | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| welcome | welcome | Colaberry bootcamp; also internal exec alerts | SYNTHFLOW_WELCOME_AGENT_ID | none | saved script, optional override | automationService enrollment, alertDeliveryService, campaign voice steps | evaluateConsent (enrollment); none (alerts) | TBD (VS3.1) | legacy | NOT_STARTED |
| interest | interest | Colaberry sales; also internal Cory alerts | SYNTHFLOW_INTEREST_AGENT_ID | none | saved script | scheduler steps, HotLeadEscalation, SystemHealthMonitor, mandrill Cory alert, test harnesses | evaluateSend (campaign, hot lead); none (internal, test) | TBD | legacy | NOT_STARTED |
| callback (unbranded) | callback | none in practice | SYNTHFLOW_CALLBACK_AGENT_ID | falls back to INTEREST | saved script | none reach it unbranded | - | likely RETIRE | legacy | NOT_STARTED |
| open_house | open_house | Colaberry Open House | SYNTHFLOW_OPEN_HOUSE_AGENT_ID | none (refused) | countdownCallBrief | scheduler event_countdown | evaluateSend | TBD | legacy | NOT_STARTED |
| project_discovery | project_discovery | Colaberry SBP | SYNTHFLOW_PROJECT_DISCOVERY_AGENT_ID | none; shell forbidden | decideProjectDiscoveryCall | sbpRoutes intake call | own consent record (no evaluateSend) | TBD | legacy | NOT_STARTED |
| colaberry-internship | internship_interview | Colaberry Internship | SYNTHFLOW_INTERNSHIP_AGENT_ID | shell allowed; callback/interest prohibited | internshipCallPrompt | internshipInterviewController callNow | permission_to_call (no evaluateSend) | TBD | legacy | NOT_STARTED |
| ai-flotation | callback | AI Flotation / Colaberry | SYNTHFLOW_AI_FLOTATION_AGENT_ID (the prompt-only shell) | none | buildFlotationCallPrompt | callbackRequestService, flotationIntakeRoutes, routing call_me_now | captureSignupConsent + evaluateSend | TBD | legacy | NOT_STARTED |
| enterprise-intake | callback | Colaberry Enterprise | SYNTHFLOW_ENTERPRISE_INTAKE_AGENT_ID | shell allowed | buildFlotationCallPrompt (ENTERPRISE_BRAND) | enterpriseIntake service/controller/reminders cron | call_consent + evaluateSend | TBD | legacy | NOT_STARTED |
| cpn | callback | OpportunityLift / CPN | SYNTHFLOW_CPN_AGENT_ID | shell allowed; any Colaberry agent prohibited | buildScholarshipCallPrompt | routing scholarship_interview_call, callback hub | captureSignupConsent + evaluateSend | TBD | legacy | NOT_STARTED |
| agent-tool | callback | calling agent persona (Maya) | SYNTHFLOW_AGENT_TOOL_AGENT_ID | shell allowed | buildAgentCallPrompt / Maya script | voiceTool via agentCallTool | checkPhoneConsent (evaluateSend) | TBD | legacy | NOT_STARTED |
| other source (e.g. training site) | callback | varies | falls through to CALLBACK | - | none, so skipped (no_prompt) | v1CallbackController | - | decide at M4 | n/a | NOT_STARTED |
| internal alerts (proposed new route) | n/a | Colaberry staff only | today borrows welcome/interest | - | - | alertDeliveryService, SystemHealthMonitor, mandrill Cory alert | staff exemption | NEW internal-alert profile (F-07) | n/a | NOT_STARTED |

**First migration target:** "Edu: Cory - Outbound" (Synthflow assistant). Which route key(s) it serves is established in VS5.1 from the vendor API, not assumed here.
