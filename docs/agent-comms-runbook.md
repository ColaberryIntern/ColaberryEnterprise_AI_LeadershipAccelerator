# Agent comms runbook: agent email addresses and AI calls

**What this is.** Any AI agent can have its own email address and place AI phone calls. Every email
and call is recorded on that agent's dashboard (Admin, Agents, the agent, Email tab). Maya is
first: she sends as `"Maya" <maya@colaberry.com>`, and replies reach her at `maya@reply.colaberry.ai`
through Mandrill.

Decisions (Ali, 2026-11-22):
- **Email.** The From address is `<slug>@colaberry.com`. Replies go to `<slug>@reply.colaberry.ai`
  (Mandrill inbound).
- **Replies.** The agent drafts the reply. A person approves it, and approving it sends it. Only
  Ali or a super admin can approve; any admin can reject.
- **Calls.** An agent can call only if it has been granted the `place_ai_call` tool. The person
  must have phone consent on record. The existing dial guard applies: 10 AM to 8 PM Central, and
  at most 2 dials per number in 24 hours.

## Google Workspace: route maya@colaberry.com to Mandrill

`colaberry.com` mail is hosted by Google Workspace, so mail sent to `maya@colaberry.com` must be
forwarded to Mandrill's inbound domain. Ali does this once per agent, in the Google Admin console:

1. Open admin.google.com and go to **Apps > Google Workspace > Gmail > Default routing**.
2. Click **Configure** (or **Add another rule**) and name it `Agent mail: maya`.
3. Under **Specify envelope recipients to match**, choose **Single recipient** and enter
   `maya@colaberry.com`.
4. Under **If the envelope recipient matches the above, do the following**, choose
   **Modify message**, tick **Change envelope recipient**, and choose **Replace recipient** with
   `maya@reply.colaberry.ai`.
5. Tick **Perform this action on non-recognized and recognized addresses** (there is no
   `maya` mailbox; that is intended).
6. Save. Changes can take up to an hour to apply.

The alternative is **Apps > Google Workspace > Gmail > Routing > Recipient address map**, mapping
`maya@colaberry.com` to `maya@reply.colaberry.ai`. Either works; use one, not both.

**Check:** send a test mail from a personal address to `maya@colaberry.com`. Within a minute, it
appears under **Received** on Maya's Email tab, and a reply draft appears under **Replies waiting
on you**.

## Mandrill: sending-domain check

Agent mail is sent through Mandrill from `@colaberry.com`. Before the first agent reply goes out:

1. In Mandrill, open **Settings > Sending Domains** and confirm `colaberry.com` shows **DKIM: valid**
   and **SPF: valid**. If not, add the TXT records Mandrill shows to DNS and click **Test DNS**.
2. In **Inbound > Domains**, confirm `reply.colaberry.ai` is listed with its route pointing at
   `https://enterprise.colaberry.ai/api/webhook/mandrill/inbound`. This is already in place for
   existing replies; no change should be needed.

## Environment, in this order

Back up `/opt/colaberry-accelerator/.env` first (`cp .env .env.bak-$(date +%Y%m%d%H%M)`). Then:

1. **Deploy the code** with `scripts/deploy-prod.sh` (registry mode). At boot, the schema is
   ensured. Look for `[DB] agent comms schema ensured` in the backend log.
2. `VOICE_CALL_PATHS=enterprise-intake,agent-tool`. Each entry is the path key of a call path that
   may dial. If it is unset or empty, nothing dials (fail closed).
3. Optional: `SYNTHFLOW_ENTERPRISE_INTAKE_AGENT_ID` and `SYNTHFLOW_AGENT_TOOL_AGENT_ID`. Leave
   them unset to use the existing "Edu: Cory - Outbound" agent (`SYNTHFLOW_AI_FLOTATION_AGENT_ID`).
4. `ENABLE_VOICE_CALLS=true`, set last. With step 2 in place, it opens only the listed paths.
5. Recreate the backend so it reads the new values: `docker compose -f docker-compose.production.yml up -d backend`.
6. **Grant the tool** on each agent that may call, by adding `place_ai_call` to its
   `tools_granted`. **Maya only:** voice ships in `shadow`, so she places no calls until Ali
   promotes `placeVoiceCall` to `live` in the Maya console.

## Rollback

Any of these can be undone on its own.

- **Stop all calls now:** set `ENABLE_VOICE_CALLS=false` (or `VOICE_CALL_PATHS=` empty) and
  recreate the backend. Nothing dials. The platform kill switch also stops every call and send.
- **Stop one agent's calls:** remove `place_ai_call` from that agent's `tools_granted`.
- **Stop Maya's calls:** set `placeVoiceCall` back to `shadow` or `off` in the Maya console.
- **Stop agent email:** remove the Google Workspace routing rule. Mail to `maya@colaberry.com`
  then bounces at Google, and no new drafts are created. Drafts already queued stay in the queue
  until a person rejects them.
- **Code:** revert the PR and redeploy. Approvals already made stand. Calls already placed stand.
- **Schema (full undo).** The two nullable columns are harmless and can stay.

```sql
UPDATE ai_agents SET email_slug = NULL, email_display_name = NULL WHERE agent_name = 'Maya';
DROP INDEX IF EXISTS ai_agents_email_slug_uq;
DROP INDEX IF EXISTS communication_logs_agent_name_idx;
DROP INDEX IF EXISTS communication_logs_voice_idem_uq;
```

## Where things are

| What | Where |
|---|---|
| Identity (slug, From, Reply-To) | `backend/src/services/agents/email/agentEmailIdentity.ts` |
| Inbound routing (mail to an agent) | `backend/src/services/inbound/agentRecipientRouter.ts` |
| Reply drafter | `backend/src/services/agents/email/agentReplyDraftService.ts` |
| Sending an approved reply as the agent | `backend/src/services/agents/email/agentEmailTransport.ts`, `maya/mayaOutboundDelivery.ts` |
| The call tool | `backend/src/services/agents/tools/agentCallTool.ts` |
| Call results and the reconcile sweep | `backend/src/services/agents/tools/agentCallCompletion.ts`, `backend/src/services/agents/agentCommsSweep.ts` |
| Call path allowlist | `backend/src/services/voice/voiceCallPaths.ts` |
| Dashboard | `frontend/src/components/admin/agentDetailV2/AgentEmailTab.tsx`, `AgentEmailSections.tsx` |
| Procedure | `directives/run-agent-comms.md` |
