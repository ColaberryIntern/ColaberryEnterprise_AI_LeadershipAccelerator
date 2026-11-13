/**
 * flushThenClose: the pool is closed strictly AFTER the telemetry flush, and always closed even if the flush throws.
 * Also pins that the SV0 baseline script uses it (the prod bug was the script closing the pool first).
 */
import fs from 'fs';
import path from 'path';

jest.mock('../../../services/aiEventService', () => ({ flushAiEvents: jest.fn().mockResolvedValue({ pending: 0, timedOut: false }) }));

import { flushThenClose } from '../flushThenClose';

describe('flushThenClose', () => {
  it('closes only after the flush has resolved', async () => {
    const order: string[] = [];
    const flush = jest.fn(async () => { await new Promise((r) => setTimeout(r, 20)); order.push('flushed'); return { pending: 1, timedOut: false }; });
    const close = jest.fn(async () => { order.push('closed'); });
    await flushThenClose(close, flush, 1234);
    expect(order).toEqual(['flushed', 'closed']);
    expect(flush).toHaveBeenCalledWith(1234);
  });

  it('still closes when the flush throws, and logs a classified error', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    await flushThenClose(close, async () => { throw new TypeError('boom'); });
    expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'ai_event_flush_failed', error_class: 'TypeError' });
    err.mockRestore();
  });

  it('defaults to the real flushAiEvents', async () => {
    const { flushAiEvents } = jest.requireMock('../../../services/aiEventService') as { flushAiEvents: jest.Mock };
    const close = jest.fn().mockResolvedValue(undefined);
    await flushThenClose(close);
    expect(flushAiEvents).toHaveBeenCalledWith(5000);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('the SV0 baseline script flushes before closing and has no bare sequelize.close() left', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'snapshotServiceCatalogBaseline.ts'), 'utf8');
    expect(src).toMatch(/flushThenClose\(\(\) => sequelize\.close\(\)\)/);
    expect(src.replace(/flushThenClose\(\(\) => sequelize\.close\(\)\)/, '')).not.toMatch(/sequelize\.close\(\)/);
  });
});
