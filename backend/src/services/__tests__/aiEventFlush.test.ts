/**
 * flushAiEvents: emitAiEvent is fired without awaiting it, so a one-shot script needs a way to wait for the rows to
 * land before it closes the pool. These pin that the flush really waits, is bounded, and never throws.
 */
const create = jest.fn();
jest.mock('../../models/AiEvent', () => ({ __esModule: true, default: { create: (...a: unknown[]) => create(...a) } }));
jest.mock('../../models/AiSystemEvent', () => ({ __esModule: true, default: {} }));
jest.mock('../../models/AiAgentActivityLog', () => ({ __esModule: true, default: {} }));
jest.mock('../alertService', () => ({ emitAlert: jest.fn() }));

import { emitAiEvent, flushAiEvents } from '../aiEventService';

const later = <T>(ms: number, v?: T): Promise<T | undefined> => new Promise((r) => setTimeout(() => r(v), ms));

let errSpy: jest.SpyInstance;
beforeEach(() => { create.mockReset(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

describe('flushAiEvents', () => {
  it('resolves at once with nothing pending, and a second call is the same no-op', async () => {
    expect(await flushAiEvents(50)).toEqual({ pending: 0, timedOut: false });
    expect(await flushAiEvents(50)).toEqual({ pending: 0, timedOut: false });
  });

  it('waits for a slow persist that the caller fired without awaiting', async () => {
    let landed = false;
    create.mockImplementation(async () => { await later(30); landed = true; });
    void emitAiEvent({ event_type: 'llm.call', outcome: 'success' });
    expect(landed).toBe(false);
    const r = await flushAiEvents(1000);
    expect(landed).toBe(true);
    expect(r).toEqual({ pending: 1, timedOut: false });
    expect(await flushAiEvents(50)).toEqual({ pending: 0, timedOut: false }); // settled persists leave the set
  });

  it('still resolves when the persist fails (the failure is logged by emitAiEvent, not thrown)', async () => {
    create.mockRejectedValue(new Error('connection manager closed'));
    void emitAiEvent({ event_type: 'llm.call', outcome: 'failure' });
    await expect(flushAiEvents(1000)).resolves.toEqual({ pending: 1, timedOut: false });
    expect(errSpy).toHaveBeenCalledWith('[emitAiEvent] Failed to persist ai_event:', 'connection manager closed');
  });

  it('is bounded: a hung insert reports timedOut instead of hanging the caller', async () => {
    let release: () => void = () => undefined;
    create.mockImplementation(() => new Promise<void>((r) => { release = r; }));
    void emitAiEvent({ event_type: 'llm.call', outcome: 'success' });
    const r = await flushAiEvents(20);
    expect(r).toEqual({ pending: 1, timedOut: true });
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('ai_event_flush_timeout'))).toBe(true);
    release();
    await flushAiEvents(100);
  });
});
