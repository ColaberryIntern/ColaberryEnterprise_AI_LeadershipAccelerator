/**
 * Voice AI Studio configuration (VS1.7): one Zod-validated read of every VOICE_* setting.
 *
 * Contract: loadVoiceConfig NEVER throws. Invalid or incomplete voice settings make Voice Studio
 * DISABLED (with the issues logged), so a typo in an optional engine's config can never crash the
 * server or change unrelated behavior (directive section 10). With every VOICE_* variable unset, the
 * result is exactly today's behavior: studio off, gateway off, legacy Synthflow engine, tests off.
 *
 * Live-test limits are clamped to the directive's ceilings (3 attempts, 180 s, 5 USD per run): a
 * higher value in the environment is a validation error, not a silent raise.
 *
 * Secrets and the test number are never returned by redactedVoiceConfig(); it reports "set"/"unset".
 */
import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be E.164, e.g. +1 then 10 digits');
const httpsUrl = z.string().url().refine((u) => u.startsWith('https://'), 'must be https');
const wssUrl = z.string().url().refine((u) => u.startsWith('wss://'), 'must be wss');

export const TEST_LIMITS = { maxAttempts: 3, maxDurationSeconds: 180, budgetUsd: 5 } as const;

const RawVoiceEnvSchema = z.object({
  VOICE_STUDIO_ENABLED: bool,
  VOICE_GATEWAY_LEGACY_ENABLED: bool,
  VOICE_ENGINE_DEFAULT: z.enum(['synthflow_legacy', 'conversation_relay', 'openai_realtime']).default('synthflow_legacy'),
  VOICE_TEST_ENABLED: bool,
  VOICE_TEST_ALLOWED_NUMBER: e164.optional(),
  VOICE_TEST_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(TEST_LIMITS.maxAttempts).default(TEST_LIMITS.maxAttempts),
  VOICE_TEST_MAX_DURATION_SECONDS: z.coerce.number().int().min(10).max(TEST_LIMITS.maxDurationSeconds).default(TEST_LIMITS.maxDurationSeconds),
  VOICE_TEST_BUDGET_USD: z.coerce.number().positive().max(TEST_LIMITS.budgetUsd).default(TEST_LIMITS.budgetUsd),
  VOICE_PUBLIC_BASE_URL: httpsUrl.optional(),
  VOICE_WS_BASE_URL: wssUrl.optional(),
  VOICE_DESTINATION_HASH_KEY: z.string().min(16).optional(),
  /** Engine A's Claude model (VS2.3). Default per the Claude API guidance; a faster model is an owner decision. */
  VOICE_ENGINE_A_MODEL: z.string().regex(/^claude-[a-z0-9.-]+$/).default('claude-opus-5-5'),
  /** ElevenLabs voice for ConversationRelay ([VoiceID] or [VoiceID]-[model]...). Unset = Twilio's documented default for the language. */
  VOICE_RELAY_VOICE: z.string().regex(/^[A-Za-z0-9]{10,40}(-[A-Za-z0-9_.]+)*$/).optional(),
}).superRefine((v, ctx) => {
  if (v.VOICE_TEST_ENABLED && !v.VOICE_TEST_ALLOWED_NUMBER) {
    ctx.addIssue({ code: 'custom', path: ['VOICE_TEST_ALLOWED_NUMBER'], message: 'required when VOICE_TEST_ENABLED=true' });
  }
  if (v.VOICE_STUDIO_ENABLED && v.VOICE_ENGINE_DEFAULT !== 'synthflow_legacy' && (!v.VOICE_PUBLIC_BASE_URL || !v.VOICE_WS_BASE_URL)) {
    ctx.addIssue({ code: 'custom', path: ['VOICE_WS_BASE_URL'], message: 'a direct engine needs VOICE_PUBLIC_BASE_URL (https) and VOICE_WS_BASE_URL (wss)' });
  }
});

export type VoiceConfig = z.infer<typeof RawVoiceEnvSchema> & { valid: boolean; issues: string[] };

/** The safe, all-off configuration (today's behavior). */
function safeDefaults(): z.infer<typeof RawVoiceEnvSchema> {
  return RawVoiceEnvSchema.parse({});
}

/** Pure: read VOICE_* from an env object. Never throws. */
export function loadVoiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig {
  const picked = Object.fromEntries(Object.entries(env).filter(([k, v]) => k.startsWith('VOICE_') && v !== undefined && v !== ''));
  const r = RawVoiceEnvSchema.safeParse(picked);
  if (r.success) return { ...r.data, valid: true, issues: [] };
  // Fail SAFE: every switch off, legacy engine, tests off. The issues say why.
  return { ...safeDefaults(), valid: false, issues: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/** For logs and the preflight report: never the test number, never a secret. */
export function redactedVoiceConfig(c: VoiceConfig): Record<string, unknown> {
  return {
    valid: c.valid, issues: c.issues,
    studioEnabled: c.VOICE_STUDIO_ENABLED, gatewayLegacyEnabled: c.VOICE_GATEWAY_LEGACY_ENABLED, engineDefault: c.VOICE_ENGINE_DEFAULT,
    testEnabled: c.VOICE_TEST_ENABLED, testAllowedNumber: c.VOICE_TEST_ALLOWED_NUMBER ? 'set' : 'unset',
    testMaxAttempts: c.VOICE_TEST_MAX_ATTEMPTS, testMaxDurationSeconds: c.VOICE_TEST_MAX_DURATION_SECONDS, testBudgetUsd: c.VOICE_TEST_BUDGET_USD,
    publicBaseUrl: c.VOICE_PUBLIC_BASE_URL ? 'set' : 'unset', wsBaseUrl: c.VOICE_WS_BASE_URL ? 'set' : 'unset',
    destinationHashKey: c.VOICE_DESTINATION_HASH_KEY ? 'set' : 'unset (derived from JWT_SECRET)',
    engineAModel: c.VOICE_ENGINE_A_MODEL, relayVoice: c.VOICE_RELAY_VOICE ? 'set' : 'default',
  };
}

/** Boot-time report. Never throws; an invalid config is logged as a warning and treated as all-off. */
export function logVoiceConfigAtBoot(env: Record<string, string | undefined> = process.env): VoiceConfig {
  let c: VoiceConfig;
  try { c = loadVoiceConfig(env); } catch { c = { ...safeDefaults(), valid: false, issues: ['voice config could not be read'] }; }
  const line = { level: c.valid ? 'info' : 'warn', service: 'voice-studio', event: 'voice_config_loaded', outcome: c.valid ? 'success' : 'failure',
    error_class: c.valid ? undefined : 'VoiceConfigInvalid', context: redactedVoiceConfig(c) };
  (c.valid ? console.log : console.warn)(JSON.stringify(line));
  return c;
}
