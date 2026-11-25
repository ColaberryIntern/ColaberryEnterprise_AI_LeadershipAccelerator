# Voice AI Studio: Migration matrix

One row per repo voice route (seeded by VS1.1 from [INVENTORY.md](INVENTORY.md)). The second table has one row per Synthflow assistant the API key can see (14, read 2026-11-25) joined to these routes. Agent IDs and numbers are never written here; only env var names.

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

**First migration target:** "Edu: Cory - Outbound". Read from the vendor API on 2026-11-25: it is the assistant behind SYNTHFLOW_AI_FLOTATION_AGENT_ID, which other routes fall back to.

## Synthflow assistants

One row per assistant the API key can see. The key is a hash of the assistant id. Every row is a decision for the owner at M4; nothing here moves an assistant. Settings, prompts and numbers are kept out of this public file: the redacted inventory is private (`npm run voice:migration:report -- --live --inventory <file>`). Check this table with `npm run voice:migration:report`.

| Key | Assistant | Direction | Owner | Route today | Recommendation | New profile / number | Feature mapping | Tests | Consent | History | Risk | Stage | Rollback | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sf-1a632a94 | Edu: Cory - Outbound | outbound | Ali | ai-flotation; default shell for enterprise-intake, cpn, colaberry-internship, agent-tool (SYNTHFLOW_AI_FLOTATION_AGENT_ID) | migrate first | edu-cory-outbound draft from the live assistant | prompt-only shell: mapped; knowledge: admissions lookup, vendor knowledge base to compare; voice: to choose | profile seed and shell tests | per route (see routes above) | export plan in VS5.3 | one assistant serves several routes: move one route at a time | legacy | route back to synthflow_legacy (voice:route:rollback) | - | IN_PROGRESS |
| sf-b6ebd069 | ROI Architect | outbound | Ali | welcome, interest (SYNTHFLOW_WELCOME_AGENT_ID, SYNTHFLOW_INTEREST_AGENT_ID) | replace with two purpose-built profiles | n/a until M4 | see private inventory | n/a until M4 | evaluateSend on campaign steps; none on internal alerts | export plan in VS5.3 | one very short saved script serves two different purposes; its saved webhook address predates the required token | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-80649369 | Cora - Outbound Admissions Agent - New L | outbound | Kes (to confirm) | callback (SYNTHFLOW_CALLBACK_AGENT_ID) | decide with Kes; our callback route moves to its own profile | n/a until M4 | see private inventory | n/a until M4 | captureSignupConsent and evaluateSend | export plan in VS5.3 | a platform route uses an agent that belongs to another campaign | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-f1fb4044 | Cora - Outbound Admissions Agent - ColdL | outbound | Kes | none of our routes | leave with Kes; not ours to move | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | its number belongs to Kes's campaign | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-28d71c32 | Cora - Inbound Admissions Agent | inbound | Kes (to confirm) | none of our routes | decide with Kes; untouched until then | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | answers a live line; needs its own inbound tests first | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-5c7fcddf | Cora2 - Outbound Admissions Agent - New L | outbound | Kes (to confirm) | none of our routes | ask Kes whether it is in use; nearly identical to the New L agent | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | duplicate of another agent | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-0037f176 | Edu: Cory - Inbound | inbound | Ali | none of our routes | migrate after inbound is proven on the test line | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | answers a live line; needs its own inbound tests first | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-7217a397 | Edu Cory: Inbound_before_a_call | inbound | Ali | none of our routes | retire candidate: no number attached | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | low: nothing can reach it | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-77c93bb5 | Edu: Cory - Website Widget | widget | Ali | none of our routes | decide separately: a web widget, not a phone call | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | the new engines have no browser widget | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-39f60bd8 | Colaberry Student Outreach | outbound | Ali | none of our routes | find its owner and whether it still runs before anything else | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | fed and read by an automation outside this platform | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-3072573b | Cory - AI Cybersecurity Training Outreach Q1 2026 | outbound | Ali | none of our routes | retire candidate: no number attached, past campaign | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | low: cannot dial | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-5b86fc49 | Cory - AI Governance Training Program Outreach Q1 2026 | outbound | Ali | none of our routes | retire candidate: no number attached, past campaign | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | low: cannot dial | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-91faa67d | Little Ali | outbound | Ali | none of our routes | retire candidate: same script as My Outbound Assistant | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | holds a number: release only with approval | decision | nothing changes until decided | - | APPROVAL_REQUIRED |
| sf-bdfc2c1b | My Outbound Assistant | outbound | Ali | none of our routes | retire candidate: vendor starter agent | n/a until M4 | see private inventory | n/a until M4 | n/a until M4 | export plan in VS5.3 | holds a number: release only with approval | decision | nothing changes until decided | - | APPROVAL_REQUIRED |

## What the API does not show: manual export checklist

The key can read assistants, their actions and the knowledge base list. It returns no numbers list and refuses the call list without an assistant, so these need the Synthflow dashboard (owner only):

1. Phone Numbers: for each number, its type (bought at the vendor, or imported from a carrier), monthly cost, and the assistant it is attached to. Screenshot into the private inventory, never here.
2. Knowledge bases (3): download each source document or URL list.
3. Actions (44): for each one, what it calls and which assistant uses it. Credentials are noted as present or absent, never copied.
4. Calls and transcripts: whether a bulk export exists on this plan, for which dates, and whether recordings can be downloaded.
5. Workflows or integrations attached to an assistant (for example the automation behind Colaberry Student Outreach).
6. Contract: renewal date, notice period, and what happens to numbers and history on cancellation.
