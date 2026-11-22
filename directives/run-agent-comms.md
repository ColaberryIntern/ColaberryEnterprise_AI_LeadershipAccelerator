# Run agent comms: give an agent an email address and AI calls

## Purpose

Any AI agent (Maya first) can be written to at its own address, `<slug>@colaberry.com`. It drafts
a reply that a person approves, and it can place an AI phone call to a consenting lead. Every
message and call is recorded on the agent's dashboard, so a person can see what each agent said,
to whom, and why. Full setup detail is in `docs/agent-comms-runbook.md`.

## Inputs

- **The agent's row** in `ai_agents`:
  - `email_slug`: lowercase, 2 to 31 characters, not a reserved name such as `info`, `ali` or `ticket`;
  - `email_display_name`;
  - `system_prompt`, which the reply drafter and the call script are built from;
  - `tools_granted`, which must include `place_ai_call` before the agent can call.
- **Env:** `VOICE_CALL_PATHS` (must include `agent-tool` for calls), `ENABLE_VOICE_CALLS`,
  `MANDRILL_INBOUND_DOMAIN` (default `reply.colaberry.ai`) and `AGENT_EMAIL_FROM_DOMAIN`
  (default `colaberry.com`).
- **A Google Workspace routing rule:** `<slug>@colaberry.com` is delivered to
  `<slug>@reply.colaberry.ai`.
- **Upstream events:** Mandrill inbound webhooks at `/api/webhook/mandrill/inbound`, and Synthflow
  call-complete webhooks.

## Steps

1. **Set the identity.** Run `UPDATE ai_agents SET email_slug = '<slug>', email_display_name = '<Name>' WHERE agent_name = '<Name>'`.
   Maya is seeded automatically.
   - Success: the Email tab shows "Sends as "<Name>" <slug@colaberry.com>".
2. **Add the Google Workspace rule** (runbook, "Google Workspace").
   - Success: a test mail to `<slug>@colaberry.com` appears under **Received** within a minute.
3. **Approve or reject the first reply draft** under **Replies waiting on you**. Only Ali or a
   super admin can approve.
   - Success: the reply arrives from `<slug>@colaberry.com`, and the Sent list shows it.
4. **For calls,** grant `place_ai_call` to the agent. Confirm `agent-tool` is on
   `VOICE_CALL_PATHS`.
   - Success: a consenting test lead receives the call, and **Calls** shows it with a summary
     afterwards.
5. **Maya only:** Ali promotes `placeVoiceCall` from `shadow` to `live` in the Maya console.
   - Success: a site-chat request to be called places a call. Before promotion, she says no call
     was placed.

## Outputs

- `communication_logs` rows carry `metadata.agent_name`:
  - inbound email (`direction='inbound'`);
  - sent replies (`direction='outbound'`, `channel='email'`);
  - calls (`channel='voice'`, with `summary`, `summary_state` and `outcome` after completion).
- Reply drafts in `maya_outbound_approvals` carry `composed_by='agent_reply:<slug>:<message-id>'`.
- A timeline activity, "<Agent> called <First>", is written on the lead.
- Log lines:
  - `agent_inbound_routed`
  - `agent_inbound_rate_capped`
  - `agent_call_completed`
  - `agent_call_dead_lettered`
  - `agent_comms_sweep_done`
  - `maya_effect_shadowed:voice`

## Verification

- **Schema.** The backend log at boot shows `[DB] agent comms schema ensured`. In the database,
  `SELECT indexname FROM pg_indexes WHERE indexname = 'communication_logs_voice_idem_uq'`
  returns 1 row.
- **Email.** Send a test mail to `maya@colaberry.com`. Then
  `SELECT count(*) FROM communication_logs WHERE direction='inbound' AND metadata->>'agent_name'='Maya' AND created_at > now() - interval '10 minutes'`
  returns 1 or more, and `maya_outbound_approvals` has a `pending_approval` row with
  `composed_by LIKE 'agent_reply:maya:%'`.
- **Calls.** After a test call, the voice row has `status` of `delivered` or `failed`, and
  `metadata->>'summary_state'` is not null within a few minutes of the call ending. If the webhook
  never arrives, the sweep (every 15 minutes) picks up rows still open after 30 minutes, so allow
  up to 45 minutes.
- **Automated tests.** In `backend`, run `npx jest src/services/agents src/services/inbound src/controllers/__tests__/mandrillInboundAgentRouting src/controllers/__tests__/synthflowWebhookAgentTool`.

## Edge cases / failure modes

- **Auto-replies and bounces** to an agent are dropped, never answered (loop guard).
- **One sender writing many times.** After 3 messages from one address in 24 hours (across all
  agents), and after 50 unknown-sender messages to one agent per Central day, mail is still
  recorded but no draft is made (`rate_capped`).
- **No phone consent, or a number not on the lead's record.** No call; the agent is told why.
- **Synthflow timeout.** The call may have gone out, so it is recorded `unconfirmed` and no second
  call is placed that day.
- **Call-complete webhook never arrives.** The sweep reads the call back: at most 20 rows per run,
  3 attempts each, then the row is dead-lettered (`metadata.reconcile_state='dead_letter'`), and a
  person checks it in Synthflow.
- **Summary model fails.** The row is marked `summary_failed`; the transcript is still on the row.
- **Identity cannot be read.** The dashboard says "could not be read just now", not "no address".

## Safety constraints

- **Approval.** An approved reply is sent exactly once (ledger plus status guard). The body that
  is sent is the body that was shown (hash check). Only Ali or a super admin can approve.
- **Calls are fail closed.** Nothing dials unless all of these hold:
  - `ENABLE_VOICE_CALLS` is on;
  - the path is on `VOICE_CALL_PATHS`;
  - the agent is granted the tool and enabled;
  - the lead has phone consent;
  - the time is within calling hours and the per-number cap.
  The kill switch overrides everything. Every call opens by saying it is an AI.
- **Once a day.** One call per agent, lead and purpose per Central day, enforced by a unique index.
- **No SMS.** An agent call never triggers the post-call text message.
- **Logs.** No secrets in logs. Phone numbers appear on the dashboard as the last 4 digits only.
