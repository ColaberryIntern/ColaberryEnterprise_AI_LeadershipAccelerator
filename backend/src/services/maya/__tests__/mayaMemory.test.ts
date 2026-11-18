/**
 * OH1g (T1) - the one memory. Pins the merge order (newest last), de-duplication, a failing source being omitted
 * (never fatal, never invented), a person with only an enrollment, an empty person, and the prompt block.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import {
  getMayaTimeline, formatTimelineForPrompt, mayaMemoryBlock, cleanText, MEMORY_BLOCK_HEADING,
  type MayaMemoryDeps, type MemoryTurn,
} from '../mayaMemory';

const T = (iso: string) => new Date(iso);

function deps(over: Partial<MayaMemoryDeps> = {}): MayaMemoryDeps & { warnings: string[] } {
  const warnings: string[] = [];
  return {
    warnings,
    resolve: jest.fn(async () => ({ leadId: 7, enrollmentId: 'enr-1', visitorId: 'vis-1' })),
    commLogs: jest.fn(async () => [
      { id: 'c2', channel: 'email', direction: 'inbound', subject: 'Re: See you Thursday', body: '<p>Can I bring my manager?</p>', transcript: null, created_at: T('2026-11-16T15:00:00Z') },
      { id: 'c1', channel: 'email', direction: 'outbound', subject: 'See you Thursday', body: '<p>Hi Sam, looking forward to it.</p>', transcript: null, created_at: T('2026-11-15T15:00:00Z') },
      { id: 'c3', channel: 'voice', direction: 'outbound', subject: null, body: 'PROMPT TEXT', transcript: 'Maya: Hi Sam. Sam: Hi!', created_at: T('2026-11-17T15:00:00Z') },
    ]),
    chatMessages: jest.fn(async () => [
      { id: 'm1', role: 'user', content: 'What do people build?', at: T('2026-11-14T10:00:00Z') },
      { id: 'm2', role: 'assistant', content: 'Agents that run real work.', at: T('2026-11-14T10:00:05Z') },
    ]),
    roomMessages: jest.fn(async () => [
      { id: 'r1', content: 'Thanks Maya!', created_at: T('2026-11-18T01:00:00Z'), from_maya: false },
    ]),
    warn: (event: string) => { warnings.push(event); },
    ...over,
  };
}

describe('getMayaTimeline', () => {
  it('merges all three sources oldest first, newest last, with the right labels', async () => {
    const turns = await getMayaTimeline({ leadId: 7 }, {}, deps());
    expect(turns.map((t) => t.sourceId)).toEqual(['m1', 'm2', 'c1', 'c2', 'c3', 'r1']);
    expect(turns.map((t) => t.channel)).toEqual(['chat', 'chat', 'email', 'email', 'voice', 'im']);
    expect(turns[3]).toMatchObject({ direction: 'inbound', author: 'Them', text: 'Can I bring my manager?', sourceTable: 'communication_logs' });
    // a call is remembered by what was said (the transcript), not by the prompt that started it
    expect(turns[4].text).toBe('Maya: Hi Sam. Sam: Hi!');
    expect(turns[5]).toMatchObject({ direction: 'inbound', sourceTable: 'room_messages' });
  });

  it('de-duplicates the same words mirrored twice within two minutes, and the same row twice', async () => {
    const d = deps({
      chatMessages: jest.fn(async () => [
        { id: 'm1', role: 'user', content: 'Hello', at: T('2026-11-14T10:00:00Z') },
        { id: 'm1', role: 'user', content: 'Hello', at: T('2026-11-14T10:00:00Z') },
        { id: 'm9', role: 'user', content: 'Hello', at: T('2026-11-14T10:01:00Z') },
        { id: 'm10', role: 'user', content: 'Hello', at: T('2026-11-15T10:01:00Z') },
      ]),
      commLogs: jest.fn(async () => []), roomMessages: jest.fn(async () => []),
    });
    const turns = await getMayaTimeline({ leadId: 7 }, {}, d);
    expect(turns.map((t) => t.sourceId)).toEqual(['m1', 'm10']);
  });

  it('a failing source is logged and omitted; the others still arrive', async () => {
    const d = deps({ commLogs: jest.fn(async () => { throw new Error('db down'); }) });
    const turns = await getMayaTimeline({ leadId: 7 }, {}, d);
    expect(turns.map((t) => t.sourceTable)).toEqual(['chat_messages', 'chat_messages', 'room_messages']);
    expect(d.warnings).toEqual(['maya_memory.source_failed']);
  });

  it('a person with only an enrollment (no lead) reads the campus DMs and nothing keyed by lead', async () => {
    const d = deps({ resolve: jest.fn(async () => ({ leadId: null, enrollmentId: 'enr-1', visitorId: null })) });
    const turns = await getMayaTimeline({ enrollmentId: 'enr-1' }, {}, d);
    expect(d.commLogs).not.toHaveBeenCalled();
    expect(d.chatMessages).not.toHaveBeenCalled();
    expect(turns.map((t) => t.sourceId)).toEqual(['r1']);
  });

  it('an empty person (no anchor, unresolved, or resolver throws) is an empty timeline, never an error', async () => {
    const d = deps();
    expect(await getMayaTimeline({}, {}, d)).toEqual([]);
    expect(d.resolve).not.toHaveBeenCalled();
    expect(await getMayaTimeline({ leadId: 1 }, {}, deps({ resolve: jest.fn(async () => null) }))).toEqual([]);
    const thrower = deps({ resolve: jest.fn(async () => { throw new Error('x'); }) });
    expect(await getMayaTimeline({ leadId: 1 }, {}, thrower)).toEqual([]);
    expect(thrower.warnings).toEqual(['maya_memory.resolve_failed']);
  });

  it('honors excludeSourceId, excludeSources, since and limit (newest kept)', async () => {
    const d = deps();
    const a = await getMayaTimeline({ leadId: 7 }, { excludeSourceId: 'r1', excludeSources: ['chat_messages'] }, d);
    expect(a.map((t) => t.sourceId)).toEqual(['c1', 'c2', 'c3']);
    expect(d.chatMessages).not.toHaveBeenCalled();
    const b = await getMayaTimeline({ leadId: 7 }, { since: T('2026-11-16T00:00:00Z') }, deps());
    expect(b.map((t) => t.sourceId)).toEqual(['c2', 'c3', 'r1']);
    const c = await getMayaTimeline({ leadId: 7 }, { limit: 2 }, deps());
    expect(c.map((t) => t.sourceId)).toEqual(['c3', 'r1']);
  });

  it('trims every body to 600 characters', async () => {
    const d = deps({
      chatMessages: jest.fn(async () => [{ id: 'm1', role: 'user', content: 'x'.repeat(2000), at: T('2026-11-14T10:00:00Z') }]),
      commLogs: jest.fn(async () => []), roomMessages: jest.fn(async () => []),
    });
    const [t] = await getMayaTimeline({ leadId: 7 }, {}, d);
    expect(t.text.length).toBeLessThanOrEqual(600);
  });
});

describe('formatTimelineForPrompt', () => {
  const turn = (id: string, text: string, at: string, direction: 'inbound' | 'outbound' = 'inbound'): MemoryTurn => ({
    at: T(at), channel: 'email', direction, author: direction === 'inbound' ? 'Them' : 'Maya', subject: null, text,
    sourceTable: 'communication_logs', sourceId: id,
  });

  it('is empty for no turns', () => {
    expect(formatTimelineForPrompt([])).toBe('');
  });

  it('labels the block and keeps the newest turns when it must drop some', () => {
    const turns = [turn('1', 'a'.repeat(300), '2026-11-10T12:00:00Z'), turn('2', 'newest words', '2026-11-11T12:00:00Z', 'outbound')];
    const full = formatTimelineForPrompt(turns, 4000);
    expect(full.startsWith(MEMORY_BLOCK_HEADING)).toBe(true);
    expect(full).toContain('email Maya ->: newest words');
    const small = formatTimelineForPrompt(turns, 300);
    expect(small).toContain('newest words');
    expect(small).toContain('1 earlier message not shown');
  });

  it('mayaMemoryBlock never throws', async () => {
    const block = await mayaMemoryBlock({ leadId: 7 }, {}, deps({ resolve: jest.fn(async () => { throw new Error('boom'); }) }));
    expect(block).toBe('');
  });

  it('cleanText strips markup and entities', () => {
    expect(cleanText('<p>Hi&nbsp;<b>Sam</b></p><style>p{}</style>')).toBe('Hi Sam');
  });
});
