/**
 * Synthflow call history export (VS5.3). READ ONLY at the vendor: GET requests, nothing else.
 *
 * Metadata only: which call, which assistant (hash), when, how long, how it ended, and whether a transcript
 * or recording exists. Phone numbers, names, transcripts, recordings and variables never reach the result;
 * keeping those is a separate owner decision.
 *
 * Vendor behavior this relies on (checked 2026-11-25, 1,545 of 1,545 calls matched): from_date is inclusive,
 * to_date exclusive, both UTC; the offset is rounded down to a multiple of the limit; a page past the end has
 * no total; deep pages fail, so a window holding many calls is split before it is paged.
 *
 * Counted, never assumed: every window must yield exactly the calls it declares, and every assistant's
 * windows plus its calls outside the range must equal its unfiltered total. Anything short is a listed error.
 */
import { createHash } from 'crypto';
import { assistantKey, fetchAssistants } from './assistantInventory';

const BASE = 'https://api.synthflow.ai/v2';
const PAGE = 100;
const DAY = 86_400_000;
const MAX_WINDOW_CALLS = 5_000;
const ID = /^[A-Za-z0-9_-]{6,100}$/;

export interface HistoryCall { id: string; assistant: string; startedAt: string; durationSeconds: number | null; outcome: string; endReason: string | null; hasTranscript: boolean; hasRecording: boolean }
export interface HistoryError { assistant: string; from: string | null; to: string | null; errorClass: string; declared?: number; read?: number; callId?: string }
export interface HistoryExport { version: 1; from: string; until: string; assistants: Array<{ key: string; declared: number; outside: number; exported: number }>; errors: HistoryError[]; calls: HistoryCall[]; sha256: string }
export interface ExportOptions { from: string; until: string; keys?: readonly string[]; now?: Date; pause?: (ms: number) => Promise<void> }

const err = (name: string, m: string) => Object.assign(new Error(m), { name });
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const isDay = (s: string): boolean => /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(Date.parse(s)) && day(Date.parse(s)) === s;
export const exportHash = (calls: readonly HistoryCall[]): string => createHash('sha256').update(JSON.stringify(calls)).digest('hex');

const word = (v: unknown): string | null => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '').replace(/[ -]+/g, '_').slice(0, 60) || null : null);

/** One vendor record, or null when it cannot be kept (no usable id, start or outcome). */
export function toCall(raw: Record<string, unknown>, assistant: string): HistoryCall | null {
  const id = typeof raw.call_id === 'string' && ID.test(raw.call_id) ? raw.call_id : null;
  const ms = /^\d{13}$/.test(String(raw.start_time)) ? Number(raw.start_time) : NaN;
  const outcome = word(raw.call_status);
  if (!id || Number.isNaN(ms) || !outcome) return null;
  const d = String(raw.duration ?? '');
  return { id, assistant, startedAt: new Date(ms).toISOString(), durationSeconds: /^\d{1,6}$/.test(d) ? Number(d) : null, outcome, endReason: word(raw.end_call_reason), hasTranscript: Boolean(raw.transcript), hasRecording: Boolean(raw.recording_url) };
}

interface Page { calls: Array<Record<string, unknown>>; total: number | null }

function client(apiKey: string, fetchImpl: typeof fetch, pause: (ms: number) => Promise<void>) {
  const page = async (model: string, offset: number, from?: string, to?: string): Promise<Page> => {
    const q = `limit=${PAGE}&offset=${offset}&model_id=${encodeURIComponent(model)}${from ? `&from_date=${from}` : ''}${to ? `&to_date=${to}` : ''}`;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetchImpl(`${BASE}/calls?${q}`, { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) }); // eslint-disable-line no-await-in-loop -- retry
        if (res.status === 401 || res.status === 403) throw err('AuthError', `synthflow auth ${res.status}`);
        if (!res.ok) throw err('UpstreamUnavailable', `synthflow status ${res.status}`);
        const r = ((await res.json()) as { response?: { calls?: unknown; pagination?: { total_records?: unknown } } }).response; // eslint-disable-line no-await-in-loop
        if (!r || !Array.isArray(r.calls)) throw err('ContractViolation', 'unexpected calls shape');
        const n = r.pagination?.total_records;
        return { calls: r.calls as Page['calls'], total: typeof n === 'number' ? n : null };
      } catch (e) {
        const name = (e as Error).name;
        // three tries, only for a failure that may pass: a refusal or a wrong shape will not
        if (attempt >= 3 || name === 'AuthError' || name === 'ContractViolation') throw e;
        await pause(attempt * 2_000); // eslint-disable-line no-await-in-loop
      }
    }
  };
  const first = async (model: string, from?: string, to?: string): Promise<{ calls: Page['calls']; total: number }> => {
    const p = await page(model, 0, from, to);
    if (p.total === null) throw err('ContractViolation', 'no total');
    return { calls: p.calls, total: p.total };
  };
  return { page, first };
}

export async function exportHistory(apiKey: string, o: ExportOptions, fetchImpl: typeof fetch = fetch): Promise<HistoryExport> {
  const now = o.now ?? new Date();
  if (!isDay(o.from) || !isDay(o.until) || o.from >= o.until) throw err('ValidationError', 'from and until are UTC days, from before until');
  if (Date.parse(o.until) > now.getTime()) throw err('ValidationError', 'until must not be in the future: the counts would move while they are read');
  const { page, first } = client(apiKey, fetchImpl, o.pause ?? ((ms) => new Promise<void>((r) => { setTimeout(r, ms); })));

  const all = (await fetchAssistants(apiKey, fetchImpl)).map((a) => ({ model: a.model_id as string, key: assistantKey(a.model_id as string) }));
  const unknown = (o.keys ?? []).filter((k) => !all.some((a) => a.key === k));
  if (unknown.length) throw err('ValidationError', `no such assistant: ${unknown.join(', ')}`);
  const out: HistoryExport = { version: 1, from: o.from, until: o.until, assistants: [], errors: [], calls: [], sha256: '' };

  for (const a of all.filter((x) => !o.keys?.length || o.keys.includes(x.key))) {
    const seen = new Map<string, HistoryCall>();
    const rejected = new Set<string>();
    const readWindow = async (from: number, to: number): Promise<void> => {
      const where = { assistant: a.key, from: day(from), to: day(to) };
      try {
        const head = await first(a.model, where.from, where.to);
        if (head.total > MAX_WINDOW_CALLS && to - from > DAY) {
          const mid = from + Math.floor((to - from) / DAY / 2) * DAY;
          await readWindow(from, mid);
          await readWindow(mid, to);
          return;
        }
        const ids = new Set<string>();
        for (let calls = head.calls, off = 0; calls.length;) {
          for (const raw of calls) {
            const id = String(raw.call_id ?? '');
            if (ids.has(id)) continue;
            ids.add(id);
            const call = toCall(raw, a.key);
            if (call) seen.set(call.id, call);
            else { rejected.add(id); out.errors.push({ ...where, errorClass: 'ValidationError', ...(ID.test(id) ? { callId: id } : {}) }); }
          }
          off += PAGE;
          if (calls.length < PAGE || off >= head.total) break;
          calls = (await page(a.model, off, where.from, where.to)).calls; // eslint-disable-line no-await-in-loop -- pages in order
        }
        if (ids.size !== head.total) out.errors.push({ ...where, errorClass: 'CountMismatch', declared: head.total, read: ids.size });
      } catch (e) {
        if ((e as Error).name === 'AuthError') throw e;
        out.errors.push({ ...where, errorClass: (e as Error).name || 'Error' }); // listed; the totals below will not add up either
      }
    };
    try {
      let t = Date.parse(o.from);
      const end = Date.parse(o.until);
      const any = (await first(a.model)).total; // eslint-disable-line no-await-in-loop -- one assistant at a time: be gentle with the vendor
      for (; any && t < end; t += 30 * DAY) await readWindow(t, Math.min(t + 30 * DAY, end)); // eslint-disable-line no-await-in-loop
      // The vendor keeps receiving calls, so the total is read on both sides of the count of later calls and
      // the sum must fall between the two readings.
      const before = (await first(a.model, '2000-01-01', o.from)).total; // eslint-disable-line no-await-in-loop
      const low = (await first(a.model)).total; // eslint-disable-line no-await-in-loop
      const after = (await first(a.model, o.until, day(now.getTime() + 2 * DAY))).total; // eslint-disable-line no-await-in-loop
      const high = (await first(a.model)).total; // eslint-disable-line no-await-in-loop
      const accounted = seen.size + rejected.size + before + after;
      if (accounted < low || accounted > high) out.errors.push({ assistant: a.key, from: null, to: null, errorClass: 'TotalMismatch', declared: high, read: accounted });
      out.assistants.push({ key: a.key, declared: high, outside: before + after, exported: seen.size });
    } catch (e) {
      if ((e as Error).name === 'AuthError') throw e;
      out.errors.push({ assistant: a.key, from: null, to: null, errorClass: (e as Error).name || 'Error' });
    }
    for (const [id, call] of seen) {
      // one vendor call belongs to one assistant
      if (out.calls.some((x) => x.id === id && x.assistant !== call.assistant)) out.errors.push({ assistant: a.key, from: null, to: null, errorClass: 'DuplicateId', callId: id });
    }
    out.calls.push(...seen.values());
  }
  out.calls.sort((x, y) => x.startedAt.localeCompare(y.startedAt) || x.id.localeCompare(y.id));
  out.sha256 = exportHash(out.calls);
  return out;
}
