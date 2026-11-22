import { createWhapiProvider, redact, WHAPI_TIMEOUT_MS } from '../whapiProvider';
import {
  BadRequestError, ForbiddenError, NotConnectedError, QuotaExceededError, RateLimitedError, UnavailableError,
} from '../provider';

/** CH10.1 The Whapi adapter: requests, error classes, timeout, and the token never in a log line. */
const TOKEN = 'tok_SECRET_abc123'; // gitleaks:allow (a made-up test token, never a real credential)
type Call = { url: string; method: string; headers: Record<string, string>; body?: string; signal: AbortSignal };

function harness(answers: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const lines: string[] = [];
  const fetch = jest.fn(async (url: string, init: Omit<Call, 'url'>) => {
    calls.push({ url, ...init });
    const a = answers.shift();
    if (!a) throw new Error('no scripted answer');
    if (a instanceof Error) throw a;
    return { status: a.status, text: async () => (a.body === undefined ? '' : typeof a.body === 'string' ? a.body : JSON.stringify(a.body)) };
  });
  const provider = createWhapiProvider({ baseUrl: 'http://127.0.0.1:3299', token: TOKEN, fetch, log: (l) => lines.push(l) });
  return { provider, calls, lines, fetch };
}

it('health: sends the bearer token to the configured base URL and reads the state and number', async () => {
  const h = harness([{ status: 200, body: { status: { code: 4, text: 'AUTH' }, user: { id: '15551234567' } } }]);
  expect(await h.provider.health()).toEqual({ state: 'AUTH', number: '15551234567' });
  expect(h.calls[0].url).toBe('http://127.0.0.1:3299/health?wakeup=false');
  expect(h.calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  expect(h.calls[0].signal).toBeInstanceOf(AbortSignal);
});

it.each([
  [401, NotConnectedError, 'NotConnectedError'],
  [402, QuotaExceededError, 'QuotaExceededError'],
  [403, ForbiddenError, 'ForbiddenError'],
  [429, RateLimitedError, 'RateLimitError'],
  [500, UnavailableError, 'UpstreamUnavailable'],
  [503, UnavailableError, 'UpstreamUnavailable'],
  [400, BadRequestError, 'ContractViolation'],
  [404, BadRequestError, 'ContractViolation'],
])('HTTP %i maps to %p (error_class %s)', async (status, Klass, errorClass) => {
  const h = harness([{ status, body: { error: { message: 'nope' } } }]);
  const err = await h.provider.sendText('120363000000000001@g.us', 'hi').catch((e) => e);
  expect(err).toBeInstanceOf(Klass);
  expect(err.errorClass).toBe(errorClass);
  expect(JSON.parse(h.lines[0]).error_class).toBe(errorClass);
});

it('a timeout or network failure is UpstreamUnavailable, and the timeout is 15 seconds', async () => {
  expect(WHAPI_TIMEOUT_MS).toBe(15_000);
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const h = harness([timeout, new Error('ECONNRESET')]);
  const a = await h.provider.health().catch((e) => e);
  const b = await h.provider.health().catch((e) => e);
  expect([a.errorClass, a.message]).toEqual(['UpstreamUnavailable', 'The WhatsApp service did not answer in time.']);
  expect([b.errorClass, b.message]).toEqual(['UpstreamUnavailable', 'The WhatsApp service could not be reached.']);
});

it('the timeout really aborts a hung request', async () => {
  const fetch = jest.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_res, rej) => {
    init.signal.addEventListener('abort', () => rej(init.signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));
  const started = Date.now();
  const err = await createWhapiProvider({ baseUrl: 'http://127.0.0.1:1', token: TOKEN, fetch: fetch as never, log: () => undefined, timeoutMs: 50 }).health().catch((e) => e);
  expect([err.errorClass, err.message]).toEqual(['UpstreamUnavailable', 'The WhatsApp service did not answer in time.']);
  expect(Date.now() - started).toBeLessThan(2000);
});

it('the token never appears in any log line, even when the error body echoes it', async () => {
  const h = harness([
    { status: 200, body: { status: { text: 'AUTH' } } },
    { status: 401, body: `invalid token ${TOKEN}` },
    { status: 500, body: { echo: TOKEN } },
  ]);
  await h.provider.health();
  await h.provider.health().catch(() => undefined);
  await h.provider.listGroups(100, 0).catch(() => undefined);
  expect(h.lines).toHaveLength(3);
  for (const line of h.lines) expect(line).not.toContain(TOKEN);
  expect(h.lines[1]).toContain('<redacted>');
  expect(redact(`a ${TOKEN} b ${TOKEN}`, TOKEN)).toBe('a <redacted> b <redacted>');
});

it('sendText and sendImage post the right bodies and return the message id', async () => {
  const h = harness([{ status: 200, body: { sent: true, message: { id: 'm-1' } } }, { status: 200, body: { sent: true, message: { id: 'm-2' } } }]);
  expect(await h.provider.sendText('g@g.us', 'Hello')).toEqual({ id: 'm-1' });
  expect(await h.provider.sendImage('g@g.us', 'https://x/banner.png', 'Caption')).toEqual({ id: 'm-2' });
  expect([h.calls[0].method, h.calls[0].url.endsWith('/messages/text'), JSON.parse(h.calls[0].body!)]).toEqual(['POST', true, { to: 'g@g.us', body: 'Hello' }]);
  expect(JSON.parse(h.calls[1].body!)).toEqual({ to: 'g@g.us', media: 'https://x/banner.png', caption: 'Caption' });
});

it('a 200 without sent:true and an id is refused, never treated as delivered', async () => {
  const h = harness([{ status: 200, body: { sent: false } }, { status: 200, body: 'not json' }]);
  expect((await h.provider.sendText('g@g.us', 'x').catch((e) => e)).errorClass).toBe('ContractViolation');
  expect((await h.provider.sendText('g@g.us', 'x').catch((e) => e)).errorClass).toBe('ContractViolation');
});

it('listGroups reads groups, ranks and flags; a missing array is a contract violation', async () => {
  const h = harness([
    { status: 200, body: { groups: [{ id: '120363000000000001@g.us', name: 'Cohort A', participants: [{ id: '15551234567', rank: 'admin' }], participants_count: 12, announcements: true, suspended: false }], total: 1 } },
    { status: 200, body: { nothing: true } },
  ]);
  expect(await h.provider.listGroups(100, 0)).toEqual({ total: 1, groups: [{ id: '120363000000000001@g.us', name: 'Cohort A', participants: [{ id: '15551234567', rank: 'admin' }], participants_count: 12, announcements: true, suspended: false, terminated: false }] });
  expect(h.calls[0].url).toContain('/groups?count=100&offset=0');
  expect((await h.provider.listGroups(100, 0).catch((e) => e)).errorClass).toBe('ContractViolation');
});

it('listSentSince asks in Unix seconds and keeps only our own messages at or after the time', async () => {
  const h = harness([{ status: 200, body: { messages: [
    { id: 'a', from_me: true, timestamp: 1_800_000_100, text: { body: 'Hello' } },
    { id: 'b', from_me: true, timestamp: 1_800_000_200, image: { caption: 'Banner text' } },
    { id: 'c', from_me: false, timestamp: 1_800_000_300, text: { body: 'Someone else' } },
    { id: 'd', from_me: true, timestamp: 1_799_999_000, text: { body: 'Too early' } },
  ] } }]);
  const out = await h.provider.listSentSince('120363000000000001@g.us', 1_800_000_000.9);
  expect(h.calls[0].url).toContain('/messages/list/120363000000000001%40g.us?from_me=true&time_from=1800000000&count=500');
  expect(out).toEqual([{ id: 'a', text: 'Hello', timestamp: 1_800_000_100 }, { id: 'b', text: 'Banner text', timestamp: 1_800_000_200 }]);
});
