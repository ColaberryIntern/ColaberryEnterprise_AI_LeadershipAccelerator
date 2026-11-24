/**
 * voice:preflight - is this environment ready for a bounded live test? (VS1.7) NEVER dials.
 *
 * Reports, redacted: the validated voice config, which provider credentials are PRESENT (names only,
 * never values), whether the test destination is configured (set/unset, never the number), the live-test
 * limits, and the worst-case spend of one approved run against the budget. With --mode test it also
 * requires the test switch and destination. No network call is made in this version; credential
 * checks against provider APIs (read-only) are added with the carrier adapter in VS2.1.
 *
 * Run: npm run voice:preflight -- --mode test --redacted
 * Exit: 0 report printed (READY or NOT READY is in the output) · 2 the config itself is invalid
 */
import { loadVoiceConfig, redactedVoiceConfig, TEST_LIMITS } from '../../services/voice/voiceConfig';

/** Engine A high-end cost per connected minute (docs/voice-studio/COST_MODEL.md). */
export const WORST_CASE_USD_PER_MIN = 0.115;
const CREDENTIAL_NAMES = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'ANTHROPIC_API_KEY'];

export function buildPreflight(env: Record<string, string | undefined>, mode: 'test' | 'check') {
  const config = loadVoiceConfig(env);
  const credentials = Object.fromEntries(CREDENTIAL_NAMES.map((n) => [n, env[n] ? 'present' : 'missing']));
  const worstCaseUsd = Number((config.VOICE_TEST_MAX_ATTEMPTS * (config.VOICE_TEST_MAX_DURATION_SECONDS / 60) * WORST_CASE_USD_PER_MIN).toFixed(2));
  const blockers: string[] = [...config.issues];
  if (mode === 'test') {
    if (!config.VOICE_TEST_ENABLED) blockers.push('VOICE_TEST_ENABLED is not true');
    if (!config.VOICE_TEST_ALLOWED_NUMBER) blockers.push('VOICE_TEST_ALLOWED_NUMBER is not set');
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_API_KEY_SID || !env.TWILIO_API_KEY_SECRET) blockers.push('Twilio credentials missing');
    if (config.VOICE_ENGINE_DEFAULT === 'openai_realtime' && !env.OPENAI_API_KEY) blockers.push('OPENAI_API_KEY missing for Engine B');
    if (worstCaseUsd > config.VOICE_TEST_BUDGET_USD) blockers.push(`worst case ${worstCaseUsd} USD exceeds the ${config.VOICE_TEST_BUDGET_USD} USD budget`);
  }
  return {
    mode, verdict: blockers.length ? 'NOT READY' : 'READY', blockers, dialsPlaced: 0,
    config: redactedVoiceConfig(config), credentials,
    limits: { ...TEST_LIMITS, configured: { attempts: config.VOICE_TEST_MAX_ATTEMPTS, seconds: config.VOICE_TEST_MAX_DURATION_SECONDS, budgetUsd: config.VOICE_TEST_BUDGET_USD } },
    worstCaseUsd, configValid: config.valid,
  };
}

const HELP = `voice:preflight - is this environment ready for a bounded live test? Never dials.

Usage: npm run voice:preflight -- [--mode test] [--redacted] [--help]
  --mode test   also require VOICE_TEST_ENABLED, VOICE_TEST_ALLOWED_NUMBER and Twilio credentials
  --redacted    accepted for clarity; output is ALWAYS redacted (no numbers, no secret values)
Exit: 0 report printed (READY / NOT READY in the output), 2 the voice config itself is invalid`;

function main() {
  if (process.argv.includes('--help')) { console.log(HELP); return; }
  const i = process.argv.indexOf('--mode');
  const mode = i > -1 && process.argv[i + 1] === 'test' ? 'test' : 'check';
  const report = buildPreflight(process.env, mode);
  console.log(JSON.stringify({ event: 'voice_preflight', ...report }, null, 1));
  process.exit(report.configValid ? 0 : 2);
}

if (require.main === module) main();
