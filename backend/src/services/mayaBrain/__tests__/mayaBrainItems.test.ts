/**
 * OH1i (T3): nothing on the AI-fact or build-prompt shelf reaches a learner unless a person
 * approved it, it has not expired, a fact is sourced (CLM-nnn or a public URL), and a prompt
 * passed its test-build. These tests hand the reader rows that break each rule and assert
 * none of them comes back, even when the SQL (a stub here) returns them.
 */
import {
  approvalProblems, isServable, isPublicSourceUrl, readServableItems, approveItem, markTestBuild,
  createDraft, BrainItemError, type BrainItem, type Query,
} from '../mayaBrainItems';
import { FREE_WORD_RULE } from '../../content/bannedCopyRule';

const NOW = new Date('2026-11-18T12:00:00Z');
const FUTURE = '2026-12-18T12:00:00Z';
const PAST = '2026-11-01T12:00:00Z';

function item(over: Partial<BrainItem> = {}): BrainItem {
  return {
    id: 'a0000000-0000-4000-8000-000000000001', kind: 'ai_fact', title: 'A fact', body: 'Something true about AI.',
    source_url: null, source_label: 'CLM-014', virality: null, signal_id: null, status: 'approved',
    test_build_status: 'pending', test_build_notes: null, approved_by: 'ali@example.test',
    approved_at: '2026-11-17T12:00:00Z', expires_at: FUTURE, ...over,
  };
}

const stubQuery = (rows: any[]): Query & jest.Mock => jest.fn(async () => rows) as any;

describe('isPublicSourceUrl', () => {
  it('accepts a public https page and refuses local, private and admin addresses', () => {
    expect(isPublicSourceUrl('https://news.ycombinator.com/item?id=1')).toBe(true);
    expect(isPublicSourceUrl('http://localhost:3000/x')).toBe(false);
    expect(isPublicSourceUrl('https://192.168.1.4/x')).toBe(false);
    expect(isPublicSourceUrl('https://enterprise.colaberry.ai/admin/claims')).toBe(false);
    expect(isPublicSourceUrl('not a url')).toBe(false);
    expect(isPublicSourceUrl(null)).toBe(false);
  });
});

describe('approvalProblems', () => {
  it('lets a fact with a Claim Registry id or a public source through', () => {
    expect(approvalProblems(item({ source_label: 'Claim Registry CLM-014' }))).toEqual([]);
    expect(approvalProblems(item({ source_label: null, source_url: 'https://www.anthropic.com/news/x' }))).toEqual([]);
  });
  it('refuses an unsourced fact', () => {
    expect(approvalProblems(item({ source_label: 'our fact sheet', source_url: null }))[0]).toMatch(/Claim Registry id/);
    expect(approvalProblems(item({ source_label: 'CLM-1' }))).toHaveLength(1); // too short to be a registry id
  });
  it('refuses a build prompt that has not passed its test-build', () => {
    const p = item({ kind: 'build_prompt', source_label: null, source_url: 'https://github.com/x/y' });
    expect(approvalProblems({ ...p, test_build_status: 'pending' })[0]).toMatch(/test-build/);
    expect(approvalProblems({ ...p, test_build_status: 'failed' })).toHaveLength(1);
    expect(approvalProblems({ ...p, test_build_status: 'passed' })).toEqual([]);
  });
  it('refuses a banned word anywhere a learner could read it, including the credit line', () => {
    const word = FREE_WORD_RULE.word;
    expect(approvalProblems(item({ source_label: `CLM-014; Show HN: ${word} and private notes` })).join(' ')).toMatch(/banned word/);
    expect(isServable(item({ body: `It is ${word} to try.` }), NOW)).toBe(false);
  });
  it('refuses a retired or empty item', () => {
    expect(approvalProblems(item({ status: 'retired' })).length).toBe(1);
    expect(approvalProblems(item({ title: ' ', body: '' })).length).toBe(1);
  });
});

describe('isServable (the learner gate)', () => {
  it('serves an approved, sourced, unexpired fact', () => {
    expect(isServable(item(), NOW)).toBe(true);
    expect(isServable(item({ expires_at: null }), NOW)).toBe(true);
  });
  it.each([
    ['a draft', { status: 'draft' as const }],
    ['a retired item', { status: 'retired' as const }],
    ['an expired item', { expires_at: PAST }],
    ['an item expiring exactly now', { expires_at: NOW.toISOString() }],
    ['an unreadable expiry', { expires_at: 'never' }],
    ['an unsourced fact', { source_label: 'trust me' }],
    ['an item with no approval stamp', { approved_at: null }],
    ['an untested build prompt', { kind: 'build_prompt' as const, test_build_status: 'pending' as const, source_url: 'https://github.com/x/y' }],
    ['a failed build prompt', { kind: 'build_prompt' as const, test_build_status: 'failed' as const, source_url: 'https://github.com/x/y' }],
  ])('never serves %s', (_name, over) => {
    expect(isServable(item(over as Partial<BrainItem>), NOW)).toBe(false);
  });
  it('serves a build prompt only once it passed', () => {
    expect(isServable(item({ kind: 'build_prompt', test_build_status: 'passed', source_label: null, source_url: 'https://github.com/x/y' }), NOW)).toBe(true);
  });
});

describe('readServableItems', () => {
  it('drops every row that breaks a gate, even when the query returns it', async () => {
    const good = item({ id: 'good' });
    const q = stubQuery([good, item({ id: 'draft', status: 'draft' }), item({ id: 'old', expires_at: PAST }),
      item({ id: 'unsourced', source_label: null }), item({ id: 'other-kind', kind: 'build_prompt', test_build_status: 'passed' })]);
    const rows = await readServableItems('ai_fact', { query: q, now: NOW });
    expect(rows.map((r) => r.id)).toEqual(['good']);
    expect(q.mock.calls[0][0]).toMatch(/status = 'approved'/);
  });
  it('skips items already sent to the person', async () => {
    const rows = await readServableItems('ai_fact', { query: stubQuery([item({ id: 'a' }), item({ id: 'b' })]), now: NOW, excludeIds: ['a'] });
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });
  it('is an empty shelf when the table is missing, never an error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const q: Query = jest.fn(async () => { throw new Error('relation "maya_brain_items" does not exist'); }) as any;
    await expect(readServableItems('build_prompt', { query: q })).resolves.toEqual([]);
    warn.mockRestore();
  });
});

describe('approveItem', () => {
  it('refuses an untested build prompt and writes nothing', async () => {
    const q = stubQuery([item({ kind: 'build_prompt', status: 'draft', test_build_status: 'pending' })]);
    await expect(approveItem('x', 'ali', {}, q)).rejects.toMatchObject({ code: 'not_allowed' });
    expect(q).toHaveBeenCalledTimes(1); // the read only, no UPDATE
  });
  it('approves a sourced fact with a default 30-day expiry', async () => {
    const calls: any[] = [];
    const q: Query = (async (sql: string, rep: any) => { calls.push([sql, rep]); return [item({ status: 'draft', approved_at: null })]; }) as any;
    await approveItem('x', 'ali@example.test', { now: NOW }, q);
    const [sql, rep] = calls[1];
    expect(sql).toMatch(/SET status = 'approved'/);
    expect(rep.by).toBe('ali@example.test');
    expect((rep.exp as Date).toISOString()).toBe('2026-12-18T12:00:00.000Z');
  });
  it('lets the approver add the registry id at approval time', async () => {
    const calls: any[] = [];
    const q: Query = (async (sql: string, rep: any) => { calls.push(rep); return [item({ status: 'draft', source_label: null })]; }) as any;
    await approveItem('x', 'ali', { sourceLabel: 'CLM-007', now: NOW }, q);
    expect(calls[1].label).toBe('CLM-007');
  });
  it('refuses an expiry in the past', async () => {
    await expect(approveItem('x', 'ali', { expiresAt: new Date(PAST), now: NOW }, stubQuery([item({ status: 'draft' })])))
      .rejects.toBeInstanceOf(BrainItemError);
  });
  it('404s an unknown id', async () => {
    await expect(approveItem('x', 'ali', {}, stubQuery([]))).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('markTestBuild and createDraft', () => {
  it('only build prompts are test-built', async () => {
    await expect(markTestBuild('x', 'passed', 'ran it, it built', 'ali', stubQuery([item()]))).rejects.toMatchObject({ code: 'not_allowed' });
  });
  it('a failed test-build takes an approved prompt off the shelf in the same statement', async () => {
    const calls: string[] = [];
    const q: Query = (async (sql: string) => { calls.push(sql); return [item({ kind: 'build_prompt' })]; }) as any;
    await markTestBuild('x', 'failed', 'did not compile', 'ali', q);
    expect(calls[1]).toMatch(/WHEN :result = 'failed' AND status = 'approved' THEN 'draft'/);
  });
  it('a new item is always a draft with a pending test-build', async () => {
    const q = stubQuery([item({ status: 'draft' })]);
    await createDraft({ kind: 'build_prompt', title: 't', body: 'b', signal_id: 's' }, q);
    expect(q.mock.calls[0][0]).toMatch(/'draft', 'pending'/);
    expect(q.mock.calls[0][0]).toMatch(/ON CONFLICT \(kind, signal_id\)/);
  });
});
