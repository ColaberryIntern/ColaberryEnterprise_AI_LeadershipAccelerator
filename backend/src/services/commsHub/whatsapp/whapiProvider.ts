import {
  BadRequestError, ForbiddenError, NotConnectedError, QuotaExceededError, RateLimitedError, UnavailableError,
  type ProviderGroup, type ProviderGroupPage, type ProviderHealth, type ProviderSentMessage, type WhatsAppProvider,
} from './provider';

/**
 * CH10.1 The Whapi.Cloud adapter (OpenAPI v1.8.7). Every call:
 *   - has a 15-second timeout (AbortSignal) and is never retried here: the worker decides (W7);
 *   - sends the token only as `Authorization: Bearer`, to the base URL config.ts allowed;
 *   - logs start/end, status and duration as one JSON line, with the token redacted from anything
 *     it prints (redact() below, asserted by the tests).
 * Whapi has no idempotency key on sends; the worker's W5 check is what prevents a duplicate.
 */
export const WHAPI_TIMEOUT_MS = 15_000;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{ status: number; text: () => Promise<string> }>;

export interface WhapiDeps { baseUrl: string; token: string; fetch?: FetchLike; now?: () => number; log?: (line: string) => void; timeoutMs?: number }

export function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join('<redacted>');
}

const asBool = (v: unknown): boolean => v === true;
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');

function toGroup(raw: unknown): ProviderGroup {
  const g = (raw ?? {}) as Record<string, unknown>;
  const id = asStr(g.id);
  if (!id) throw new BadRequestError('A group in the WhatsApp answer has no id.', 200);
  const participants = Array.isArray(g.participants)
    ? g.participants.map((p) => ({ id: asStr((p as Record<string, unknown>)?.id), rank: asStr((p as Record<string, unknown>)?.rank) || 'member' })).filter((p) => p.id)
    : [];
  const count = typeof g.participants_count === 'number' ? g.participants_count : participants.length;
  return { id, name: asStr(g.name) || id, participants, participants_count: count, announcements: asBool(g.announcements), suspended: asBool(g.suspended), terminated: asBool(g.terminated) };
}

function sentId(raw: unknown): { id: string } {
  const r = (raw ?? {}) as { sent?: unknown; message?: { id?: unknown } };
  const id = asStr(r.message?.id);
  if (r.sent !== true || !id) throw new BadRequestError('WhatsApp did not confirm the message was sent.', 200);
  return { id };
}

export function createWhapiProvider(deps: WhapiDeps): WhatsAppProvider {
  // The timeout is set per call below; it is repeated here so the default fetch is never unbounded on its own.
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(deps.timeoutMs ?? WHAPI_TIMEOUT_MS) }));
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((line: string) => console.log(line));
  const emit = (level: 'info' | 'warn', event: string, ctx: Record<string, unknown>, errorClass?: string): void => {
    log(redact(JSON.stringify({ timestamp: new Date(now()).toISOString(), level, service: 'comms_hub', event, outcome: level === 'info' ? 'success' : 'failure', ...(errorClass ? { error_class: errorClass } : {}), context: ctx }), deps.token));
  };

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    const started = now();
    const op = path.split('?')[0].replace(/\/[^/]*@[^/]*/g, '/{chat}');
    let status: number;
    let text: string;
    try {
      const res = await doFetch(deps.baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${deps.token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(deps.timeoutMs ?? WHAPI_TIMEOUT_MS),
      });
      status = res.status;
      text = await res.text();
    } catch (err) {
      const timedOut = (err as Error)?.name === 'TimeoutError' || (err as Error)?.name === 'AbortError';
      const e = new UnavailableError(timedOut ? 'The WhatsApp service did not answer in time.' : 'The WhatsApp service could not be reached.');
      emit('warn', 'comms_hub_whapi_call', { op, method, duration_ms: now() - started, reason: timedOut ? 'timeout' : 'network' }, e.errorClass);
      throw e;
    }
    const ctx = { op, method, status, duration_ms: now() - started };
    if (status >= 200 && status < 300) {
      emit('info', 'comms_hub_whapi_call', ctx);
      try { return text ? JSON.parse(text) : {}; } catch { throw new BadRequestError('The WhatsApp answer was not JSON.', status); }
    }
    const err = status === 401 ? new NotConnectedError()
      : status === 402 ? new QuotaExceededError()
        : status === 403 ? new ForbiddenError()
          : status === 429 ? new RateLimitedError()
            : status >= 500 ? new UnavailableError(undefined, status)
              : new BadRequestError(undefined, status);
    // The error body is logged (trimmed, token redacted) so a failure can be traced; it never reaches a user.
    emit('warn', 'comms_hub_whapi_call', { ...ctx, error_body: text.slice(0, 300) }, err.errorClass);
    throw err;
  }

  return {
    async health(): Promise<ProviderHealth> {
      const r = (await call('GET', '/health?wakeup=false')) as { status?: { text?: unknown }; user?: { id?: unknown; phone?: unknown } };
      const digits = (asStr(r.user?.phone) || asStr(r.user?.id)).replace(/\D/g, '');
      return { state: asStr(r.status?.text) || 'UNKNOWN', number: digits || null };
    },
    async listGroups(count, offset): Promise<ProviderGroupPage> {
      const r = (await call('GET', `/groups?count=${count}&offset=${offset}`)) as { groups?: unknown; total?: unknown };
      if (!Array.isArray(r.groups)) throw new BadRequestError('The WhatsApp group list had no groups array.', 200);
      const groups = r.groups.map(toGroup);
      return { groups, total: typeof r.total === 'number' ? r.total : offset + groups.length };
    },
    async getGroup(groupId): Promise<ProviderGroup> {
      return toGroup(await call('GET', `/groups/${encodeURIComponent(groupId)}`));
    },
    async sendText(to, body) { return sentId(await call('POST', '/messages/text', { to, body })); },
    async sendImage(to, mediaUrl, caption) { return sentId(await call('POST', '/messages/image', { to, media: mediaUrl, caption })); },
    async listSentSince(chatId, sinceUnixSeconds): Promise<ProviderSentMessage[]> {
      const since = Math.max(0, Math.floor(sinceUnixSeconds));
      const r = (await call('GET', `/messages/list/${encodeURIComponent(chatId)}?from_me=true&time_from=${since}&count=500`)) as { messages?: unknown };
      if (!Array.isArray(r.messages)) throw new BadRequestError('The WhatsApp message list had no messages array.', 200);
      return r.messages.map((raw) => {
        const m = (raw ?? {}) as { id?: unknown; from_me?: unknown; timestamp?: unknown; text?: { body?: unknown }; image?: { caption?: unknown } };
        return { id: asStr(m.id), fromMe: m.from_me === true, text: asStr(m.text?.body) || asStr(m.image?.caption) || null, timestamp: typeof m.timestamp === 'number' ? m.timestamp : 0 };
      }).filter((m) => m.id && m.fromMe && m.timestamp >= since).map(({ id, text, timestamp }) => ({ id, text, timestamp }));
    },
  };
}
