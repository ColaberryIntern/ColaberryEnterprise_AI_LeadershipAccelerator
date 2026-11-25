/**
 * Test Lab policy (VS2.5), pure. Decides whether ONE live test call may start, before anything
 * touches the gateway or the carrier.
 *
 * The browser never sends a phone number: the only destination is the server-side approved id
 * "test-allowed", which resolves to VOICE_TEST_ALLOWED_NUMBER inside the server. The request schema
 * is strict (unknown keys are a 400) and any value that looks like a phone number is a 400 too.
 *
 * Limits (directive section 10; TEST_LIMITS cannot be raised by config):
 *   - never from CI; VOICE_TEST_ENABLED must be on; explicit confirm: true
 *   - at most VOICE_TEST_MAX_ATTEMPTS (3) per run; a 4th is refused
 *   - concurrency 1: no other test call in flight
 *   - worst-case spend of the run (attempts x max duration x worst rate) within VOICE_TEST_BUDGET_USD
 *   - no automatic retry: one request = at most one dial
 */
import { z } from 'zod';
import type { VoiceConfig } from '../voiceConfig';

export const APPROVED_DESTINATIONS = ['test-allowed'] as const;
export const TEST_SCRIPTS = ['live-01', 'live-02', 'smoke'] as const;
/** Worst published per-minute rate across both engines (COST_MODEL.md, Engine A upper bound). */
export const WORST_CASE_USD_PER_MIN = 0.115;

/**
 * A value made only of phone characters with 7+ digits. Mixed values like "run-20261124" are ids, not
 * numbers (regression: a date in a run id was rejected). Unknown keys are refused by .strict() anyway.
 */
export const looksLikePhone = (v: unknown): boolean =>
  typeof v === 'string' && /^[\d\s().+-]+$/.test(v) && v.replace(/\D/g, '').length >= 7;

export const LiveTestRequestSchema = z.object({
  runId: z.string().regex(/^[a-z0-9-]{6,64}$/),
  destinationId: z.enum(APPROVED_DESTINATIONS),
  engine: z.enum(['conversation_relay', 'openai_realtime']),
  script: z.enum(TEST_SCRIPTS),
  confirm: z.literal(true),
}).strict().superRefine((v, ctx) => {
  for (const [k, val] of Object.entries(v)) if (looksLikePhone(val)) ctx.addIssue({ code: 'custom', path: [k], message: 'phone numbers are never accepted; use an approved destination id' });
});
export type LiveTestRequest = z.infer<typeof LiveTestRequestSchema>;

export type ParseOutcome = { ok: true; req: LiveTestRequest } | { ok: false; status: 400; errorClass: 'ValidationError'; issues: string[] };

export function parseLiveTestRequest(body: unknown): ParseOutcome {
  // A raw number anywhere in the body (even under an unknown key) is named explicitly in the error.
  const raw = body && typeof body === 'object' ? Object.values(body as Record<string, unknown>) : [];
  const r = LiveTestRequestSchema.safeParse(body);
  if (r.success) return { ok: true, req: r.data };
  const issues = r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  if (raw.some(looksLikePhone)) issues.unshift('phone numbers are never accepted; use an approved destination id');
  return { ok: false, status: 400, errorClass: 'ValidationError', issues };
}

export interface StartFacts {
  ci: boolean;
  config: Pick<VoiceConfig, 'valid' | 'VOICE_TEST_ENABLED' | 'VOICE_TEST_ALLOWED_NUMBER' | 'VOICE_TEST_MAX_ATTEMPTS' | 'VOICE_TEST_MAX_DURATION_SECONDS' | 'VOICE_TEST_BUDGET_USD'>;
  attemptsInRun: number;
  inFlight: number;
}

export type StartRefusal = 'ci_environment' | 'test_mode_disabled' | 'no_allowed_number' | 'attempts_exhausted' | 'another_test_in_flight' | 'budget_exceeded';
export type StartVerdict = { ok: true; attemptNumber: number; worstCaseRunUsd: number } | { ok: false; reason: StartRefusal; status: 403 | 409 | 429 };

export function worstCaseRunUsd(attempts: number, maxSeconds: number): number {
  return Number((attempts * (maxSeconds / 60) * WORST_CASE_USD_PER_MIN).toFixed(4));
}

export function evaluateStart(f: StartFacts): StartVerdict {
  if (f.ci) return { ok: false, reason: 'ci_environment', status: 403 };
  if (!f.config.valid || !f.config.VOICE_TEST_ENABLED) return { ok: false, reason: 'test_mode_disabled', status: 403 };
  if (!f.config.VOICE_TEST_ALLOWED_NUMBER) return { ok: false, reason: 'no_allowed_number', status: 403 };
  if (f.attemptsInRun >= f.config.VOICE_TEST_MAX_ATTEMPTS) return { ok: false, reason: 'attempts_exhausted', status: 429 };
  if (f.inFlight > 0) return { ok: false, reason: 'another_test_in_flight', status: 409 };
  const next = f.attemptsInRun + 1;
  const spend = worstCaseRunUsd(next, f.config.VOICE_TEST_MAX_DURATION_SECONDS);
  if (spend > f.config.VOICE_TEST_BUDGET_USD) return { ok: false, reason: 'budget_exceeded', status: 429 };
  return { ok: true, attemptNumber: next, worstCaseRunUsd: spend };
}

/** CI detection: any of the standard CI variables set to a non-empty, non-"false" value. */
export function isCi(env: Record<string, string | undefined> = process.env): boolean {
  return ['CI', 'GITHUB_ACTIONS', 'BUILDKITE', 'GITLAB_CI', 'CIRCLECI'].some((k) => !!env[k] && env[k] !== 'false' && env[k] !== '0');
}
