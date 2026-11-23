jest.mock('../sessionGuestService', () => {
  const actual = jest.requireActual('../sessionGuestService');
  return { ...actual, verifyGuestPass: jest.fn() };
});
jest.mock('../sessionGuestStore', () => ({ findGuest: jest.fn() }));
jest.mock('../runtime/runtimeAi', () => ({ chatText: jest.fn() }));

import { verifyGuestPass, GuestError } from '../sessionGuestService';
import { findGuest } from '../sessionGuestStore';
import { chatText } from '../runtime/runtimeAi';
import { runAsGuest, sanitizeRunMessages, resetRunCounters, RUN_LIMITS } from '../liveGuestRun';

const mockVerify = verifyGuestPass as unknown as jest.Mock;
const mockFind = findGuest as unknown as jest.Mock;
const mockChat = chatText as unknown as jest.Mock;
const SID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e';
const ONE = [{ role: 'user', content: 'Make me a practice table.' }];

beforeEach(() => {
  jest.clearAllMocks();
  resetRunCounters();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockVerify.mockReturnValue('g1');
  mockFind.mockResolvedValue({ id: 'g1', name: 'Ana' });
  mockChat.mockResolvedValue({ text: '| Order | Amount |', runtime_ms: 5, cost_usd: 0.001 });
});

async function status(p: Promise<unknown>): Promise<number> {
  try { await p; return 200; } catch (e) { return e instanceof GuestError ? e.status : -1; }
}

describe('sanitizeRunMessages', () => {
  it('accepts an alternating conversation that ends with the user', () => {
    const m = sanitizeRunMessages([{ role: 'user', content: ' a ' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]);
    expect(m).toEqual([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]);
  });
  it('refuses wrong shapes rather than repairing them', () => {
    expect(sanitizeRunMessages(undefined)).toBeNull();
    expect(sanitizeRunMessages([])).toBeNull();
    expect(sanitizeRunMessages([{ role: 'assistant', content: 'x' }])).toBeNull();
    expect(sanitizeRunMessages([{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }])).toBeNull();
    expect(sanitizeRunMessages([{ role: 'system', content: 'x' }])).toBeNull();
    expect(sanitizeRunMessages([{ role: 'user', content: '   ' }])).toBeNull();
    expect(sanitizeRunMessages([{ role: 'user', content: 5 }])).toBeNull();
  });
  it('enforces the turn and length caps', () => {
    expect(sanitizeRunMessages([{ role: 'user', content: 'a'.repeat(RUN_LIMITS.chars + 1) }])).toBeNull();
    const many = Array.from({ length: RUN_LIMITS.turns + 1 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', content: 'x' }));
    expect(sanitizeRunMessages(many)).toBeNull();
  });
});

describe('runAsGuest', () => {
  it('answers a checked-in attendee', async () => {
    await expect(runAsGuest(SID, 'pass', ONE)).resolves.toEqual({ reply: '| Order | Amount |' });
    expect(mockChat).toHaveBeenCalledWith('live_class_run', expect.any(String), [{ role: 'user', content: 'Make me a practice table.' }], expect.any(String), 1200);
  });

  it('401 without a valid pass or a guest row, and never calls the model', async () => {
    mockVerify.mockReturnValueOnce(null);
    expect(await status(runAsGuest(SID, undefined, ONE))).toBe(401);
    mockFind.mockResolvedValueOnce(null);
    expect(await status(runAsGuest(SID, 'pass', ONE))).toBe(401);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('400 on a malformed conversation, and never calls the model', async () => {
    expect(await status(runAsGuest(SID, 'pass', [{ role: 'assistant', content: 'x' }]))).toBe(400);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('429 once an attendee has used their runs for the class', async () => {
    for (let k = 0; k < RUN_LIMITS.perGuest; k++) await runAsGuest(SID, 'pass', ONE);
    expect(await status(runAsGuest(SID, 'pass', ONE))).toBe(429);
    expect(mockChat).toHaveBeenCalledTimes(RUN_LIMITS.perGuest);
  });

  it('502 when the model errors or returns nothing', async () => {
    mockChat.mockRejectedValueOnce(new Error('upstream 500'));
    expect(await status(runAsGuest(SID, 'pass', ONE))).toBe(502);
    mockChat.mockResolvedValueOnce({ text: '', runtime_ms: 1, cost_usd: 0 });
    expect(await status(runAsGuest(SID, 'pass', ONE))).toBe(502);
  });

  it('504 when the model takes too long', async () => {
    jest.useFakeTimers();
    mockChat.mockReturnValueOnce(new Promise(() => undefined));
    const p = status(runAsGuest(SID, 'pass', ONE));
    await Promise.resolve(); await Promise.resolve();
    jest.advanceTimersByTime(46_000);
    expect(await p).toBe(504);
    jest.useRealTimers();
  });
});
