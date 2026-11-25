/**
 * Inbound routing (VS3.6), pure. The ONLY input that picks a tenant, brand or engine is the row of the
 * number that was called (Twilio signed the request, and the number is an active one we hold). The
 * caller's number, anything they say, and any request field other than the called number are not
 * inputs, so a caller cannot route themselves to another brand.
 *
 * A number answers with our agent only when its own routing_policy says so. Every other case is the
 * safe fallback: no policy, an invalid policy, a tenant that is not live yet, an engine that is not
 * ready, or out of hours. The fallback dials the approved human line only inside transfer hours;
 * otherwise it is a short message. Voicemail is not offered: recording a caller needs an approved
 * recording and retention rule first.
 */
import { z } from 'zod';
import { teammateAvailable, withinTransferHours } from '../transfer/humanTransfer';

export const InboundPolicySchema = z.object({
  enabled: z.boolean(),
  /** Engine A only: it is the engine that reports the end of a session back to us. */
  engine: z.literal('conversation_relay'),
  hours: z.enum(['always', 'business']),
  fallback: z.enum(['human_line', 'message']),
}).strict();
export type InboundPolicy = z.infer<typeof InboundPolicySchema>;

export interface CalledNumber { id: string; tenantId: string; numberRef: string; brandSlug: string | null; routingPolicy: unknown }

export interface InboundFacts {
  number: CalledNumber | null;
  testTenantId: string;
  studioEnabled: boolean;
  testEnabled: boolean;
  engineReady: boolean;
  transferTarget: string | undefined;
  /** The emergency stop is on, or could not be read: no agent and no dial, only the message. */
  stopped: boolean;
  now: Date;
}

/**
 * The brand the live engine's profile speaks for. Until per-brand profiles are wired to live calls, the
 * engine always speaks the frozen Colaberry TEST profile, so only a Test Lab number of that brand (or
 * with no brand recorded, which is how the test line is registered) may be answered by it.
 */
export const LIVE_PROFILE_BRAND = 'colaberry';
export const agentSpeaksFor = (n: CalledNumber, testTenantId: string): boolean =>
  n.tenantId === testTenantId && (n.brandSlug === null || n.brandSlug === LIVE_PROFILE_BRAND);

export type FallbackReason = 'emergency_stop' | 'unknown_number' | 'no_policy' | 'invalid_policy' | 'disabled' | 'no_agent_for_brand' | 'not_live' | 'engine_not_ready' | 'after_hours';
export type InboundPlan =
  | { kind: 'agent'; engine: 'conversation_relay'; number: CalledNumber; testMode: boolean }
  | { kind: 'human'; reason: FallbackReason; number: CalledNumber; testMode: boolean }
  | { kind: 'message'; reason: FallbackReason; number: CalledNumber | null; testMode: boolean };

export function planInbound(f: InboundFacts): InboundPlan {
  const n = f.number;
  if (!n) return { kind: 'message', reason: 'unknown_number', number: null, testMode: false };
  const testMode = n.tenantId === f.testTenantId;
  const message = (reason: FallbackReason): InboundPlan => ({ kind: 'message', reason, number: n, testMode });

  const raw = (n.routingPolicy as { inbound?: unknown } | null)?.inbound;
  if (raw === undefined || raw === null) return message('no_policy');
  const p = InboundPolicySchema.safeParse(raw);
  if (!p.success) return message('invalid_policy');
  const fallback = (reason: FallbackReason): InboundPlan => (p.data.fallback === 'human_line' && teammateAvailable(f.transferTarget, f.now)
    ? { kind: 'human', reason, number: n, testMode } : message(reason));

  if (f.stopped) return message('emergency_stop');
  if (!p.data.enabled) return fallback('disabled');
  if (!agentSpeaksFor(n, f.testTenantId)) return fallback('no_agent_for_brand');
  // A customer number needs the studio switch; the dedicated test number needs the test switch.
  if (testMode ? !f.testEnabled : !f.studioEnabled) return fallback('not_live');
  if (p.data.hours === 'business' && !withinTransferHours(f.now)) return fallback('after_hours');
  if (!f.engineReady) return fallback('engine_not_ready');
  return { kind: 'agent', engine: p.data.engine, number: n, testMode };
}

export const INBOUND_MESSAGE_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is not taking calls right now. Goodbye.</Say><Hangup/></Response>';
