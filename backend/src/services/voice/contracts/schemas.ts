/**
 * Voice AI Studio canonical contracts, version 1 (VS1.3).
 *
 * Every voice provider (Twilio carrier + an engine, or the legacy Synthflow adapter during
 * migration) speaks these shapes. Provider identifiers (Twilio CallSid, stream SIDs, Synthflow
 * call_id) are ALIASES on a call; the business identity is our own callId (UUID).
 *
 * Each schema is a runtime check at a module boundary, so a provider payload that drifts from the
 * contract is rejected with a stable error class instead of reaching business logic. Types are
 * derived from the schemas (z.infer) so the two can never disagree.
 */
import { z } from 'zod';

export const CONTRACT_VERSION = 1 as const;

export const VoiceEngineSchema = z.enum(['conversation_relay', 'openai_realtime', 'synthflow_legacy']);
export type VoiceEngine = z.infer<typeof VoiceEngineSchema>;

export const CallStateSchema = z.enum([
  'requested', 'blocked', 'reserved', 'dispatching', 'queued', 'ringing', 'answered',
  'session_active', 'completed', 'busy', 'no_answer', 'failed', 'canceled', 'dispatch_unknown',
]);
export type CallState = z.infer<typeof CallStateSchema>;

/** States a call never leaves once reached (first terminal wins; see callStateReducer). */
export const TERMINAL_STATES: ReadonlySet<CallState> = new Set(['blocked', 'completed', 'busy', 'no_answer', 'failed', 'canceled']);

/** UUIDs are compared as identities everywhere, so they are lowercased at the boundary (an uppercase copy is the same call). */
const uuid = z.string().uuid().transform((s) => s.toLowerCase());
/** Opaque reference to a recipient (lead/contact id or approved-destination id). Never a raw phone number. */
const recipientRef = z.string().min(1).max(200).refine((s) => !/\d{7,}/.test(s.replace(/[\s().+-]/g, '')), {
  message: 'recipientRef must be an opaque reference, not a phone number',
});

export const VoiceRequestSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  tenantId: z.string().min(1).max(100),
  brandSlug: z.string().min(1).max(100),
  path: z.string().min(1).max(100),
  callType: z.string().min(1).max(100),
  profileId: z.string().min(1).max(100),
  recipientRef,
  idempotencyKey: z.string().min(8).max(200),
  consentRef: z.string().min(1).max(200).optional(),
  purpose: z.string().min(1).max(200),
  context: z.record(z.string(), z.unknown()),
  testMode: z.boolean(),
}).strict();
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;

/** Only the gateway mints this, after policy + atomic reservation. Providers accept nothing else. */
export const AuthorizedDispatchSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  callId: uuid,
  reservationId: uuid,
  engine: VoiceEngineSchema,
  routeId: z.string().min(1),
  profileVersionId: z.string().min(1),
  /** E.164 destination, resolved server-side from recipientRef. Never logged. */
  destinationE164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  fromNumberRef: z.string().min(1),
  maxDurationSeconds: z.number().int().positive().max(3600),
  testMode: z.boolean(),
  authorizedAt: z.string().datetime(),
}).strict();
export type AuthorizedDispatch = z.infer<typeof AuthorizedDispatchSchema>;

/**
 * Dispatch outcome. `unknown` is first-class: a timeout after sending means we do NOT know whether
 * the carrier created a call, so the caller must reconcile, never retry (directive section 5).
 */
export const DispatchResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('accepted'), callId: uuid, providerCallId: z.string().min(1), acceptedAt: z.string().datetime() }).strict(),
  z.object({ outcome: z.literal('refused'), callId: uuid, errorClass: z.string().min(1), retryable: z.boolean(), detail: z.string().max(500) }).strict(),
  z.object({ outcome: z.literal('unknown'), callId: uuid, errorClass: z.string().min(1), detail: z.string().max(500) }).strict(),
]);
export type DispatchResult = z.infer<typeof DispatchResultSchema>;

export const ProviderStatusSchema = z.object({
  providerCallId: z.string().min(1),
  state: CallStateSchema,
  answeredBy: z.enum(['human', 'machine', 'unknown']).optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  observedAt: z.string().datetime(),
}).strict();
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ProviderHealthSchema = z.object({
  provider: z.string().min(1),
  ok: z.boolean(),
  checkedAt: z.string().datetime(),
  latencyMs: z.number().nonnegative().optional(),
  errorClass: z.string().optional(),
}).strict();
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

/** A provider payload whose signature/token was already verified by the ingress layer. */
export const VerifiedProviderEventSchema = z.object({
  provider: VoiceEngineSchema.or(z.literal('twilio')),
  verifiedBy: z.enum(['twilio_signature', 'synthflow_token', 'internal']),
  receivedAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
}).strict();
export type VerifiedProviderEvent = z.infer<typeof VerifiedProviderEventSchema>;

export const EventSourceSchema = z.enum(['gateway', 'carrier', 'session', 'reconciler', 'legacy']);

/** The normalized, append-only event every source is reduced to. */
export const CanonicalCallEventSchema = z.object({
  contractVersion: z.literal(CONTRACT_VERSION),
  /** Unique per real-world event (provider event id, or a stable semantic key). Duplicates are ignored. */
  eventKey: z.string().min(1).max(300),
  callId: uuid,
  source: EventSourceSchema,
  /** The state this event asserts the call reached. */
  state: CallStateSchema,
  occurredAt: z.string().datetime(),
  providerCallId: z.string().min(1).optional(),
  answeredBy: z.enum(['human', 'machine', 'unknown']).optional(),
  errorClass: z.string().optional(),
}).strict();
export type CanonicalCallEvent = z.infer<typeof CanonicalCallEventSchema>;

/** Stable error class for a contract violation at a boundary (CLAUDE.md error classification). */
export class ContractViolation extends Error {
  readonly errorClass = 'ContractViolation';
  constructor(readonly contract: string, readonly issues: string[]) {
    super(`${contract} contract violation: ${issues.join('; ')}`);
  }
}

/** Parse at a boundary; throw ContractViolation (never a bare ZodError) on failure. */
export function parseContract<T>(schema: z.ZodType<T>, contract: string, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ContractViolation(contract, r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  return r.data;
}
