import { STEPS, runEnterpriseIntakeSweep } from '../enterpriseIntakeSweep';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('runEnterpriseIntakeSweep', () => {
  it('runs every step once, in order, and a throwing step does not stop the rest', async () => {
    const order: string[] = [];
    const steps = ['a', 'b', 'c'].map((name) => ({
      name,
      run: jest.fn(async () => {
        order.push(name);
        if (name === 'b') throw Object.assign(new Error('Basecamp down'), { error_class: 'UpstreamUnavailable' });
        return { done: 1 };
      }),
    }));
    const out = await runEnterpriseIntakeSweep(steps);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(out).toEqual({ a: { done: 1 }, b: { error: 'Basecamp down' }, c: { done: 1 } });
    const errs = (console.error as jest.Mock).mock.calls.map((c) => JSON.parse(c[0]));
    expect(errs[0]).toMatchObject({ event: 'enterprise_sweep_b_failed', error_class: 'UpstreamUnavailable' });
  });

  it('never runs two sweeps at once', async () => {
    let release: () => void = () => undefined;
    const slow = [{ name: 's', run: () => new Promise<Record<string, number>>((r) => { release = () => r({}); }) }];
    const first = runEnterpriseIntakeSweep(slow);
    expect(await runEnterpriseIntakeSweep(slow)).toBeNull();
    release();
    expect(await first).toEqual({ s: {} });
    expect(await runEnterpriseIntakeSweep([{ name: 'x', run: async () => ({}) }])).toEqual({ x: {} });
  });

  it('wires the seven intake steps in order', () => {
    expect(STEPS.map((s) => s.name)).toEqual(['basecamp', 'files', 'research', 'comms', 'reminders', 'meeting_posts', 'ali_briefs']);
  });
});

describe('sweep hardening', () => {
  it('a hung step is abandoned after the timeout and the rest still run', async () => {
    const { runStepsForTest } = await import('../enterpriseIntakeSweep');
    const out = await runStepsForTest([
      { name: 'hang', run: () => new Promise<Record<string, number>>(() => undefined) },
      { name: 'next', run: async () => ({ ok: 1 }) },
    ], 20);
    expect(out.hang).toEqual({ error: 'step hang timed out after 20ms' });
    expect(out.next).toEqual({ ok: 1 });
  });

  it('logs a step that reports failures as partial, with one correlation id per run', async () => {
    (console.log as jest.Mock).mockClear();
    const { runStepsForTest } = await import('../enterpriseIntakeSweep');
    await runStepsForTest([
      { name: 'a', run: async () => ({ posted: 1, failed: 2 }) },
      { name: 'b', run: async () => ({ sent: 1 }) },
    ]);
    const lines = (console.log as jest.Mock).mock.calls.map((c) => JSON.parse(c[0]));
    expect(lines[0]).toMatchObject({ event: 'enterprise_sweep_a', outcome: 'partial' });
    expect(lines[1]).toMatchObject({ event: 'enterprise_sweep_b', outcome: 'success' });
    expect(lines[0].correlation_id).toBe(lines[1].correlation_id);
  });
});
