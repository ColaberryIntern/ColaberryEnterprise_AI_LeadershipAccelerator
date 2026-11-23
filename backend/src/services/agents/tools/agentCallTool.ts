/**
 * agentCallTool - place_ai_call, the AI phone call any GRANTED agent can make (agent comms tool).
 *
 * Ali, 2026-11-22: "let's use that agent then but I want it setup as a tool the other agents can
 * use. I want everything to be dynamic." Decisions: only agents granted the tool, only people with
 * recorded phone consent, the existing dial guard (10 AM - 8 PM Central, 2 dials per number per 24h).
 *
 * One shared Synthflow agent (the prompt-only shell, unless SYNTHFLOW_AGENT_TOOL_AGENT_ID is set) and
 * one call path key, 'agent-tool', which must be on VOICE_CALL_PATHS. The call is "dynamic": the
 * script is built per call from the calling agent's persona, the purpose it gives, and context.
 *
 * Order of checks, each a refusal that names its reason (nothing is dialed on any refusal):
 *   input valid -> agent granted 'place_ai_call' and usable (readAgentGate) -> the lead has a phone
 *   (the number comes from the LEAD, never from the agent's words; an internal caller may pass one
 *   only if it is that same number) -> phone consent (checkPhoneConsent) -> once per agent, lead,
 *   purpose and Central day (RESERVED before the dial, see below) -> dial (kill switch, allowlist,
 *   dial guard all run inside).
 * A skip inside the dial is reported as NOT placed. An accepted call is logged as a voice
 * communication_logs row attributed to the agent; the result comes back by webhook (T10).
 *
 * Once a day, atomically (T8 hardening): the key is reserved by INSERTING the call's row (status
 * 'reserving') BEFORE dialing. A unique index on voice rows' metadata.idempotency_key
 * (ensureAgentCommsSchema) makes the second of two concurrent requests fail that insert, so it is
 * 'deduped' and never dials. After the dial the row is settled (status 'sent' + the call id), or,
 * when nothing was dialed, released (deleted) so a later retry the same day can go through.
 * A crash between reserve and settle leaves a 'reserving' row: that blocks a retry for the rest of
 * the Central day, which is the safe direction (a missed call, never a duplicate one).
 * The same rule for an AMBIGUOUS provider failure: a definite answer (an HTTP status) releases the
 * key, but a timeout or network error may have placed the call, so the key is kept and the row is
 * settled as 'unconfirmed'. A same-day retry is then 'deduped' rather than ringing them twice.
 */
import crypto from 'crypto';
import { z } from 'zod';

export const AGENT_CALL_TOOL = 'place_ai_call';
export const AGENT_CALL_PATH = 'agent-tool';

export const placeCallSchema = z.object({
  agentName: z.string().trim().min(1).max(100),
  leadId: z.number().int().positive(),
  purpose: z.string().trim().min(5).max(500),
  context: z.string().trim().max(4000).optional(),
  correlationId: z.string().trim().max(100).optional(),
  /** Internal callers only (e.g. Maya's own script); an LLM tool call never supplies it. */
  prompt: z.string().trim().min(20).max(12000).optional(),
  /** Internal callers only; must equal the lead's number on record. */
  phone: z.string().trim().max(40).optional(),
});
export type PlaceCallInput = z.infer<typeof placeCallSchema>;

export type CallOutcome = 'placed' | 'refused' | 'deduped' | 'not_placed';
export interface CallResult { outcome: CallOutcome; reason?: string; callId?: string | null; summary: string }

export interface CallLead { id: number; name: string | null; phone: string | null; email: string | null; company: string | null }

/** The call's identity and attribution, written at reservation and completed at settle. */
export interface CallRow { leadId: number; phone: string; agentName: string; purpose: string; key: string; correlationId: string | null }

export interface CallDeps {
  gate: (agentName: string) => Promise<{ usable: boolean; reason: string | null }>;
  lead: (leadId: number) => Promise<CallLead | null>;
  consent: (leadId: number, phone: string, ctx: Record<string, unknown>) => Promise<{ allowed: boolean; reason?: string; redirectPhone?: string | null }>;
  /** Claim the once-a-day key. Returns a reservation id, or null when the key is already taken. */
  reserve: (row: CallRow) => Promise<string | null>;
  /** The provider accepted the call (or may have: `unconfirmed`): the reserved row becomes the call's record. */
  settle: (reservationId: string, row: CallRow & { callId: string | null; unconfirmed?: boolean }) => Promise<void>;
  /** Nothing was dialed: give the key back. */
  release: (reservationId: string) => Promise<void>;
  persona: (agentName: string) => Promise<{ displayName: string; systemPrompt: string | null }>;
  /** `status` is the provider's HTTP status when it answered. No status on a failure = we do not know. */
  dial: (p: { name: string; phone: string; prompt: string; context: { lead_name: string; lead_company?: string; lead_email?: string; step_goal?: string } }) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string; status?: number }>;
  skipSummary: (reason: string) => string;
  now: () => Date;
}

const digits = (p: string | null | undefined): string => String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

export const ctDate = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

export function callKey(agentName: string, leadId: number, purpose: string, at: Date): string {
  const p = crypto.createHash('sha256').update(purpose.trim().toLowerCase()).digest('hex').slice(0, 16);
  return `agent_tool:${agentName}:${leadId}:${p}:${ctDate(at)}`;
}

/** The per-call script. Persona first, then who and why, then how to open and how to behave. */
export function buildAgentCallPrompt(o: { displayName: string; systemPrompt: string | null; leadName: string | null; purpose: string; context?: string }): string {
  const first = String(o.leadName || '').trim().split(/\s+/)[0] || 'there';
  return [
    o.systemPrompt ? o.systemPrompt.trim() : `You are ${o.displayName} from Colaberry.`,
    '',
    `You are now on a phone call with ${o.leadName || 'someone'}, on behalf of Colaberry.`,
    `WHY YOU ARE CALLING: ${o.purpose}`,
    o.context ? `WHAT YOU ALREADY KNOW:\n${o.context}` : '',
    '',
    `OPEN WITH: "Hi ${first}, this is ${o.displayName} from Colaberry." In that first sentence, say plainly and naturally that you are an AI. If asked whether you are a person, confirm simply that you are an AI.`,
    '- Keep it short and natural; listen more than you talk.',
    '- Never state a price, never promise an outcome, never invent facts or dates. If you do not know, say someone from Colaberry will follow up by email.',
    '- If they ask not to be called again, say you will make sure of that, thank them, and end the call.',
  ].filter((x) => x !== '').join('\n');
}

export async function placeAgentCall(raw: unknown, deps: CallDeps): Promise<CallResult> {
  const parsed = placeCallSchema.safeParse(raw);
  if (!parsed.success) return { outcome: 'refused', reason: 'invalid_input', summary: 'No call was placed: the request was incomplete.' };
  const input = parsed.data;

  const gate = await deps.gate(input.agentName);
  if (!gate.usable) return { outcome: 'refused', reason: gate.reason || 'tool_not_granted', summary: 'No call was placed: this agent is not allowed to place calls.' };

  const lead = await deps.lead(input.leadId);
  if (!lead?.phone || digits(lead.phone).length < 7) return { outcome: 'refused', reason: 'no_phone', summary: 'No call was placed: there is no phone number on record. Capture their details first.' };
  if (input.phone && digits(input.phone) !== digits(lead.phone)) {
    return { outcome: 'refused', reason: 'phone_not_on_record', summary: 'No call was placed: that number is not the one on their record. Confirm and save their number first.' };
  }

  const consent = await deps.consent(lead.id, lead.phone, { agent: input.agentName, correlation_id: input.correlationId ?? null });
  if (!consent.allowed) return { outcome: 'refused', reason: consent.reason || 'no_consent', summary: 'No call was placed: they have not agreed to be called. Offer the booking calendar or email instead.' };
  const dialPhone = consent.redirectPhone || lead.phone;

  const row: CallRow = { leadId: lead.id, phone: dialPhone, agentName: input.agentName, purpose: input.purpose, key: callKey(input.agentName, lead.id, input.purpose, deps.now()), correlationId: input.correlationId ?? null };
  const reservation = await deps.reserve(row);
  if (!reservation) return { outcome: 'deduped', reason: 'already_called_today', summary: 'A call for this already went out today; no second call was placed.' };

  let result: Awaited<ReturnType<CallDeps['dial']>>;
  try {
    result = await dialFor(input, lead, dialPhone, deps);
  } catch (err) {
    await deps.release(reservation);
    throw err;
  }
  const skip = result.data?.skipped === true ? String(result.data?.reason ?? 'unspecified') : null;
  if (!skip && !result.success && typeof result.status !== 'number') {
    await deps.settle(reservation, { ...row, callId: null, unconfirmed: true });
    return { outcome: 'not_placed', reason: 'provider_unconfirmed', summary: 'The call could not be confirmed, so do not say a call is coming. No second call will be placed today. Offer the booking calendar or email instead.' };
  }
  if (skip || !result.success) {
    await deps.release(reservation);
    return skip
      ? { outcome: 'not_placed', reason: skip, summary: deps.skipSummary(skip) }
      : { outcome: 'not_placed', reason: 'provider_rejected', summary: 'The call could not be placed. Offer the booking calendar or email instead.' };
  }

  const callId = typeof result.data?.call_id === 'string' && result.data.call_id ? result.data.call_id : null;
  await deps.settle(reservation, { ...row, callId });
  return { outcome: 'placed', callId, summary: `The call is being placed now to the number on their record.` };
}

async function dialFor(input: PlaceCallInput, lead: CallLead, dialPhone: string, deps: CallDeps): ReturnType<CallDeps['dial']> {
  const persona = await deps.persona(input.agentName);
  const prompt = input.prompt || buildAgentCallPrompt({ displayName: persona.displayName, systemPrompt: persona.systemPrompt, leadName: lead.name, purpose: input.purpose, context: input.context });

  return deps.dial({
    name: lead.name || 'there', phone: dialPhone, prompt,
    context: { lead_name: lead.name || 'there', lead_company: lead.company ?? undefined, lead_email: lead.email ?? undefined, step_goal: input.purpose.slice(0, 200) },
  });
}

/* ── production dependencies, all lazily imported ─────────────────────────── */

export function defaultCallDeps(): CallDeps {
  return {
    gate: async (agentName) => {
      const { readAgentGate } = await import('./agentEmailTool');
      const g = await readAgentGate(agentName, AGENT_CALL_TOOL);
      return { usable: g.usable, reason: g.reason };
    },
    lead: async (leadId) => {
      const { Lead } = await import('../../../models');
      const l = await Lead.findByPk(leadId, { attributes: ['id', 'name', 'phone', 'email', 'company'] });
      return l ? { id: l.id, name: l.name ?? null, phone: l.phone ?? null, email: l.email ?? null, company: l.company ?? null } : null;
    },
    consent: async (leadId, phone, ctx) => {
      const { checkPhoneConsent } = await import('../../mayaTools/outboundConsent');
      const c = await checkPhoneConsent(leadId, 'voice', phone, ctx);
      return { allowed: c.allowed, reason: c.reason, redirectPhone: c.redirectPhone ?? null };
    },
    reserve: async (row) => {
      const { logCommunication } = await import('../../communicationLogService');
      try {
        const created = await logCommunication({
          lead_id: row.leadId, channel: 'voice', direction: 'outbound', delivery_mode: 'live', status: 'reserving',
          to_address: row.phone, provider: 'synthflow',
          metadata: { source: AGENT_CALL_PATH, agent_name: row.agentName, purpose: row.purpose, idempotency_key: row.key, correlation_id: row.correlationId },
        });
        return String(created.get('id'));
      } catch (err) {
        // The unique index (communication_logs_voice_idem_uq) refusing a second reservation is
        // the dedupe; anything else is a real failure and propagates (nothing has been dialed).
        if (err instanceof Error && err.name === 'SequelizeUniqueConstraintError') return null;
        throw err;
      }
    },
    settle: async (reservationId, row) => {
      const { sequelize } = await import('../../../config/database');
      await sequelize.query(
        "UPDATE communication_logs SET status = :status, provider_message_id = :callId WHERE id = :id AND status = 'reserving'",
        { replacements: { id: reservationId, callId: row.callId, status: row.unconfirmed ? 'unconfirmed' : 'sent' } });
    },
    release: async (reservationId) => {
      const { sequelize } = await import('../../../config/database');
      await sequelize.query("DELETE FROM communication_logs WHERE id = :id AND status = 'reserving'", { replacements: { id: reservationId } });
    },
    persona: async (agentName) => {
      const { sequelize } = await import('../../../config/database');
      const { QueryTypes } = await import('sequelize');
      const r = await sequelize.query<{ email_display_name: string | null; system_prompt: string | null }>(
        'SELECT email_display_name, system_prompt FROM ai_agents WHERE agent_name = :agentName LIMIT 1', { replacements: { agentName }, type: QueryTypes.SELECT });
      return { displayName: r[0]?.email_display_name || agentName, systemPrompt: r[0]?.system_prompt ?? null };
    },
    dial: async (p) => {
      const { triggerVoiceCall } = await import('../../synthflowService');
      return triggerVoiceCall({ name: p.name, phone: p.phone, callType: 'callback', brandSlug: AGENT_CALL_PATH, prompt: p.prompt, context: p.context });
    },
    skipSummary: (reason) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { voiceSkipSummary } = require('../../mayaTools/voiceSummaries');
      return voiceSkipSummary(reason);
    },
    now: () => new Date(),
  };
}
