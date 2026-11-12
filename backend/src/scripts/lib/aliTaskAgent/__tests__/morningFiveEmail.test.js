/**
 * morningFiveEmail - subject, plain-text part, attachment names and the Central reading day.
 */
const { centralDate, attachmentNames, subjectFor, textFor } = require('../morningFiveEmail');

const summary = {
  counts: { tasks: 515, live: 379, dormant: 136, qualified: 295, claimed: 0 },
  move: { kind: 'task', title: 'Internal debrief of the Nov 5 MAPLOCA call', why: 'most pressing' },
  movePrompt: '/ata-work-task 49506070/10481592064\n\nPROMPT BODY',
  picks: [{ id: '49506070/10481592064', title: 'Internal debrief', url: 'https://app.basecamp.com/x', path: 'Client delivery / MAPLOCA / 1. RFP', late: 5, score: 75 }],
};

describe('centralDate', () => {
  /** An evening build in Central is already "tomorrow" in UTC; the report must use Ali's day. */
  it('returns the Central date, not the UTC date', () => {
    expect(centralDate(new Date('2026-11-12T00:30:00Z'))).toBe('2026-11-11');
    expect(centralDate(new Date('2026-11-12T07:00:00Z'))).toBe('2026-11-12');
  });
});

describe('subjectFor', () => {
  const now = new Date('2026-11-11T18:00:00Z');
  it('names the day and the one move', () => {
    expect(subjectFor(summary, { now })).toBe('Your five for Wed, Nov 11: Internal debrief of the Nov 5 MAPLOCA call');
  });
  it('marks a test send', () => {
    expect(subjectFor(summary, { test: true, now })).toMatch(/^\[TEST\] Your five/);
  });
  it('shortens a long move and copes with none', () => {
    expect(subjectFor({ move: { title: 'x'.repeat(200) } }, { now }).length).toBeLessThan(110);
    expect(subjectFor({ move: { title: null } }, { now })).toBe('Your five for Wed, Nov 11');
  });
});

describe('textFor', () => {
  const names = attachmentNames('2026-11-11');
  it('carries the same move, prompt and five as the HTML', () => {
    const t = textFor(summary, names);
    expect(t).toContain('THE ONE MOVE: Internal debrief of the Nov 5 MAPLOCA call');
    expect(t).toContain('PROMPT BODY');
    expect(t).toContain('1. Internal debrief (5d overdue, score 75)');
    expect(t).toContain('/ata-work-task 49506070/10481592064');
  });
  it('names both attachments', () => {
    const t = textFor(summary, names);
    expect(t).toContain('backlog-navigator-2026-11-11.html');
    expect(t).toContain('morning-five-2026-11-11.pdf');
  });
  it('contains no em-dash, which the Mandrill preflight rejects', () => {
    expect(textFor(summary, names)).not.toMatch(/—/);
  });
  it('says so when nothing qualified', () => {
    expect(textFor({ counts: {}, picks: [], move: {} }, names)).toMatch(/^Nothing qualified/);
  });
  it('carries the five lists when there are any, and omits the section when not', () => {
    const lists = [{ key: '1. RFP Response', path: 'Client delivery / MAPLOCA', score: 85, total: 12, dormant: 3, pressing: 3,
      lead: { title: 'Internal debrief' }, proposal: 'Work the 9 live', url: 'https://app.basecamp.com/l' }];
    const t = textFor({ ...summary, lists }, names);
    expect(t).toContain('THE FIVE LISTS');
    expect(t).toContain('1. 1. RFP Response (3 pressing, 12 open, 3 dormant, score 85)');
    expect(t).toContain('/ata-list "1. RFP Response"');
    expect(textFor(summary, names)).not.toContain('THE FIVE LISTS');
  });
});
