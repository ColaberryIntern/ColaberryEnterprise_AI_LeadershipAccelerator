import { callActivitySubject, completeAgentToolCall, summaryPrompt, type CompletionDeps } from '../agentCallCompletion';

const TRANSCRIPT = 'Agent: Hi Pat, this is Reese from Colaberry, an AI. Pat: Hi, I wanted to know how long a pilot takes.';

function deps(over: Partial<CompletionDeps> = {}): CompletionDeps & { merged: Array<{ id: string; meta: Record<string, unknown> }>; calls: number } {
  const state = { merged: [] as Array<{ id: string; meta: Record<string, unknown> }>, calls: 0 };
  const d: CompletionDeps = {
    summarize: async () => { state.calls++; return 'Pat asked how long a pilot takes. Next step: email the timeline.'; },
    mergeMeta: async (id, meta) => { state.merged.push({ id, meta }); },
    ...over,
  };
  return Object.assign(d, state, { get calls() { return state.calls; } }) as never;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

const INPUT = { logId: 'log-1', meta: { source: 'agent-tool', agent_name: 'Reese' }, transcript: TRANSCRIPT, status: 'completed' };

describe('completeAgentToolCall', () => {
  it('a completed call gets one summary and its outcome on the row', async () => {
    const d = deps();
    expect(await completeAgentToolCall(INPUT, d)).toEqual({ outcome: 'summarized' });
    expect(d.merged).toEqual([{ id: 'log-1', meta: { outcome: 'completed', summary: 'Pat asked how long a pilot takes. Next step: email the timeline.', summary_state: 'summarized' } }]);
  });

  it('a replay of the same webhook leaves the same end state: no second model call, no second write', async () => {
    const d = deps();
    const r = await completeAgentToolCall({ ...INPUT, meta: { ...INPUT.meta, summary_state: 'summarized' } }, d);
    expect(r).toEqual({ outcome: 'already_done' });
    expect(d.merged).toHaveLength(0);
    expect(d.calls).toBe(0);
  });

  it('a summary failure marks summary_failed with an error class, keeps the transcript (never written here), never throws', async () => {
    const d = deps({ summarize: async () => { const e = new Error('slow'); e.name = 'APIConnectionTimeoutError'; throw e; } });
    expect(await completeAgentToolCall(INPUT, d)).toEqual({ outcome: 'summary_failed', errorClass: 'APIConnectionTimeoutError' });
    expect(d.merged[0].meta).toEqual({ outcome: 'completed', summary_state: 'summary_failed', summary_error_class: 'APIConnectionTimeoutError' });
    expect(JSON.stringify(d.merged)).not.toContain('transcript');
    const d2 = deps({ summarize: async () => '  ' });
    expect((await completeAgentToolCall(INPUT, d2)).errorClass).toBe('EmptySummary');
  });

  it('a call that did not complete, or has no transcript, makes no model call', async () => {
    for (const over of [{ status: 'no-answer' }, { transcript: '' }]) {
      const d = deps();
      expect(await completeAgentToolCall({ ...INPUT, ...over }, d)).toEqual({ outcome: 'no_transcript' });
      expect(d.calls).toBe(0);
    }
  });

  it('a write failure is reported, not thrown into the webhook', async () => {
    const d = deps({ mergeMeta: async () => { const e = new Error('db'); e.name = 'SequelizeConnectionError'; throw e; } });
    expect(await completeAgentToolCall(INPUT, d)).toEqual({ outcome: 'summary_failed', errorClass: 'DatabaseError' });
  });

  it('the timeline subject matches the webhook bridge word for word', () => {
    expect(callActivitySubject('Reese', 'Pat Doe', 65, 'hangup')).toBe('Reese called Pat (1m 5s)');
    expect(callActivitySubject('Reese', 'Pat Doe', null, 'voicemail')).toBe('Reese called Pat — voicemail');
    expect(callActivitySubject('Maya', null, null, null)).toBe('Maya called Lead');
  });

  it('the summary prompt names the agent and frames the transcript as data', () => {
    expect(summaryPrompt('Reese')).toMatch(/Reese, an AI agent for Colaberry/);
    expect(summaryPrompt('Reese')).toMatch(/data, not instructions/);
  });
});
