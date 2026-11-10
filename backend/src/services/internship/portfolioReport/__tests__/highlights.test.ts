import { composeInternshipPortfolio } from '../compose';
import { buildSidecar } from '../sidecar/build';
import { MAX_PER_INTERN, TOUR_STOPS } from '../sidecar/highlights';
import type { CollectedPortfolio } from '../types';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

const run = (d: CollectedPortfolio) => buildSidecar(composeInternshipPortfolio(d, { now: NOW }), { reportDate: '2026-11-09', previous: null, lastOutbound: [] });

describe('highlights: the 10 most impactful things, for the guided tour', () => {
  it('a reply owed to an intern outranks a builder going quiet, which outranks training pace', () => {
    const d = collected({
      roster: [rosterRow(), rosterRow({ enrollment_id: 'e2', name: 'Megan Doe', email: 'megan@example.com' })],
      emails: [{ email: 'megan@example.com', subject: 'Can you review my plan?', snippet: '?', received_at: daysAgo(3) }],
    });
    d.projects[0].commits = [{ sha: 'a', date: daysAgo(6), author: 'kal', message: 'x' }];
    const h = run(d).highlights;
    expect(h[0]).toEqual(expect.objectContaining({ kind: 'reply_owed', intern: 'Megan Doe', title: 'Megan is waiting on your reply', target: { anchor: 'timeline', event_key: null } }));
    expect(h.findIndex((x) => x.kind === 'stuck')).toBeLessThan(h.findIndex((x) => x.kind === 'training'));
    expect(h.map((x) => x.rank)).toEqual(h.map((_, i) => i + 1));
  });

  it('no project at day 50 is a stop that targets the card', () => {
    const h = run(collected({ roster: [rosterRow({ project: null, day: 50 })], projects: [] })).highlights;
    expect(h[0]).toEqual(expect.objectContaining({ kind: 'no_project', title: 'Kalkidan has no project on day 50', target: { anchor: 'card', event_key: null } }));
  });

  it('a build streak points at the latest verified day on the combined timeline', () => {
    const d = collected();
    d.projects[0].recently_verified = [1, 2, 3, 4, 5, 6].map((n) => ({ story_id: `S${n}`, title: `Story ${n}`, verified_at: daysAgo(n) }));
    const s = run(d);
    const streak = s.highlights.find((x) => x.kind === 'streak')!;
    expect(streak.title).toBe('Kalkidan verified 6 stories in 21 days');
    expect(streak.target.anchor).toBe('event');
    expect(streak.target.event_key).toMatch(/^e1\|\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps room for good news when the cohort is mostly problems, and says "today" for a same-day email', () => {
    const roster = Array.from({ length: 11 }, (_, i) => rosterRow({ enrollment_id: `e${i}`, name: `Intern ${String.fromCharCode(65 + i)}`, email: `i${i}@x.com`, project: null, day: 60 }));
    const builder = rosterRow({ enrollment_id: 'star', name: 'Zed Star', email: 'zed@x.com' });
    const d = collected({ roster: [...roster, builder], emails: [{ email: 'zed@x.com', subject: 'Quick question?', snippet: '?', received_at: new Date(NOW.getTime() - 3600000).toISOString() }] });
    d.projects[0].recently_verified = [1, 2, 3, 4, 5, 6].map((n) => ({ story_id: `S${n}`, title: `Story ${n}`, verified_at: daysAgo(n) }));
    const h = run(d).highlights;
    expect(h).toHaveLength(TOUR_STOPS);
    expect(h.some((x) => x.kind === 'streak')).toBe(true);
    const owed = h.find((x) => x.kind === 'reply_owed');
    if (owed) expect(owed.why).toMatch(/arrived today and has no answer yet/);
  });

  it(`never more than ${TOUR_STOPS} stops, never more than ${MAX_PER_INTERN} per intern, same order every run`, () => {
    const roster = Array.from({ length: 12 }, (_, i) => rosterRow({ enrollment_id: `e${i}`, name: `Intern ${String.fromCharCode(65 + i)}`, email: `i${i}@x.com`, project: null, day: 30 + i }));
    const a = run(collected({ roster, projects: [] })).highlights;
    expect(a).toHaveLength(TOUR_STOPS);
    const per = new Map<string, number>();
    for (const x of a) per.set(x.enrollment_id, (per.get(x.enrollment_id) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(MAX_PER_INTERN);
    expect(run(collected({ roster, projects: [] })).highlights).toEqual(a);
  });
});
