/**
 * morningFiveEmail - subject, plain-text part, attachment names and the Central reading day.
 */
const { centralDate, attachmentNames, subjectFor, textFor } = require('../morningFiveEmail');

const summary = {
  counts: { tasks: 515, live: 379, dormant: 136, qualified: 295, claimed: 0 },
  tourHref: 'https://enterprise.colaberry.ai/bt-k7q2xm4p/#t=TTT',
  items: [
    { rank: 1, kind: 'list', golden: true, title: '06 - Owner Decisions and Blockers', url: 'https://app.basecamp.com/l', path: 'Decisions / Ali Personal',
      when: '3d overdue', score: 90, copyHref: 'https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=AAA' },
    { rank: 2, kind: 'task', golden: false, title: 'Internal debrief', url: 'https://app.basecamp.com/t', path: 'Client delivery / MAPLOCA',
      when: '5d overdue', score: 75, copyHref: 'https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=BBB' },
  ],
};

describe('centralDate', () => {
  /** An evening build in Central is already "tomorrow" in UTC; the report must use Ali's day. */
  it('returns the Central date, not the UTC date', () => {
    expect(centralDate(new Date('2026-11-12T00:30:00Z'))).toBe('2026-11-11');
    expect(centralDate(new Date('2026-11-12T07:00:00Z'))).toBe('2026-11-12');
  });
});

describe('subjectFor', () => {
  const now = new Date('2026-11-12T18:00:00Z');
  it('names the day and the golden move, saying when it is a list', () => {
    expect(subjectFor(summary, { now })).toBe('Your ten for Thu, Nov 12: List: 06 - Owner Decisions and Blockers');
  });
  it('marks a test send', () => {
    expect(subjectFor(summary, { test: true, now })).toMatch(/^\[TEST\] Your ten/);
  });
  it('shortens a long move and copes with none', () => {
    expect(subjectFor({ items: [{ golden: true, kind: 'task', title: 'x'.repeat(200) }] }, { now }).length).toBeLessThan(110);
    expect(subjectFor({ items: [] }, { now })).toBe('Your ten for Thu, Nov 12');
  });
});

describe('textFor', () => {
  const names = attachmentNames('2026-11-12');
  it('carries the one move, the tour, and every item with both links', () => {
    const t = textFor(summary, names);
    expect(t).toContain('THE ONE MOVE: 06 - Owner Decisions and Blockers (list)');
    expect(t).toContain('https://enterprise.colaberry.ai/bt-k7q2xm4p/#t=TTT');
    expect(t).toContain('1. [LIST] [ONE MOVE] 06 - Owner Decisions and Blockers (3d overdue, impact 90)');
    expect(t).toContain('Copy for Claude Code: https://enterprise.colaberry.ai/bt-k7q2xm4p/#c=BBB');
  });
  it('names the board attachment and no PDF', () => {
    const t = textFor(summary, names);
    expect(t).toContain('backlog-navigator-2026-11-12.html');
    expect(t).not.toMatch(/\.pdf/);
    expect(names).toEqual({ board: 'backlog-navigator-2026-11-12.html' });
  });
  it('contains no em-dash, which the Mandrill preflight rejects, even from a ticket title', () => {
    const withDash = { ...summary, items: [{ ...summary.items[0], title: 'Ali — claim your systems' }] };
    expect(textFor(withDash, names)).not.toMatch(/—/);
    expect(textFor(withDash, names)).toContain('Ali - claim your systems');
  });
  it('says so when nothing qualified', () => {
    expect(textFor({ counts: {}, items: [] }, names)).toMatch(/^Nothing qualified/);
  });
});
