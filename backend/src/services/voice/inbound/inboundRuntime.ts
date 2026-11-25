/**
 * Answer one inbound call (VS3.6). Plan from the called number's row, create the call row once per
 * Twilio CallSid (a redelivered webhook reuses it), then return TwiML.
 *
 * Failure modes: any error (lookup, insert, engine TwiML) is logged with its class and the caller
 * hears the safe message; nothing here ever returns a 4xx/5xx, which Twilio would read out as an
 * application error. No retry: Twilio owns redelivery. The called number is used for the lookup and
 * is never stored on the call or logged; the caller's number is not an input at all.
 */
import { QueryTypes } from 'sequelize';
import type { CallSession } from './inboundTypes';
import { INBOUND_MESSAGE_TWIML, planInbound, type CalledNumber, type InboundFacts } from './inboundPlan';
import { DIAL_ACTION_PATH, ACTION_TOKEN_TTL_SECONDS, dialTwiml } from '../transfer/humanTransfer';
import { mintToken } from '../twilio/correlationToken';

export interface InboundDeps {
  findNumber: (calledNumber: string) => Promise<CalledNumber | null>;
  facts: () => Omit<InboundFacts, 'number'>;
  publicBaseUrl: () => string | undefined;
  /** One row per CallSid; returns the existing row on redelivery. */
  openCall: (s: CallSession) => Promise<{ callId: string }>;
  /** ended: the caller only hears a message and is hung up on, so nothing later closes this row. */
  markFallback: (callId: string, reason: string, ended: boolean) => Promise<void>;
  agentTwiml: (callId: string) => Promise<string>;
  log: (line: Record<string, unknown>) => void;
}

export async function answerInbound(input: { calledNumber: string | undefined; callSid: string | undefined }, d: InboundDeps): Promise<string> {
  let callId: string | null = null;
  try {
    const number = input.calledNumber ? await d.findNumber(input.calledNumber) : null;
    const facts = d.facts();
    const plan = planInbound({ ...facts, number });
    if (!plan.number || !input.callSid) {
      d.log({ level: 'warn', event: 'voice_inbound_fallback', outcome: 'skipped', error_class: 'InboundNotRoutable', reason: plan.number ? 'no_call_sid' : 'unknown_number' });
      return INBOUND_MESSAGE_TWIML;
    }
    ({ callId } = await d.openCall({ callSid: input.callSid, number: plan.number, engine: 'conversation_relay', testMode: plan.testMode }));
    if (plan.kind === 'agent') {
      const xml = await d.agentTwiml(callId);
      d.log({ level: 'info', event: 'voice_inbound_answered', outcome: 'success', call_id: callId, number_ref: plan.number.numberRef, brand: plan.number.brandSlug });
      return xml;
    }
    d.log({ level: 'warn', event: 'voice_inbound_fallback', outcome: 'partial', call_id: callId, number_ref: plan.number.numberRef, reason: plan.reason, kind: plan.kind });
    const base = d.publicBaseUrl();
    const dial = plan.kind === 'human' && Boolean(facts.transferTarget && base);
    await d.markFallback(callId, `inbound_${plan.reason}`, !dial);
    if (dial && facts.transferTarget && base) {
      return dialTwiml(facts.transferTarget, `${new URL(DIAL_ACTION_PATH, base).toString()}?ref=${encodeURIComponent(mintToken(callId, 'status', ACTION_TOKEN_TTL_SECONDS))}`);
    }
    return INBOUND_MESSAGE_TWIML;
  } catch (e) {
    // The caller hears the message and is hung up on, so an opened row is ended here too.
    if (callId) await d.markFallback(callId, 'inbound_error', true).catch((x: Error) => d.log({ level: 'error', event: 'voice_inbound_close_failed', outcome: 'failure', error_class: x.name || 'DatabaseError', call_id: callId }));
    d.log({ level: 'error', event: 'voice_inbound_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'InboundError', call_id: callId });
    return INBOUND_MESSAGE_TWIML;
  }
}

async function db() { return (await import('../../../config/database')).sequelize; }

export async function findNumber(calledNumber: string): Promise<CalledNumber | null> {
  if (!/^\+[1-9]\d{6,14}$/.test(calledNumber)) return null;
  const s = await db();
  const rows = await s.query<CalledNumber>(
    `SELECT id, tenant_id AS "tenantId", number_ref AS "numberRef", brand_slug AS "brandSlug", routing_policy AS "routingPolicy"
       FROM voice_numbers WHERE provider = 'twilio' AND status = 'active' AND e164_restricted = :n LIMIT 1`,
    { replacements: { n: calledNumber }, type: QueryTypes.SELECT });
  return rows[0] ?? null;
}

export async function openInboundCall(c: CallSession): Promise<{ callId: string }> {
  const s = await db();
  const key = `inbound:${c.callSid}`;
  // No conflict target on purpose. voice_calls has two unique indexes a redelivery can hit (idempotency
  // key, and engine + provider call id). Naming one made the other throw under concurrency.
  const inserted = await s.query<{ id: string }>(
    `INSERT INTO voice_calls (tenant_id, direction, engine, idempotency_key, recipient_ref, purpose, state, test_mode, provider_call_id)
     VALUES (:tenant, 'inbound', :engine, :key, :ref, 'inbound', 'ringing', :test, :sid)
     ON CONFLICT DO NOTHING RETURNING id`,
    { replacements: { tenant: c.number.tenantId, engine: c.engine, key, ref: `inbound:${c.number.numberRef}`, test: c.testMode, sid: c.callSid }, type: QueryTypes.SELECT });
  if (inserted[0]) return { callId: inserted[0].id };
  const [row] = await s.query<{ id: string }>('SELECT id FROM voice_calls WHERE tenant_id = :tenant AND idempotency_key = :key', { replacements: { tenant: c.number.tenantId, key }, type: QueryTypes.SELECT });
  if (!row) throw Object.assign(new Error('this CallSid is already recorded for another line'), { name: 'ContractViolation' });
  return { callId: row.id };
}

export async function markInboundFallback(callId: string, reason: string, ended: boolean): Promise<void> {
  const s = await db();
  await s.query(
    `UPDATE voice_calls SET state_reason = :reason, updated_at = NOW(),
            state = CASE WHEN :ended THEN 'canceled' ELSE state END, ended_at = CASE WHEN :ended THEN NOW() ELSE ended_at END
      WHERE id = :callId AND direction = 'inbound'`,
    { replacements: { callId, reason, ended }, type: QueryTypes.UPDATE });
}

export function productionInboundDeps(): InboundDeps {
  /* eslint-disable @typescript-eslint/no-var-requires -- lazy: importing the controller must not pull the engines in */
  const config = () => (require('../voiceConfig') as typeof import('../voiceConfig')).loadVoiceConfig();
  return {
    findNumber,
    facts: () => {
      const c = config();
      return {
        testTenantId: (require('../testlab/testLabService') as typeof import('../testlab/testLabService')).TEST_TENANT_ID,
        studioEnabled: c.VOICE_STUDIO_ENABLED, testEnabled: c.VOICE_TEST_ENABLED,
        engineReady: Boolean(c.VOICE_WS_BASE_URL && process.env.ANTHROPIC_API_KEY), transferTarget: c.VOICE_TRANSFER_NUMBER, now: new Date(),
      };
    },
    publicBaseUrl: () => config().VOICE_PUBLIC_BASE_URL,
    openCall: openInboundCall,
    markFallback: markInboundFallback,
    agentTwiml: (callId) => (require('../engines/voiceRuntime') as typeof import('../engines/voiceRuntime')).connectTwimlFor(callId),
    log: (line) => (line.level === 'info' ? console.log : console.warn)(JSON.stringify({ service: 'voice-studio', ...line })),
  };
}
