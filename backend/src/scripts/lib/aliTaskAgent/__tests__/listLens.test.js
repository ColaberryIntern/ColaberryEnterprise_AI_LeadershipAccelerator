/**
 * listLens.
 *
 * The lens exists so a decision can cover a whole list at once. That makes the dangerous failures
 * different from the per-ticket ones: proposing a bulk dismissal of hand-authored work, losing the
 * live tasks inside a mostly-dead list, or offering only the strategic mode when Ali asked to be
 * able to drop into a single ticket from the same place.
 *
 * The fixture mirrors a real list from production ("9. Ensuring Data Security", 39 tasks, every
 * one dormant, titles carrying the task-split emoji).
 */
const { byList, withSiblings, leadTask, suggestFor, sequenceOf } = require('../listLens');

const t = (over = {}) => ({
  id: '7463955/1', title: 'a task', list: '9. Ensuring Data Security', dueOn: '2026-07-19',
  daysOverdue: 115, band: 'dormant', urgency: 60, generated: true, humanOnly: false, url: null,
  ...over,
});

describe('sequenceOf', () => {
  it('reads a numbered phase', () => {
    expect(sequenceOf('9. Ensuring Data Security')).toEqual({ position: 9, name: 'Ensuring Data Security' });
  });

  it('leaves an unnumbered list alone rather than inventing a position', () => {
    expect(sequenceOf('Understanding Inputs and Outputs'))
      .toEqual({ position: null, name: 'Understanding Inputs and Outputs' });
  });

  it('survives a null list name', () => {
    expect(sequenceOf(null).name).toBe('(no list)');
  });
});

describe('leadTask', () => {
  /** A live task is the spearhead even when older dormant ones exist: it still has a deadline. */
  it('prefers the most urgent LIVE task over an older dormant one', () => {
    const lead = leadTask([
      t({ id: 'a', band: 'dormant', urgency: 99, dueOn: '2026-01-01' }),
      t({ id: 'b', band: 'overdue', urgency: 40, dueOn: '2026-11-01' }),
    ]);
    expect(lead.id).toBe('b');
  });

  it('falls back to the oldest when the whole list is dormant', () => {
    const lead = leadTask([
      t({ id: 'a', dueOn: '2026-07-19' }),
      t({ id: 'b', dueOn: '2026-06-26' }),
    ]);
    expect(lead.id).toBe('b');
  });

  it('returns null for an empty list instead of throwing', () => {
    expect(leadTask([])).toBeNull();
  });
});

describe('byList', () => {
  const tasks = [
    ...Array.from({ length: 39 }, (_, i) => t({ id: `d${i}` })),
    t({ id: 'live1', list: '3. Tracking Shipments', band: 'overdue', dueOn: '2026-11-01', daysOverdue: 10, generated: false }),
  ];

  it('groups by list and puts the biggest first', () => {
    const [first] = byList(tasks);
    expect(first.key).toBe('9. Ensuring Data Security');
    expect(first.total).toBe(39);
    expect(first.dormant).toBe(39);
  });

  it('counts the generated and human shares, which drive the proposals', () => {
    const [first] = byList(tasks);
    expect(first.generatedShare).toBe(1);
    expect(first.humanShare).toBe(0);
  });

  it('keeps every task on the card, so a decision can drill down', () => {
    const [first] = byList(tasks);
    expect(first.tasks).toHaveLength(39);
  });

  it('handles junk input without throwing', () => {
    expect(byList(null)).toEqual([]);
  });
});

describe('suggestFor', () => {
  const base = (over = {}) => ({
    key: 'L', name: 'L', total: 10, dormant: 10, live: 0,
    generatedShare: 1, humanShare: 0, lead: { id: 'x' }, ...over,
  });

  it('proposes dismissing a dormant list that is mostly generated', () => {
    const s = suggestFor(base());
    expect(s[0].key).toBe('dismiss_list');
    expect(s[0].why).toMatch(/generated shape/);
  });

  /** The important inverse: hand-authored work gets re-dated, never bulk dismissed. */
  it('proposes re-dating, NOT dismissing, when the dormant list was hand authored', () => {
    const s = suggestFor(base({ generatedShare: 0.1 }));
    expect(s.map((m) => m.key)).toContain('redate_block');
    expect(s.map((m) => m.key)).not.toContain('dismiss_list');
  });

  it('splits a mixed list into its live and dormant halves', () => {
    const s = suggestFor(base({ dormant: 6, live: 4 }));
    expect(s.map((m) => m.key)).toContain('split');
  });

  it('proposes delegation when most of the list needs a person', () => {
    const s = suggestFor(base({ humanShare: 0.8 }));
    const m = s.find((x) => x.key === 'assign_owner');
    expect(m.why).toMatch(/cannot be done by a session/);
  });

  it('proposes running it unattended when almost nothing needs a person', () => {
    expect(suggestFor(base({ humanShare: 0.05 })).map((m) => m.key)).toContain('run_list');
  });

  /** Ali asked for both modes everywhere. The trenches option is last and always present. */
  it('always offers the single-task option, on every list, as the last move', () => {
    [base(), base({ generatedShare: 0 }), base({ dormant: 2, live: 8 }), base({ humanShare: 1 })]
      .forEach((b) => {
        const s = suggestFor(b);
        expect(s[s.length - 1].key).toBe('work_lead');
      });
  });

  it('gives every move a reason and a command, so none is an unexplained instruction', () => {
    suggestFor(base()).forEach((m) => {
      expect(m.why).toBeTruthy();
      expect(m.command).toMatch(/^\/ata-/);
    });
  });
});

describe('withSiblings', () => {
  const lists = byList([
    t({ list: '1. Patient Self-Scheduling' }),
    t({ list: '2. Insurance Eligibility Verification' }),
    t({ list: '9. Ensuring Data Security' }),
    t({ list: 'Understanding Inputs and Outputs' }),
  ]);

  it('tells a numbered list where it sits in the program', () => {
    const s = withSiblings(lists).find((x) => x.position === 2);
    expect(s.phaseOf).toEqual({ position: 2, of: 9 });
    expect(s.siblings.map((o) => o.position)).toEqual([1, 9]);
  });

  it('gives an unnumbered list no phase, rather than a made-up one', () => {
    const s = withSiblings(lists).find((x) => x.key === 'Understanding Inputs and Outputs');
    expect(s.phaseOf).toBeNull();
    expect(s.siblings).toEqual([]);
  });
});

/**
 * looksGenerated.
 *
 * The first version checked the description for "Type:" plus "Done when:" and nothing else. It
 * missed 852 of 2,693 tasks on production and, worse, scored two whole lists at 0% generated -
 * which made the lens propose RE-DATING them. Re-dating dead scaffolding puts it back on the
 * calendar for three months. These cases are the real signatures, taken from live titles.
 */
describe('looksGenerated', () => {
  const { looksGenerated } = require('../listLens');

  it.each([
    ['description carries the Type/Done-when pair', { title: 'anything', description: 'Type: Handle mistakes · Done when: it works' }],
    ['[BUILD] prefix from the Build/Break/Harden split', { title: '[BUILD] 🧑 Define the required inputs', description: '' }],
    ['[BREAK] prefix', { title: '[BREAK] 🤖 Create test cases for invalid input', description: '' }],
    ['[HARDEN] prefix', { title: '[HARDEN] 🤖 Add a retry', description: '' }],
    ['the robot task-split emoji in the title', { title: '🤖 Monitor for unusual activity', description: '' }],
    ['the human task-split emoji in the title', { title: '🧑 Limit access to sensitive information', description: '' }],
  ])('catches %s', (_label, task) => {
    expect(looksGenerated(task)).toBe(true);
  });

  it.each([
    ['a hand-written ladder ticket', { title: 'C10.4 - Decide the beachhead segment', description: 'Decision owner: Ali' }],
    ['an ordinary sentence', { title: 'Send the interns the material from the 14 Oct call', description: 'Please send it.' }],
    ['a description mentioning Type: alone', { title: 'x', description: 'Type: something' }],
  ])('does not catch %s', (_label, task) => {
    expect(looksGenerated(task)).toBe(false);
  });

  it('survives missing fields instead of throwing', () => {
    expect(looksGenerated({})).toBe(false);
    expect(looksGenerated({ title: null, description: null })).toBe(false);
  });
});

describe('dominantProject', () => {
  const { dominantProject, byList: group } = require('../listLens');

  it('picks the project most of the list lives in', () => {
    expect(dominantProject([{ projectId: '1' }, { projectId: '2' }, { projectId: '2' }])).toBe('2');
  });

  it('falls back to the "<project>/<todo>" id prefix', () => {
    expect(dominantProject([{ id: '47126345/99' }])).toBe('47126345');
  });

  it('breaks a tie the same way every run', () => {
    const a = dominantProject([{ projectId: '9' }, { projectId: '10' }]);
    expect(dominantProject([{ projectId: '10' }, { projectId: '9' }])).toBe(a);
  });

  it('returns null rather than a guess when nothing carries a project', () => {
    expect(dominantProject([{ id: 'x' }, {}])).toBeNull();
  });

  it('is carried onto every list summary', () => {
    const [s] = group([{ id: '47126345/1', list: 'TMS', band: 'fresh' }]);
    expect(s.projectId).toBe('47126345');
  });
});
