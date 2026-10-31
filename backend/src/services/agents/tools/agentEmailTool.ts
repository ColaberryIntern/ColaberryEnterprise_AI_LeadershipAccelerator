import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { AiAgent } from '../../../models';
import { evaluateSend } from '../../communicationSafetyService';
import { levelAllowsAction, AUTONOMY_ORDER, type AutonomyLevel } from '../../agentAutonomy';

/**
 * The shared outbound email tool. One tool, every agent that has been granted it.
 *
 * Ali, 2026-10-25: "the email sending tool is what all agents will use to send emails (that has
 * access)" and "she can draft for now - but eventually she will send on her own".
 *
 * ── WHY THIS FAILS CLOSED INSTEAD OF ASKING PERMISSION ──────────────────────
 *
 * Every governance layer that looks like it should gate this either fails open or is not wired:
 *
 *   - `agentAuthorizationService.authorizeAgentAction` is the ABAC chokepoint, and its own
 *     docblock says it "only BLOCKS when `abac_enforcement === 'enforce'`" and is "SWALLOW-SAFE +
 *     FAILS OPEN". Production `abac_enforcement` is **shadow**. So in production today it allows
 *     everything and records what it WOULD have denied. An allow from it means nothing.
 *   - `ai_agents.tools_granted` exists as `JSONB DEFAULT '[]'`, is editable through the Ops
 *     controller and is version-historied - and **no code reads it to make a decision**. It is a
 *     documented intention. This tool is its first consumer, which means this file is what makes
 *     the column load-bearing.
 *
 * So the tool cannot delegate its own safety. It decides, and EVERY UNCERTAINTY RESOLVES TO A
 * DRAFT. An unsent draft costs a human one review. A wrong send cannot be withdrawn, and the
 * recipient is a real person outside the platform.
 *
 * ── THE ONE ASYMMETRY ───────────────────────────────────────────────────────
 *
 * A SUPPRESSION block does not become a draft. If someone unsubscribed, bounced or complained,
 * there must not be a draft of a message to them sitting in a queue for a human to approve later;
 * that is how an unsubscribe gets overridden by a tired reviewer. Suppression means do not
 * contact. Everything merely UNCERTAIN - no grant, too little autonomy, no brand scope - becomes a
 * draft, because those are states a human can legitimately resolve.
 *
 * ── BRAND SCOPE IS NOT OPTIONAL, AND WHY IT LOOKS LIKE IT IS ────────────────
 *
 * `SendRequest` carries no brand or tenant field: `brandPreferenceGate` derives them from the
 * CAMPAIGN alone. So a send with no `campaignId` short-circuits to `no_brand_scope` and skips the
 * brand and consent checks entirely - which is exactly what `admissionsEmailAgent` does today
 * (`evaluateSend({ leadId, channel, toEmail, source: 'manual' })`, no campaign).
 *
 * That is correct for a transactional sign-in link and wrong for brand outreach. So this tool
 * REQUIRES a campaign and drafts without one. The missing-campaign problem then surfaces as
 * reviewable drafts rather than as mail that quietly bypassed consent.
 */

/** The grant string an agent needs in `tools_granted`. */
export const AGENT_EMAIL_TOOL = 'send_email';

/**
 * The action name handed to the autonomy ladder.
 *
 * Deliberately starts with `send_` so `agentAutonomy.actionCategory` classifies it as
 * `communicate` through the existing `COMMUNICATE_HINTS`, rather than needing a new hint. Only the
 * `communicate` rung may perform that category, which is the behaviour Ali asked for.
 */
export const AGENT_EMAIL_ACTION = 'send_email';

/** Status written for a draft. NOT 'pending': the processor claims only 'pending'. */
export const AGENT_DRAFT_STATUS = 'agent_draft';

export type AgentEmailOutcome = 'sent' | 'drafted' | 'blocked';

export interface AgentEmailRequest {
  /** `ai_agents.agent_name`. The identity whose grant and autonomy are checked. */
  agentName: string;
  leadId: number;
  toEmail: string;
  subject: string;
  body: string;
  /** Brand scope. Absent means the gate cannot apply, so the tool drafts. */
  campaignId?: string | null;
  correlationId?: string | null;
}

export interface AgentEmailResult {
  outcome: AgentEmailOutcome;
  /** Why. Always populated for `drafted` and `blocked`. */
  reason: string | null;
  draftId: string | null;
  autonomyLevel: AutonomyLevel | null;
  toolGranted: boolean;
}

interface AgentGate {
  level: AutonomyLevel | null;
  granted: boolean;
  usable: boolean;
  reason: string | null;
}

/**
 * The four columns this gate reads, every one `unknown`.
 *
 * A NAMED type rather than an inline one, because the inline version was annotated with
 * `as unknown as typeof agent` - a cast that refers to the variable being assigned. That is
 * circular, TypeScript resolved it to `never`, and every property read after it became a
 * compile error. The suite stayed green throughout: ts-jest runs with `isolatedModules`, so it
 * TRANSPILES without typechecking. Jest passing is not evidence that this file compiles.
 *
 * `unknown` and not the model's own attribute types, deliberately: these values come out of jsonb
 * and a nullable varchar, so the whole job of the code below is to decide what a value actually
 * is rather than to trust a declaration.
 */
interface AgentGateRow {
  autonomy_level?: unknown;
  tools_granted?: unknown;
  enabled?: unknown;
  status?: unknown;
}

/**
 * Read the agent's grant and autonomy. Any doubt reports NOT usable.
 *
 * `tools_granted` is jsonb and may be an array, a JSON string, or null depending on who wrote it
 * last; only an array containing the exact grant counts. A malformed value is not a grant.
 */
export async function readAgentGate(agentName: string): Promise<AgentGate> {
  let agent: AgentGateRow | null = null;
  try {
    agent = await AiAgent.findOne({
      where: { agent_name: agentName },
      attributes: ['autonomy_level', 'tools_granted', 'enabled', 'status'],
    }) as unknown as AgentGateRow | null;
  } catch {
    return { level: null, granted: false, usable: false, reason: 'agent_lookup_failed' };
  }
  if (!agent) return { level: null, granted: false, usable: false, reason: 'agent_not_found' };

  const rawLevel = typeof agent.autonomy_level === 'string' ? agent.autonomy_level : null;
  const level = (rawLevel && (AUTONOMY_ORDER as string[]).includes(rawLevel))
    ? rawLevel as AutonomyLevel
    : null;

  const granted = Array.isArray(agent.tools_granted)
    && (agent.tools_granted as unknown[]).includes(AGENT_EMAIL_TOOL);

  if (agent.enabled !== true) {
    return { level, granted, usable: false, reason: 'agent_disabled' };
  }
  if (typeof agent.status === 'string' && agent.status === 'paused') {
    return { level, granted, usable: false, reason: 'agent_paused' };
  }
  if (!granted) {
    return { level, granted, usable: false, reason: 'tool_not_granted' };
  }
  if (!level) {
    return { level, granted, usable: false, reason: 'autonomy_unknown' };
  }
  if (!levelAllowsAction(level, AGENT_EMAIL_ACTION)) {
    return { level, granted, usable: false, reason: `autonomy_insufficient:${level}` };
  }
  return { level, granted, usable: true, reason: null };
}

/**
 * Persist a draft for a human to review.
 *
 * Stored in `scheduled_emails` rather than a new table, deliberately: a new table is an
 * ESCALATE-tier schema change, and this row already has every column a draft needs
 * (`lead_id`, `to_email`, `subject`, `body`, `status`, `metadata`), with `campaign_id` and
 * `sequence_id` nullable.
 *
 * SAFE BY CONSTRUCTION: `AGENT_DRAFT_STATUS` is not `'pending'`, and the sender claims rows with
 * `SET status = 'processing' ... AND status = 'pending'`. A draft can never be claimed, so it can
 * never be sent by accident. That was verified against `schedulerService` before choosing this
 * table rather than assumed.
 *
 * `id` IS SUPPLIED EXPLICITLY. `scheduled_emails.id` is `uuid NOT NULL` with NO database
 * default — the default is `defaultValue: DataTypes.UUIDV4` on the Sequelize model, which
 * generates it client-side — so a raw insert that omits it fails every row with
 * `null value in column "id" ... violates not-null constraint`. This writer omitted it,
 * which is why production held ZERO `agent_draft` rows on 2026-10-31: no agent draft has
 * ever been persisted. The `catch` below returns null on failure, so the only visible
 * symptom was a draft that silently never appeared.
 *
 * Guarded by `explorerGrowth/drafts/__tests__/scheduledEmailRawInsertsSupplyId.test.ts`,
 * which scans every raw insert into this table instead of mocking one.
 */
async function writeDraft(req: AgentEmailRequest, reason: string): Promise<string | null> {
  try {
    const rows = await sequelize.query<{ id: string }>(
      `INSERT INTO scheduled_emails
         (id, lead_id, to_email, subject, body, status, scheduled_for, step_index, campaign_id, metadata, created_at)
       VALUES
         (gen_random_uuid(), $leadId, $toEmail, $subject, $body, $status, now(), 0, $campaignId, $metadata::jsonb, now())
       RETURNING id`,
      {
        bind: {
          leadId: req.leadId,
          toEmail: req.toEmail,
          subject: req.subject,
          body: req.body,
          status: AGENT_DRAFT_STATUS,
          campaignId: req.campaignId ?? null,
          metadata: JSON.stringify({
            agent_name: req.agentName,
            draft_reason: reason,
            correlation_id: req.correlationId ?? null,
            tool: AGENT_EMAIL_TOOL,
          }),
        },
        type: QueryTypes.SELECT,
      },
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'backend',
      event: 'agent_email_draft_write_failed',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      outcome: 'failure',
      message: err instanceof Error ? err.message : String(err),
    }));
    return null;
  }
}

/**
 * Compose an agent email: send it only if everything lines up, otherwise draft it.
 *
 * Never throws. An agent turn must not die because mail could not be decided.
 */
export async function sendAgentEmail(req: AgentEmailRequest): Promise<AgentEmailResult> {
  const gate = await readAgentGate(req.agentName);

  // Suppression is asked FIRST and its answer is final, before any draft is written. A person who
  // unsubscribed should not generate a reviewable draft; see the asymmetry note above.
  let blockedReason: string | null = null;
  try {
    const decision = await evaluateSend({
      leadId: req.leadId,
      campaignId: req.campaignId ?? null,
      channel: 'email',
      toEmail: req.toEmail,
      source: 'manual',
    });
    if (!decision.allowed) blockedReason = decision.blockedReason ?? 'send_not_allowed';
  } catch {
    // A gate that cannot be evaluated is not a licence to send. It is also not a suppression, so
    // this becomes a draft rather than a block.
    return {
      outcome: 'drafted',
      reason: 'send_evaluation_failed',
      draftId: await writeDraft(req, 'send_evaluation_failed'),
      autonomyLevel: gate.level,
      toolGranted: gate.granted,
    };
  }

  if (blockedReason) {
    return {
      outcome: 'blocked', reason: blockedReason, draftId: null,
      autonomyLevel: gate.level, toolGranted: gate.granted,
    };
  }

  if (!gate.usable) {
    return {
      outcome: 'drafted',
      reason: gate.reason ?? 'not_usable',
      draftId: await writeDraft(req, gate.reason ?? 'not_usable'),
      autonomyLevel: gate.level,
      toolGranted: gate.granted,
    };
  }

  // Brand scope. See the docblock: without a campaign the brand and consent checks did not run,
  // so this is outreach nobody vetted. It drafts rather than sends.
  if (!req.campaignId) {
    return {
      outcome: 'drafted',
      reason: 'no_brand_scope',
      draftId: await writeDraft(req, 'no_brand_scope'),
      autonomyLevel: gate.level,
      toolGranted: gate.granted,
    };
  }

  // Everything lines up. The transport is deliberately NOT wired in this change: no agent holds
  // the grant yet, so nothing can reach here in production, and landing the decision logic with
  // its tests before landing the ability to mail strangers is the order that keeps this reversible.
  return {
    outcome: 'drafted',
    reason: 'transport_not_wired',
    draftId: await writeDraft(req, 'transport_not_wired'),
    autonomyLevel: gate.level,
    toolGranted: gate.granted,
  };
}

export default sendAgentEmail;
