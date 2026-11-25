/**
 * voice:profiles:seed-cory (VS3.1): seed the "Edu: Cory - Outbound" voice profile from the LIVE
 * Synthflow assistant, not from repo prompts (they can drift from what is actually running).
 *
 *   node dist/scripts/voice/seedCoryProfile.js [--model-env SYNTHFLOW_AI_FLOTATION_AGENT_ID] [--dry]
 *
 * Reads the assistant with ONE read-only GET (10 s timeout, no retry), maps it to version content,
 * and saves a DRAFT version. It never publishes: publishing needs a second person's approval in the
 * Studio. Idempotent: the same live content returns the same version (keyed on content hash).
 * Prints only the hash, lengths and flags, never the prompt text. Default model env: the AI Flotation
 * shell, which synthflowService documents as the "Edu: Cory - Outbound" prompt-only assistant.
 *
 * Exit: 0 ok, 2 refused/invalid, 1 error.
 */
import type { VersionContent } from '../../services/voice/profiles/versionContent';

const arg = (argv: string[], name: string): string | undefined => { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; };

export const CORY_AGENT_KEY = 'edu-cory-outbound';
export const CORY_DISCLOSURE = "This is Colaberry's AI assistant. I'm an AI, not a person.";

export interface SynthflowAssistant { model_id?: string; name?: string; agent?: { prompt?: string; greeting_message?: string; voice_id?: string; language?: string } }

/** The Get endpoint documents `assistants` as a list and the List endpoint as one object: accept both. */
export function pickAssistant(body: unknown): SynthflowAssistant | null {
  const a = (body as { response?: { assistants?: unknown } })?.response?.assistants;
  const one = Array.isArray(a) ? a[0] : a;
  return one && typeof one === 'object' ? (one as SynthflowAssistant) : null;
}

export function toLanguage(l: string | undefined): string {
  if (!l) return 'en-US';
  if (/^[a-z]{2}-[A-Z]{2}$/.test(l)) return l;
  return /^en\b/i.test(l) ? 'en-US' : 'en-US';
}

export function assistantToContent(a: SynthflowAssistant): VersionContent {
  const prompt = (a.agent?.prompt ?? '').trim();
  return {
    prompt,
    first_message: (a.agent?.greeting_message ?? '').trim() || null,
    disclosure: CORY_DISCLOSURE,
    kb_refs: ['admissions_knowledge'],
    tool_permissions: ['admissions_knowledge', 'next_open_strategy_slots'],
    engine: 'conversation_relay',
    engine_config: { promptShell: /\{prompt\}/.test(prompt) },
    voice_id: a.agent?.voice_id ?? null,
    language: toLanguage(a.agent?.language),
    safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 },
    max_call_seconds: 180,
  };
}

export async function fetchAssistant(modelId: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<SynthflowAssistant> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetchImpl(`https://api.synthflow.ai/v2/assistants/${encodeURIComponent(modelId)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: ctl.signal });
    if (res.status === 404) throw Object.assign(new Error('assistant not found'), { name: 'NotFound' });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`synthflow auth ${res.status}`), { name: 'AuthError' });
    if (!res.ok) throw Object.assign(new Error(`synthflow status ${res.status}`), { name: 'UpstreamUnavailable' });
    const a = pickAssistant(await res.json());
    if (!a || !a.agent?.prompt) throw Object.assign(new Error('no assistant prompt in response'), { name: 'ContractViolation' });
    return a;
  } finally {
    clearTimeout(t);
  }
}

export async function runSeed(argv: string[], env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<{ code: number; out: Record<string, unknown> }> {
  const modelEnv = arg(argv, '--model-env') ?? 'SYNTHFLOW_AI_FLOTATION_AGENT_ID';
  if (!/^SYNTHFLOW_[A-Z_]+$/.test(modelEnv)) return { code: 2, out: { refused: 'model env must be a SYNTHFLOW_* variable name' } };
  const modelId = env[modelEnv];
  const apiKey = env.SYNTHFLOW_API_KEY;
  if (!modelId || !apiKey) return { code: 2, out: { refused: `${modelEnv} and SYNTHFLOW_API_KEY must be set` } };
  const a = await fetchAssistant(modelId, apiKey, fetchImpl);
  const content = assistantToContent(a);
  const { VersionContentSchema, contentHash } = await import('../../services/voice/profiles/versionContent');
  const v = VersionContentSchema.safeParse(content);
  if (!v.success) return { code: 2, out: { refused: 'live assistant does not map to valid content', issues: v.error.issues.map((i) => i.path.join('.')) } };
  const summary = { assistantName: a.name ?? null, promptChars: content.prompt.length, promptShell: content.engine_config.promptShell, hasGreeting: content.first_message !== null, language: content.language, hash: contentHash(v.data) };
  if (argv.includes('--dry')) return { code: 0, out: { dry: true, ...summary } };
  const { ensureProfile, createDraftVersion } = await import('../../services/voice/profiles/profileStore');
  const { LEGACY_TENANT_ID } = await import('../../services/voice/gateway/legacyFacade');
  const { profile } = await ensureProfile({ tenantId: LEGACY_TENANT_ID, brandSlug: 'colaberry', agentKey: CORY_AGENT_KEY, name: 'Edu: Cory - Outbound', direction: 'outbound' });
  const { version, created } = await createDraftVersion(profile.id, v.data, `seed:synthflow:${modelEnv}`);
  return { code: 0, out: { seeded: true, created, profileId: profile.id, versionId: version.id, version: version.version, status: version.status, ...summary } };
}

if (require.main === module) {
  runSeed(process.argv, process.env).then(async ({ code, out }) => {
    console.log(JSON.stringify(out));
    try { (await import('../../config/database')).sequelize.close(); } catch { /* not opened on refusal */ }
    process.exit(code);
  }, (e: Error) => {
    console.error(JSON.stringify({ level: 'error', event: 'voice_seed_cory_failed', error_class: e.name || 'Error' }));
    process.exit(1);
  });
}
