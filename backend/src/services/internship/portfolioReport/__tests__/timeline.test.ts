import { buildTimeline, classifyEmail, dayKey, rowMode, STUCK_GAP_DAYS, type TimelineInput } from '../timeline';
import type { ProjectView, TimelineEvent } from '../types';

// Noon Central on Mon 9 Nov 2026, so "N days ago at noon" lands on an unambiguous Central day.
const NOW = Date.parse('2026-11-09T18:00:00Z');
const ago = (d: number): string => new Date(NOW - d * 86400000).toISOString();

function project(over: Partial<ProjectView> = {}): ProjectView {
  return {
    name: 'Admissions', stage: 'discovery', tasksTotal: 10, tasksDone: 2, pct: 20, repoUrl: 'https://github.com/x/y', overdue: 0,
    commitsRecent: [], lastCommitDays: null, lastVerifiedDays: null, verifiedRecent: [], next: { title: 'Decision recording', dueOn: null }, overdueTasks: [], commandCenterUrl: null,
    ...over,
  };
}

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    nowMs: NOW, firstName: 'Kal', project: project(), emails: [], replies: [], activityDays: [],
    training: { weeksCompleted: 3, weeksTotal: 12, gateClear: true, gateDone: 3, strip: [], nextWeek: null, pace: null },
    awaitingReply: false,
    ...over,
  };
}

const kinds = (t: ReturnType<typeof buildTimeline>): string[][] => t.rows.map((r) => r.events.map((e) => e.kind));

describe('timeline: classifying their emails', () => {
  it('a blocker is stuck, a question is a question, the rest is an update', () => {
    expect(classifyEmail('Unable to Access My Portal - Login Loop', '')).toBe('stuck');
    expect(classifyEmail('platform.STORY-000 is not reaching my repo', '')).toBe('stuck');
    expect(classifyEmail('Higher-rung stories before the plan republish', 'Can you confirm the order?')).toBe('question');
    expect(classifyEmail('Internship project update', 'Shipped the panel today.')).toBe('update');
  });
});

describe('timeline: stuck, unstuck and the days between', () => {
  it(`marks a ${STUCK_GAP_DAYS}+ day gap with no build work as stuck, and the next build as unstuck`, () => {
    const t = buildTimeline(input({ project: project({ commitsRecent: [{ date: ago(10), message: 'a' }, { date: ago(4), message: 'b' }] }) }));
    const gapRow = t.rows.find((r) => r.gapStuck);
    expect(gapRow?.gapBefore).toBe(6);
    expect(gapRow?.events.map((e) => e.kind)).toContain('unstuck');
    expect(t.next[0]).toEqual(expect.objectContaining({ kind: 'stuck', label: 'Stuck 4d' }));
  });

  it('a build after a reported blocker is "unstuck", even without a long gap', () => {
    const t = buildTimeline(input({
      project: project({ commitsRecent: [{ date: ago(3), message: 'x' }, { date: ago(1), message: 'fix' }] }),
      emails: [{ email: 'k', subject: 'Issue accessing meetings', snippet: '', received_at: ago(2) }],
    }));
    const unstuck = t.rows.flatMap((r) => r.events).find((e) => e.kind === 'unstuck');
    expect(unstuck?.day).toBe(dayKey(ago(1)));
    expect(unstuck?.detail).toMatch(/after reporting a blocker/);
  });

  it('no build work in the whole window is called out, not hidden', () => {
    const t = buildTimeline(input());
    expect(t.next[0]).toEqual(expect.objectContaining({ kind: 'stuck', label: 'No build work in 21 days' }));
    expect(t.quietNow).toBeNull();
  });
});

describe('timeline: replies', () => {
  it('a reply carries how long the question waited, and 2+ days is flagged slow', () => {
    const t = buildTimeline(input({
      emails: [{ email: 'k', subject: 'Can you review my plan?', snippet: '', received_at: ago(5) }],
      replies: [{ email: 'k', subject: 'Re: Can you review my plan?', received_at: ago(2) }],
    }));
    const reply = t.rows.flatMap((r) => r.events).find((e) => e.kind === 'reply');
    expect(reply?.meta).toBe('after 3d');
    expect(reply?.slow).toBe(true);
  });

  it('accepts Date objects, which is what a live Sequelize query returns (prod dry run, 9 Nov)', () => {
    const asDate = (d: number): string => new Date(NOW - d * 86400000) as unknown as string;
    const t = buildTimeline(input({
      emails: [{ email: 'k', subject: 'Can you review?', snippet: '', received_at: asDate(3) }, { email: 'k', subject: 'Also?', snippet: '', received_at: asDate(3) }],
      replies: [{ email: 'k', subject: 'Re: a', received_at: asDate(1) }, { email: 'k', subject: 'Re: b', received_at: asDate(1) }],
    }));
    expect(t.rows.flatMap((r) => r.events).find((e) => e.kind === 'reply')?.meta).toBe('after 2d');
  });

  it('BCC copies of the same reply collapse to one chip', () => {
    const r = { email: 'k', subject: 'Re: Access', received_at: ago(1) };
    const t = buildTimeline(input({ replies: [r, { ...r }, { ...r }] }));
    expect(t.rows.flatMap((x) => x.events).filter((e) => e.kind === 'reply')).toHaveLength(1);
  });

  it('a reply owed is the FIRST thing in "next"', () => {
    const t = buildTimeline(input({
      awaitingReply: true,
      emails: [{ email: 'k', subject: 'Need a read route', snippet: '', received_at: ago(1) }],
      project: project({ overdueTasks: [{ title: 'Old task', due_on: dayKey(ago(9)) }] }),
    }));
    expect(t.next.map((n) => n.kind).slice(0, 2)).toEqual(['owed', 'late']);
  });
});

describe('timeline: late work', () => {
  it('a task due inside the window is marked late on its due day; the next list says how late', () => {
    const due = dayKey(ago(6));
    const t = buildTimeline(input({ project: project({ overdueTasks: [{ title: 'Legacy plan', due_on: due }] }) }));
    expect(t.rows.find((r) => r.day === due)?.events[0]).toEqual(expect.objectContaining({ kind: 'late', detail: 'Legacy plan' }));
    expect(t.next.find((n) => n.kind === 'late')?.label).toBe('Late 6d');
  });

  it('does not repeat the next story as "Up next" when it is already late', () => {
    const t = buildTimeline(input({ project: project({ next: { title: 'Legacy plan', dueOn: '2026-10-01' }, overdueTasks: [{ title: 'Legacy plan', due_on: '2026-10-01' }] }) }));
    expect(t.next.filter((n) => n.detail.startsWith('Legacy plan'))).toHaveLength(1);
  });
});

describe('timeline: chapters, not a list of dates', () => {
  it('a lone training day after a story day folds into it instead of adding a row', () => {
    const t = buildTimeline(input({
      emails: [{ email: 'k', subject: 'Can you confirm?', snippet: '', received_at: ago(3) }],
      activityDays: [{ date: dayKey(ago(2)), events: 2, by_category: { training: 2 } }],
    }));
    expect(t.rows).toHaveLength(1);
    expect(t.strip.find((s) => s.day === dayKey(ago(2)))?.kinds).toEqual(['training']);
  });

  it('says how many late tasks are not listed', () => {
    const t = buildTimeline(input({ project: project({ overdue: 10, overdueTasks: [{ title: 'A', due_on: '2026-09-22' }] }) }));
    expect(t.next.map((n) => n.label)).toContain('+9 more late');
  });

  it('consecutive routine build days merge into one span with summed commits', () => {
    const t = buildTimeline(input({
      project: project({
        commitsRecent: [{ date: ago(3), message: 'c3' }, { date: ago(2), message: 'c2' }, { date: ago(2), message: 'c2b' }, { date: ago(1), message: 'c1' }],
        verifiedRecent: [{ storyId: 'S1', title: 'One', at: ago(2) }, { storyId: 'S2', title: 'Two', at: ago(1) }],
      }),
    }));
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0].mode).toBe('build');
    const labels = t.rows[0].events.map((e) => e.label);
    expect(labels).toContain('4 commits');
    expect(labels).toContain('Verified 2');
  });

  it('a question breaks the span: story moments keep their own date', () => {
    const t = buildTimeline(input({
      project: project({ commitsRecent: [{ date: ago(3), message: 'a' }, { date: ago(1), message: 'b' }] }),
      emails: [{ email: 'k', subject: 'Can you confirm the scope?', snippet: '', received_at: ago(2) }],
    }));
    expect(t.rows.map((r) => r.mode)).toEqual(['build', 'story', 'build']);
  });

  it('row modes', () => {
    const ev = (kind: TimelineEvent['kind']): TimelineEvent => ({ kind, day: 'd', at: 'a', label: 'l' });
    expect(rowMode([ev('commit'), ev('training')])).toBe('build');
    expect(rowMode([ev('reply'), ev('update')])).toBe('talk');
    expect(rowMode([ev('reply'), ev('question')])).toBe('story');
  });

  it('a no-project intern who trains is not "nothing recorded"', () => {
    const t = buildTimeline(input({ project: null, activityDays: [
      { date: dayKey(ago(3)), events: 2, by_category: { training: 2 } },
      { date: dayKey(ago(1)), events: 1, by_category: { training: 1 } },
    ] }));
    expect(t.story).toBe('Last 21 days: training on 2 days.');
  });

  it('the story line counts and pluralizes correctly', () => {
    const t = buildTimeline(input({
      project: project({ commitsRecent: [{ date: ago(1), message: 'a' }] }),
      emails: [{ email: 'k', subject: 'Login loop, cannot sign in', snippet: '', received_at: ago(2) }],
      replies: [{ email: 'k', subject: 'Re: Login', received_at: ago(2) }],
    }));
    expect(t.story).toBe('Last 21 days: 0 verified, 1 commit; 1 ask (1 blocker), 1 reply from you; last build work 1d ago.');
  });
});
