import { MAX_ATTEMPTS, SWEEP_LIMIT, runAgentCommsSweep, type OpenCallRow, type SweepDeps } from '../agentCommsSweep';
import { callActivitySubject } from '../tools/agentCallCompletion';

const DONE = { status: 'completed', transcript: 'Agent: hi. Pat: hello there, tell me more.', disposition: null, durationSeconds: 65, recordingUrl: null, endedReason: 'hangup' };
const row = (id: string, meta: Record<string, unknown> = {}, leadId: number | null = 42): OpenCallRow => ({ id, callId: `call-${id}`, leadId, meta: { agent_name: 'Reese', ...meta } });

function deps(rows: OpenCallRow[], over: Partial<SweepDeps> = {}): SweepDeps & { finished: string[]; completed: string[]; activities: string[]; merged: Array<{ id: string; meta: Record<string, unknown> }> } {
  const activities: string[] = [];
  const finished: string[] = [];
  const completed: string[] = [];
  const merged: Array<{ id: string; meta: Record<string, unknown> }> = [];
  return {
    finished, completed, merged, activities,
    enabled: () => true,
    open: async (limit) => rows.slice(0, limit),
    fetchCall: async () => DONE,
    isTerminal: (s) => ['completed', 'failed', 'no-answer'].includes(s),
    finish: async (r) => { if (finished.includes(r.id)) return false; finished.push(r.id); return true; },
    activity: async (r, rec) => { activities.push(callActivitySubject(String(r.meta.agent_name), 'Pat Doe', rec.durationSeconds, rec.disposition)); },
    complete: async (r) => { completed.push(r.id); },
    mergeMeta: async (id, meta) => { merged.push({ id, meta }); },
    ...over,
  };
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('runAgentCommsSweep', () => {
  it('finishes a call Synthflow has finished (status, timeline, summary)', async () => {
    const d = deps([row('a')]);
    expect(await runAgentCommsSweep(d)).toMatchObject({ checked: 1, reconciled: 1 });
    expect(d.finished).toEqual(['a']);
    expect(d.completed).toEqual(['a']);
  });

  it(`reads at most ${SWEEP_LIMIT} rows per run`, async () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(String(i)));
    const asked: number[] = [];
    const d = deps(rows, { open: async (limit) => { asked.push(limit); return rows; } });
    expect((await runAgentCommsSweep(d)).checked).toBe(SWEEP_LIMIT);
    expect(asked).toEqual([SWEEP_LIMIT]);
  });

  it(`an unreadable or still-running call is retried, then dead-lettered at attempt ${MAX_ATTEMPTS}`, async () => {
    const d1 = deps([row('a', { reconcile_attempts: 0 })], { fetchCall: async () => null });
    expect(await runAgentCommsSweep(d1)).toMatchObject({ retried: 1, deadLettered: 0 });
    expect(d1.merged[0].meta).toEqual({ reconcile_attempts: 1, reconcile_last_status: 'unreadable' });

    const d2 = deps([row('a', { reconcile_attempts: MAX_ATTEMPTS - 1 })], { fetchCall: async () => ({ ...DONE, status: 'in-progress' }) });
    expect(await runAgentCommsSweep(d2)).toMatchObject({ retried: 0, deadLettered: 1 });
    expect(d2.merged[0].meta).toEqual({ reconcile_attempts: MAX_ATTEMPTS, reconcile_state: 'dead_letter', reconcile_last_status: 'in-progress' });
    expect(d2.completed).toHaveLength(0);
  });

  it('a row the webhook finished first is not completed twice, and gets no second timeline entry (replay-safe)', async () => {
    const d = deps([row('a')], { finish: async () => false });
    await runAgentCommsSweep(d);
    expect(d.completed).toHaveLength(0);
    expect(d.activities).toHaveLength(0);
  });

  it('a call the sweep finishes gets ONE timeline entry, in the same words the webhook writes', async () => {
    const d = deps([row('a')]);
    await runAgentCommsSweep(d);
    expect(d.activities).toEqual(['Reese called Pat (1m 5s)']);
    const noLead = deps([row('b', {}, null)]);
    await runAgentCommsSweep(noLead);
    expect(noLead.activities).toHaveLength(0);
    expect(noLead.completed).toEqual(['b']);
  });

  it('a failed timeline write does not strand the row: the summary still runs, and the failure is logged', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const d = deps([row('a')], { activity: async () => { throw new Error('activities insert failed'); } });
    expect(await runAgentCommsSweep(d)).toMatchObject({ reconciled: 1, failed: 0 });
    expect(d.completed).toEqual(['a']);
    const line = err.mock.calls.map((c) => JSON.parse(String(c[0]))).find((l) => l.event === 'agent_call_activity_failed');
    expect(line).toMatchObject({ level: 'error', error_class: 'ActivityWriteError' });
  });

  it('voice off: reads nothing and burns no attempts', async () => {
    const open = jest.fn();
    expect(await runAgentCommsSweep(deps([row('a')], { enabled: () => false, open }))).toMatchObject({ checked: 0 });
    expect(open).not.toHaveBeenCalled();
  });

  it('one bad row does not stop the others; a failed select is reported, not thrown', async () => {
    let n = 0;
    const d = deps([row('a'), row('b')], { fetchCall: async () => { if (n++ === 0) throw new Error('boom'); return DONE; } });
    expect(await runAgentCommsSweep(d)).toMatchObject({ failed: 1, reconciled: 1 });
    expect(await runAgentCommsSweep(deps([], { open: async () => { throw new Error('db'); } }))).toMatchObject({ failed: 1, checked: 0 });
  });
});
