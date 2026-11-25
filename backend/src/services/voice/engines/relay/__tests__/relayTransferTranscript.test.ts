/**
 * VS3.2 on Engine A: the transcript handed to post-call (once, what the caller heard), and the
 * human transfer (end with handoffData only after the agent's sentence, never a second plain end).
 */
import { RelayConnection, type RelayDeps } from '../../conversationRelayEngine';
import type { LlmTurnResult, VoiceLlm } from '../../claudeVoiceLlm';
import { ToolBroker, nextOpenSlotsTool } from '../../toolBroker';
import { TEST_PROFILE } from '../../voiceProfiles';
import { SessionWorker } from '../../../session/sessionWorker';
import { correlationKey, mintToken } from '../../../twilio/correlationToken';
import { transferToHumanTool } from '../../../transfer/transferTool';
import { TRANSFER_REASON } from '../../../transfer/humanTransfer';

const ACCOUNT = 'AC' + 'c9'.repeat(16);
const SID = 'CA' + 'd1'.repeat(16);
const CALL = '1c2d3e4f-5061-4728-899a-bbccddeeff00';
const TUESDAY_10_CT = new Date('2026-12-01T16:00:00Z');
const SUNDAY_10_CT = new Date('2026-11-29T16:00:00Z');

type Step = { say?: string[]; tool?: { id: string; name: string } };
function llmOf(steps: Step[]): VoiceLlm {
  return {
    async streamTurn({ onText }): Promise<LlmTurnResult> {
      const s = steps.shift() ?? { say: ['ok.'] };
      for (const d of s.say ?? []) onText(d);
      const text = (s.say ?? []).join('');
      if (s.tool) {
        return { ok: true, stopReason: 'tool_use', text, toolCalls: [{ id: s.tool.id, name: s.tool.name, input: {} }],
          assistantContent: [...(text ? [{ type: 'text' as const, text }] : []), { type: 'tool_use' as const, id: s.tool.id, name: s.tool.name, input: {} }] };
      }
      return { ok: true, stopReason: 'end_turn', text, toolCalls: [], assistantContent: [{ type: 'text', text }] };
    },
  };
}

function harness(steps: Step[], opts: { target?: string; now?: Date } = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const transcripts: Array<[string, string]> = [];
  const logs: Record<string, unknown>[] = [];
  const worker = new SessionWorker({ now: () => 0, log: () => undefined, reconcile: async () => undefined, recordTool: () => undefined });
  const deps: RelayDeps = {
    worker, llm: llmOf(steps), profile: TEST_PROFILE,
    broker: () => new ToolBroker([
      nextOpenSlotsTool(async () => ({ timezone: 'America/Chicago', dates: [] })),
      transferToHumanTool(() => opts.target, () => opts.now ?? TUESDAY_10_CT),
    ]),
    accountSid: () => ACCOUNT,
    consumeSessionRef: async () => 'consumed',
    callMatches: async () => true,
    now: () => Date.parse('2026-11-24T20:00:00Z'),
    log: (l) => logs.push(l),
    onTranscript: (id, t) => transcripts.push([id, t]),
  };
  const conn = new RelayConnection({ send: (t) => sent.push(JSON.parse(t)), close: () => undefined }, deps);
  const ref = mintToken(CALL, 'session', 120, Date.parse('2026-11-24T20:00:00Z'), correlationKey());
  const setup = () => conn.onMessage(JSON.stringify({ type: 'setup', sessionId: 'VX1', callSid: SID, accountSid: ACCOUNT, direction: 'outbound-api', customParameters: { ref } }));
  const prompt = (voicePrompt: string) => conn.onMessage(JSON.stringify({ type: 'prompt', voicePrompt, lang: 'en-US', last: true }));
  const ends = () => sent.filter((m) => m.type === 'end');
  return { conn, sent, transcripts, logs, worker, setup, prompt, ends };
}

describe('transcript hand-off to post-call', () => {
  it('hands over greeting, caller and agent lines once, on close', async () => {
    const h = harness([{ say: ['We run ', 'a live program.'] }]);
    await h.setup();
    await h.prompt('What do you   offer?');
    h.conn.onClose();
    h.conn.onClose();
    expect(h.transcripts).toHaveLength(1);
    expect(h.transcripts[0][0]).toBe(CALL);
    expect(h.transcripts[0][1].split('\n')).toEqual([`Agent: ${TEST_PROFILE.greeting}`, 'Caller: What do you offer?', 'Agent: We run a live program.']);
  });

  it('an interruption keeps only what the caller heard', async () => {
    const h = harness([{ say: ['Our program runs for many weeks and covers a lot.'] }]);
    await h.setup();
    await h.prompt('Tell me about it');
    await h.conn.onMessage(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Our program runs', durationUntilInterruptMs: 900 }));
    h.conn.onClose();
    expect(h.transcripts[0][1].split('\n').pop()).toBe('Agent: Our program runs (interrupted)');
  });

  it('the session ending first (worker onEnd) also hands it over, still once', async () => {
    const h = harness([]);
    await h.setup();
    await h.worker.drain(1_000);
    h.conn.onClose();
    expect(h.transcripts).toHaveLength(1);
  });
});

describe('human transfer', () => {
  it('a teammate available: the agent says its sentence, THEN one end with the transfer handoff', async () => {
    const h = harness([{ tool: { id: 't1', name: 'transfer_to_human' } }, { say: ['Connecting you now.'] }], { target: '+15555550199' });
    await h.setup();
    await h.prompt('Can I talk to a person?');
    const ends = h.ends();
    expect(ends).toHaveLength(1);
    expect(JSON.parse(String(ends[0].handoffData))).toEqual({ reason: TRANSFER_REASON });
    const iSay = h.sent.findIndex((m) => m.type === 'text' && m.token === 'Connecting you now.');
    expect(iSay).toBeGreaterThan(-1);
    expect(h.sent.indexOf(ends[0])).toBeGreaterThan(iSay);
    expect(h.logs.some((l) => l.event === 'voice_relay_handoff_sent')).toBe(true);
    expect(h.worker.size).toBe(0); // the AI session is released
    expect(JSON.stringify(h.sent)).not.toContain('5555550199'); // the model and stream never see the number
  });

  it('no teammate (outside hours or no number): no handoff, the agent offers a callback', async () => {
    for (const opts of [{ target: '+15555550199', now: SUNDAY_10_CT }, { target: undefined }]) {
      const h = harness([{ tool: { id: 't2', name: 'transfer_to_human' } }, { say: ['A teammate will call you back.'] }], opts);
      await h.setup();
      await h.prompt('Can I talk to a person?');
      expect(h.ends()).toHaveLength(0);
      expect(h.worker.size).toBe(1);
    }
  });

  it('the control never reaches the model history (only content goes back as tool_result)', async () => {
    let seen = '';
    const h = harness([{ tool: { id: 't3', name: 'transfer_to_human' } }], { target: '+15555550199' });
    const orig = (h.conn as unknown as { d: RelayDeps }).d.llm.streamTurn;
    (h.conn as unknown as { d: RelayDeps }).d.llm.streamTurn = async (a) => { seen = JSON.stringify(a.messages); return orig(a); };
    await h.setup();
    await h.prompt('A person please');
    expect(seen).toContain('tool_result');
    expect(seen).not.toContain('"control"');
  });
});
