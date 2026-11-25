import { performance } from 'perf_hooks';
import { parseArgs } from '../../../../scripts/voice/load';
import { capacityFrom, loadStep, noLeaks, percentile, runScenario, SCENARIOS } from '../loadRun';
import { readStamp, stampedChunk } from '../loadServer';

jest.setTimeout(30_000);

const clean = { sessions: 0, sockets: 0, models: 0, timer: false, orphanTools: 0 };

describe('VS4.1 load harness', () => {
  it('percentiles use nearest rank, and no samples is null rather than 0', () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 99)).toBe(99);
  });

  it('a stamped chunk is 160 bytes and carries its emit time', () => {
    const t = performance.now();
    const c = stampedChunk(t);
    expect(Buffer.from(c, 'base64')).toHaveLength(160);
    expect(readStamp(c)).toBe(t);
  });

  it.each(['sessions', 'sockets', 'models', 'orphanTools'] as const)('one leaked %s is a leak', (k) => {
    expect(noLeaks(clean)).toBe(true);
    expect(noLeaks({ ...clean, [k]: 1 })).toBe(false);
  });

  it('a live timer is a leak', () => { expect(noLeaks({ ...clean, timer: true })).toBe(false); });

  it('capacity stops at the first step any engine failed, even if a later one passed', () => {
    expect(capacityFrom([{ concurrency: 1, pass: true }, { concurrency: 20, pass: true }, { concurrency: 20, pass: false }, { concurrency: 50, pass: true }])).toEqual({ measured: 1, planned: 0 });
    expect(capacityFrom([{ concurrency: 1, pass: true }, { concurrency: 20, pass: true }])).toEqual({ measured: 20, planned: 10 });
  });

  it('the required steps cannot be left out', () => {
    expect(parseArgs(['--mock', '--steps', '50']).steps).toEqual([1, 5, 20, 50]);
    expect(parseArgs(['--steps', 'x,-3,9999']).steps).toEqual([1, 5, 20]);
    expect(parseArgs([]).mock).toBe(false);
  });

  it('restores the environment it borrows', async () => {
    const before = { ...process.env };
    await loadStep('conversation_relay', 1, 1);
    expect(process.env).toEqual(before);
  });

  it.each(['conversation_relay', 'openai_realtime'] as const)('%s: three synthetic calls complete and leak nothing', async (engine) => {
    const r = await loadStep(engine, 3, 2);
    expect(r.completed).toBe(3);
    expect(r.overheadMs.n).toBeGreaterThan(0);
    expect(noLeaks(r.leaks)).toBe(true);
  });

  it.each(['slow database at setup', 'hang-up during setup', 'worker restart cuts live calls'])('chaos: %s, both engines', async (name) => {
    const sc = SCENARIOS.find((s) => s.name === name)!;
    for (const engine of ['conversation_relay', 'openai_realtime'] as const) {
      const r = await runScenario(sc, engine); // eslint-disable-line no-await-in-loop -- each scenario owns process.env while it runs
      expect({ engine, pass: r.pass, detail: r.detail, leaks: r.leaks }).toMatchObject({ engine, pass: true });
    }
  });
});
