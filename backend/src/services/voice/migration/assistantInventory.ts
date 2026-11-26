/**
 * Synthflow assistant inventory (VS5.1). READ ONLY: GET requests, nothing else.
 *
 * A row says what an assistant IS without carrying anything private: the key is a hash of its id (stable,
 * not reversible to a usable id), prompts and greetings become a hash and a length, numbers become counts,
 * webhooks become a host and whether a token is on the URL. Prompts, ids, numbers, keys and webhook paths
 * never leave this module.
 */
import { createHash } from 'crypto';

const BASE = 'https://api.synthflow.ai/v2';
const PAGE = 50;
const MAX_PAGES = 20;

export interface RawAssistant {
  model_id?: string; name?: string; type?: string; phone_number?: string | null; attached_phone_numbers?: unknown[] | null; external_webhook_url?: string | null; inbound_call_webhook_url?: string | null;
  is_recording?: boolean; consent_recording?: boolean; knowledge_base_id?: string | null; actions?: unknown[] | null; input_variables?: unknown[] | null; created_at?: string;
  max_duration?: { duration_seconds?: number; is_enabled?: boolean } | null; voicemail_message?: { enabled?: boolean } | null;
  agent?: { prompt?: string | null; greeting_message?: string | null; language?: string | null; llm?: string | null; provider?: string | null; voice_id?: string | null; timezone?: string | null; working_hours?: unknown; end_call_reasons_v2?: unknown[] | null; is_consent_enabled?: boolean } | null;
}

export interface InventoryRow {
  key: string; name: string; direction: string; envNames: string[]; numbers: number;
  promptHash: string; promptChars: number; promptShell: boolean; variables: string[]; greetingChars: number; greetingNamesAi: boolean;
  language: string | null; voiceProvider: string | null; voiceSet: boolean; llm: string | null; timezone: string | null; workingHours: boolean;
  knowledgeBase: boolean; actions: number; webhookHost: string | null; webhookHasToken: boolean; inboundWebhook: boolean;
  recording: boolean; recordingConsent: boolean; maxSeconds: number | null; voicemail: boolean; createdOn: string | null;
}

const hash = (s: string): string => createHash('sha256').update(s).digest('hex');
export const assistantKey = (modelId: string): string => `sf-${hash(modelId).slice(0, 8)}`;
/** A name is kept, but a run of digits in it (a number) is not. */
const safeName = (s: string): string => s.replace(/\+?\d[\d\s().-]{5,}\d/g, '#').replace(/[|\r\n]/g, ' ').trim().slice(0, 80);

function webhook(u: string | null | undefined): { host: string | null; token: boolean } {
  if (!u) return { host: null, token: false };
  try {
    const x = new URL(u);
    return { host: x.hostname, token: x.searchParams.has('token') };
  } catch {
    return { host: 'unparseable', token: false }; // reported as such; the value itself is never printed
  }
}

export function toRow(a: RawAssistant, env: Record<string, string | undefined> = {}): InventoryRow {
  if (!a.model_id) throw Object.assign(new Error('assistant without an id'), { name: 'ContractViolation' });
  const g = a.agent ?? {};
  const prompt = g.prompt ?? '';
  const greeting = g.greeting_message ?? '';
  const w = webhook(a.external_webhook_url);
  return {
    key: assistantKey(a.model_id), name: safeName(a.name ?? '(unnamed)'), direction: a.type ?? 'unknown',
    envNames: Object.entries(env).filter(([k, v]) => /^SYNTHFLOW_[A-Z_]*AGENT_ID$/.test(k) && v === a.model_id).map(([k]) => k).sort(),
    numbers: new Set([...(a.attached_phone_numbers ?? []).map((n) => JSON.stringify(n)), ...(a.phone_number && !(a.attached_phone_numbers ?? []).length ? ['own'] : [])]).size,
    promptHash: hash(prompt).slice(0, 12), promptChars: prompt.length, promptShell: /\{prompt\}/.test(prompt), variables: [...new Set((prompt.match(/\{[A-Za-z_]{1,40}\}/g) ?? []))].sort(),
    greetingChars: greeting.trim().length, greetingNamesAi: /\b(AI|artificial intelligence|virtual assistant)\b/i.test(greeting),
    language: g.language ?? null, voiceProvider: g.provider ?? null, voiceSet: Boolean(g.voice_id), llm: g.llm ?? null, timezone: g.timezone ?? null, workingHours: Boolean(g.working_hours),
    knowledgeBase: Boolean(a.knowledge_base_id), actions: (a.actions ?? []).length, webhookHost: w.host, webhookHasToken: w.token, inboundWebhook: Boolean(a.inbound_call_webhook_url),
    recording: a.is_recording === true, recordingConsent: a.consent_recording === true, maxSeconds: a.max_duration?.is_enabled ? a.max_duration.duration_seconds ?? null : null,
    voicemail: a.voicemail_message?.enabled === true, createdOn: a.created_at?.slice(0, 10) ?? null,
  };
}

export async function fetchAssistants(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<RawAssistant[]> {
  const out: RawAssistant[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchImpl(`${BASE}/assistants?limit=${PAGE}&offset=${out.length}`, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) }); // eslint-disable-line no-await-in-loop -- pages in order
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`synthflow auth ${res.status}`), { name: 'AuthError' });
    if (!res.ok) throw Object.assign(new Error(`synthflow status ${res.status}`), { name: 'UpstreamUnavailable' });
    const body = (await res.json()) as { response?: { assistants?: RawAssistant[]; pagination?: { total_records?: number } } }; // eslint-disable-line no-await-in-loop
    const list = body.response?.assistants;
    const total = body.response?.pagination?.total_records;
    if (!Array.isArray(list) || typeof total !== 'number') throw Object.assign(new Error('unexpected assistants shape'), { name: 'ContractViolation' });
    out.push(...list);
    if (out.length >= total) {
      // A list that disagrees with its own total is not an inventory.
      if (out.length !== total || new Set(out.map((a) => a.model_id)).size !== total) throw Object.assign(new Error('assistant list does not match its total'), { name: 'ContractViolation' });
      return out;
    }
    if (list.length === 0) break;
  }
  throw Object.assign(new Error('assistant list ended early'), { name: 'ContractViolation' });
}
