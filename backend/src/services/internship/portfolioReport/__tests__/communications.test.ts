import { MAX_PER_INTERN, byRank, ownText, rankCommunications, scoreMessage, topCommunications } from '../sidecar/communications';
import type { Conversation } from '../types';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const ago = (d: number): string => new Date(NOW - d * 86400000).toISOString();
const KAL = { enrollmentId: 'e1', name: 'Kalkidan B', email: 'kal@example.com' };
const MIH = { enrollmentId: 'e2', name: 'Mihret T', email: 'mih@example.com' };
const msg = (over: Partial<Conversation>): Conversation => ({ from_address: 'kal@example.com', to_text: '["ali@colaberry.com"]', subject: 'Update', body: 'ok', received_at: ago(1), ...over });
const long = (n: number): string => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('communications: what makes a message insightful', () => {
  it('a blocker with a root cause and evidence outranks a one-line thanks', () => {
    const ranked = rankCommunications([
      msg({ subject: 'Thanks', body: 'Thanks!' }),
      msg({ subject: 'Unable to push: access denied on STORY-12', body: `Found the root cause: the deploy key in .github/workflows/ci.yml lacks write scope, PR #41 fails with 403. ${long(90)}` }),
    ], [KAL], NOW).get('e1')!;
    expect(ranked).toHaveLength(1);
    expect(ranked[0].subject).toMatch(/Unable to push/);
    expect(ranked[0].signals).toEqual(expect.arrayContaining(['from the intern', 'reports a blocker', 'root cause', 'story id', 'PR / commit', 'file path']));
  });

  it('automated mail never ranks', () => {
    const s = scoreMessage({ direction: 'from_ali', from: 'info@colaberry.com', subject: 'Daily nudge', text: long(300), atMs: NOW, nowMs: NOW, answered: null });
    expect(s.signals).toContain('automated');
    expect(rankCommunications([msg({ from_address: 'info@colaberry.com', to_text: 'kal@example.com', subject: 'Reminder: class', body: long(300) })], [KAL], NOW).get('e1')).toEqual([]);
  });

  it('cuts quoted history so a short reply does not inherit the thread it quotes', () => {
    expect(ownText(`Sounds good, merging now. On Mon, Nov 9, 2026 at 3:00 PM Ali wrote: ${long(400)}`)).toBe('Sounds good, merging now.');
  });

  it('their unanswered message scores higher than the same message after Ali replied', () => {
    const q = msg({ subject: 'Should we use option B for the cache?', body: `I recommend option B because the risk is lower. ${long(85)}`, received_at: ago(2) });
    const open = rankCommunications([q], [KAL], NOW).get('e1')![0];
    const answered = rankCommunications([q, msg({ from_address: 'ali@colaberry.com', to_text: 'kal@example.com', subject: 'Re: cache', body: 'Go with B.', received_at: ago(1) })], [KAL], NOW).get('e1')!.find((c) => c.direction === 'from_intern')!;
    expect(open.answered).toBe(false);
    expect(answered.answered).toBe(true);
    expect(open.score - answered.score).toBe(2);
  });

  it('Ali\'s substantive replies count, addressed by recipient', () => {
    const r = rankCommunications([msg({ from_address: 'ali@colaberry.com', to_text: '["kal@example.com","ram@colaberry.com"]', subject: 'Re: decision on the read route', body: `Decided: we expose it read-only because the privacy risk is real. ${long(120)}` })], [KAL, MIH], NOW);
    expect(r.get('e1')![0].direction).toBe('from_ali');
    expect(r.get('e2')).toEqual([]);
  });

  it('one message per subject per intern: the best of a thread', () => {
    const r = rankCommunications([
      msg({ subject: 'Bug in scheduler', body: 'short', received_at: ago(3) }),
      msg({ subject: 'Re: Bug in scheduler', body: `Found it, the error is a race in src/jobs/scheduler.ts. ${long(90)}`, received_at: ago(2) }),
    ], [KAL], NOW).get('e1')!;
    expect(r).toHaveLength(1);
    expect(r[0].excerpt).toMatch(/race/);
  });
});

describe('communications: the report-wide top 10', () => {
  it('takes the best across interns, at most MAX_PER_INTERN from any one, in a stable order', () => {
    const many = Array.from({ length: 6 }, (_, i) => msg({ subject: `Root cause found ${i}`, body: `Found the root cause, error fixed in STORY-${i}. ${long(220)}`, received_at: ago(i + 1) }));
    const one = msg({ from_address: 'mih@example.com', subject: 'Blocked on access', body: `Unable to access the repo. ${long(30)}` });
    const ranked = rankCommunications([...many, one], [KAL, MIH], NOW);
    const top = topCommunications(ranked);
    expect(top.filter((c) => c.enrollment_id === 'e1')).toHaveLength(MAX_PER_INTERN);
    expect(top.some((c) => c.enrollment_id === 'e2')).toBe(true);
    const again = topCommunications(rankCommunications([...many].reverse().concat(one), [KAL, MIH], NOW));
    expect(again).toEqual(top);
    expect([...top].sort(byRank)).toEqual(top);
  });

  it('never more than 10', () => {
    const interns = Array.from({ length: 8 }, (_, i) => ({ enrollmentId: `e${i}`, name: `N${i}`, email: `n${i}@x.com` }));
    const rows = interns.flatMap((it) => [1, 2, 3].map((k) => msg({ from_address: it.email, subject: `Question ${k}?`, body: `Should we decide on option ${k}? ${long(100)}` })));
    expect(topCommunications(rankCommunications(rows, interns, NOW))).toHaveLength(10);
  });
});
