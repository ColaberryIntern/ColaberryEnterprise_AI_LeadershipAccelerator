/**
 * Private capture of the Synthflow configuration (VS5.1). READ ONLY: GET requests, nothing else.
 *
 * The migration must rebuild what is LIVE, so this keeps the full settings: prompts, first messages, voices,
 * timeouts, knowledge bases, actions and extraction. It is written to one private file (0600) and never to
 * the repository, a log or standard output. Credentials and people's details are redacted on the way in:
 * anything under a secret-like key, the path and query of every URL, phone numbers and email addresses.
 *
 * COVERAGE is the contract: every item the migration needs is either read from a field here or is a numbered
 * step on the manual checklist. A test fails if an item is in neither place.
 */
import { assistantKey, fetchAssistants, type RawAssistant } from './assistantInventory';

const BASE = 'https://api.synthflow.ai/v2';

export const COVERAGE: ReadonlyArray<{ item: string; from: 'captured' | 'checklist'; where: string }> = [
  { item: 'ids', from: 'captured', where: 'assistants[].key (hash) and assistants[].vendorId' },
  { item: 'direction', from: 'captured', where: 'assistants[].config.type' },
  { item: 'numbers: how many', from: 'captured', where: 'assistants[].numberCount' },
  { item: 'numbers: type, cost, ownership', from: 'checklist', where: '1' },
  { item: 'prompts', from: 'captured', where: 'assistants[].config.agent.prompt' },
  { item: 'first messages', from: 'captured', where: 'assistants[].config.agent.greeting_message' },
  { item: 'voices', from: 'captured', where: 'assistants[].config.agent.voice_id, voice_name, provider and voice settings' },
  { item: 'language, model, timezone, working hours', from: 'captured', where: 'assistants[].config.agent' },
  { item: 'knowledge base: which assistant uses which', from: 'captured', where: 'assistants[].knowledgeBase' },
  { item: 'knowledge base: contents', from: 'checklist', where: '2' },
  { item: 'custom variables', from: 'captured', where: 'assistants[].variables (prompt, greeting and input_variables)' },
  { item: 'tool actions: settings', from: 'captured', where: 'actions[]' },
  { item: 'tool actions: which assistant uses which', from: 'checklist', where: '3' },
  { item: 'post-call extraction: settings', from: 'captured', where: 'actions[] of type INFORMATION_EXTRACTOR and CUSTOM_EVAL' },
  { item: 'post-call extraction: which assistant uses which', from: 'checklist', where: '3' },
  { item: 'webhooks and callbacks', from: 'captured', where: 'assistants[].config.external_webhook_url, inbound_call_webhook_url (host only)' },
  { item: 'integrations and workflows', from: 'checklist', where: '5' },
  { item: 'timeouts: maximum duration, idle, ring pause, reminders, end-call reasons', from: 'captured', where: 'assistants[].config.max_duration and config.agent' },
  { item: 'voicemail', from: 'captured', where: 'assistants[].config.voicemail_message' },
  { item: 'recording and consent settings', from: 'captured', where: 'assistants[].config.is_recording, consent_recording, consent_text, agent.is_consent_enabled' },
  { item: 'concurrency', from: 'checklist', where: '6' },
  { item: 'history: how many calls', from: 'captured', where: 'assistants[].callCount' },
  { item: 'history: recordings and transcripts download', from: 'checklist', where: '4' },
  { item: 'contract and cancellation terms', from: 'checklist', where: '7' },
];

const SECRET_KEY = /secret|token|api[_-]?key|authoriz|password|passwd|credential|bearer|^headers?$|^auth$|cookie|signature/i;
const URL_RE = /https?:\/\/[^\s"'<>)\]}]+/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w.-])\+?\d?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w-])/g;
const KEYLIKE = /\b(?:sk|pk|xox[a-z]|ghp|key|Bearer)[-_ ][A-Za-z0-9_-]{12,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_.-]+/g;

const hostOnly = (u: string): string => { try { return `https://${new URL(u).hostname}/<redacted>`; } catch { return '<redacted url>'; } };

export function redactText(s: string): string {
  return s.replace(URL_RE, hostOnly).replace(KEYLIKE, '<redacted key>').replace(EMAIL, '<email>').replace(PHONE, '<phone>');
}

export function redactDeep(v: unknown, key = ''): unknown {
  if (v === null || v === undefined || typeof v === 'boolean') return v;
  if (SECRET_KEY.test(key)) return '<redacted>';
  if (key === 'api_response') return '<sample response removed>'; // a stored test reply holds a real contact
  if (/phone|caller_id/i.test(key) && (typeof v === 'string' || typeof v === 'number')) return '<phone>';
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    // a JSON body stored as text is redacted by its own keys
    if (/^\s*[[{]/.test(v)) { try { return JSON.stringify(redactDeep(JSON.parse(v))); } catch { /* not JSON: handled as text below */ } }
    return redactText(v);
  }
  if (Array.isArray(v)) {
    return v.map((x) => {
      // header and parameter lists arrive as {key|name, value}
      const o = x as Record<string, unknown> | null;
      const label = o && typeof o === 'object' ? String(o.key ?? o.name ?? '') : '';
      return label && SECRET_KEY.test(label) && o ? { ...(redactDeep({ ...o, value: undefined }) as object), value: '<redacted>' } : redactDeep(x, key);
    });
  }
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, redactDeep(x, k)]));
}

export interface Capture {
  at: string;
  counts: { assistants: number; actions: number; actionsDeclared: number; actionTypes: Record<string, number>; knowledgeBases: number; numbersListed: number };
  assistants: Array<{ key: string; vendorId: string; name: string; numberCount: number; knowledgeBase: string | null; variables: string[]; callCount: number; config: Record<string, unknown> }>;
  actions: unknown[];
  knowledgeBases: unknown[];
}

const bad = (what: string) => Object.assign(new Error(`unexpected ${what} shape`), { name: 'ContractViolation' });

export async function captureAll(apiKey: string, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<Capture> {
  const get = async (p: string): Promise<Record<string, unknown>> => {
    const res = await fetchImpl(BASE + p, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`synthflow auth ${res.status}`), { name: 'AuthError' });
    if (!res.ok) throw Object.assign(new Error(`synthflow status ${res.status}`), { name: 'UpstreamUnavailable' });
    const r = ((await res.json()) as { response?: Record<string, unknown> }).response;
    if (!r) throw bad(p.split('?')[0]);
    return r;
  };
  const total = (r: Record<string, unknown>, what: string): number => {
    const n = (r.pagination as { total_records?: unknown } | undefined)?.total_records ?? r.total_records;
    if (typeof n !== 'number') throw bad(what);
    return n;
  };
  const raw: RawAssistant[] = await fetchAssistants(apiKey, fetchImpl);

  // The vendor declares one more action than it will list, at every page size (2026-11-25: 45 declared, 44
  // listed). Both numbers are kept, so the shortfall is a reported gap. More listed than declared is an error.
  const actions: unknown[] = [];
  const seen = new Set<string>();
  let declared = 0;
  for (let page = 0; page < 20; page++) {
    const r = await get(`/actions?limit=100&offset=${page * 100}`); // eslint-disable-line no-await-in-loop -- pages in order; the vendor rounds an offset down to a multiple of the limit
    if (!Array.isArray(r.actions)) throw bad('actions');
    if (page && !r.actions.length) break; // past the end: no actions and no total
    // past the end the vendor may repeat a page, so only ids not seen before count
    const fresh = (r.actions as Array<{ action_id?: unknown }>).filter((x) => { const id = String(x.action_id ?? ''); if (!id) throw bad('action without an id'); return !seen.has(id) && Boolean(seen.add(id)); });
    actions.push(...fresh);
    declared = total(r, 'actions');
    if (actions.length > declared) throw bad('actions total');
    if (!fresh.length || actions.length === declared) break;
    if (page === 19) throw bad('actions paging');
  }
  const kb = await get('/knowledge_base');
  if (!Array.isArray(kb.knowledge_bases) || kb.knowledge_bases.length !== total(kb, 'knowledge bases')) throw bad('knowledge bases');
  const kbName = new Map((kb.knowledge_bases as Array<{ id: string; name: string }>).map((k) => [k.id, k.name]));
  const numbersListed = total(await get('/numbers?limit=1'), 'numbers');

  const assistants: Capture['assistants'] = [];
  for (const a of raw) {
    const calls = await get(`/calls?limit=1&model_id=${encodeURIComponent(a.model_id as string)}`); // eslint-disable-line no-await-in-loop -- one at a time: be gentle with the vendor
    const text = `${a.agent?.prompt ?? ''}\n${a.agent?.greeting_message ?? ''}`;
    const inputs = (a.input_variables ?? []).map((v) => (typeof v === 'string' ? v : String((v as { name?: unknown; key?: unknown } | null)?.name ?? (v as { key?: unknown } | null)?.key ?? '')));
    assistants.push({
      key: assistantKey(a.model_id as string), vendorId: a.model_id as string, name: redactText(a.name ?? ''), numberCount: (a.attached_phone_numbers ?? []).length || (a.phone_number ? 1 : 0),
      knowledgeBase: a.knowledge_base_id ? kbName.get(a.knowledge_base_id) ?? 'not in the list' : null,
      variables: [...new Set([...(text.match(/\{[A-Za-z_]{1,40}\}/g) ?? []).map((v) => v.slice(1, -1)), ...inputs.filter(Boolean)])].sort(),
      callCount: total(calls, 'calls'), config: redactDeep(a) as Record<string, unknown>,
    });
  }
  const actionTypes: Record<string, number> = {};
  for (const a of actions) { const t = String((a as { action_type?: unknown }).action_type ?? 'unknown'); actionTypes[t] = (actionTypes[t] ?? 0) + 1; }
  return { at: now().toISOString(), counts: { assistants: assistants.length, actions: actions.length, actionsDeclared: declared, actionTypes, knowledgeBases: kb.knowledge_bases.length, numbersListed }, assistants, actions: redactDeep(actions) as unknown[], knowledgeBases: redactDeep(kb.knowledge_bases) as unknown[] };
}
