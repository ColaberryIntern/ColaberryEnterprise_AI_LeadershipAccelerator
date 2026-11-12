/**
 * pressingFive - the morning report's ranking. Every case below is a rule printed on the report.
 */
const { pickFive, pickOneMove, scoreTask, timing, daysLate, isDecision } = require('../pressingFive');

const TODAY = '2026-11-11T12:00:00Z';
const wo = (over = {}) => ({
  id: `p/${over.n || 1}`, title: 'Ship the thing', list: 'A list', dueOn: '2026-11-08',
  disposition: 'act', humanOnly: false, category: null, cat: 'platform', generated: false, ...over,
});

describe('timing', () => {
  it.each([
    [5, 50], [1, 50], [0, 45], [-2, 35], [-6, 20], [-12, 8], [-30, 0], [10, 40], [30, 25], [61, 0], [null, 0],
  ])('%s days late -> %s points', (late, pts) => expect(timing(late).pts).toBe(pts));

  it('counts days late in whole UTC days', () => {
    expect(daysLate('2026-11-08', TODAY)).toBe(3);
    expect(daysLate('2026-11-13', TODAY)).toBe(-2);
    expect(daysLate('not a date', TODAY)).toBeNull();
  });
});

describe('scoreTask', () => {
  it('disqualifies anything without time pressure, whatever else it has', () => {
    expect(scoreTask(wo({ dueOn: '2027-06-01', title: 'Approve the budget', cat: 'delivery' }), TODAY).score).toBe(0);
    expect(scoreTask(wo({ dueOn: '2026-01-01' }), TODAY).score).toBe(0); // dormant
  });

  /** The first preview called "Build the HTML CRM demo" a decision. It is not. */
  it('does not call a human_required build task a decision', () => {
    const s = scoreTask(wo({ title: 'Build the HTML CRM demo', category: 'human_required', disposition: 'ask' }), TODAY);
    expect(s.isDecision).toBe(false);
    expect(s.reasons.map((r) => r.why)).toContain('marked as needing you, not a session (human_required)');
    expect(s.score).toBe(50 + 15);
  });

  it('calls it a decision when the ticket itself frames one', () => {
    expect(isDecision(wo({ title: 'C6.14 - Approve the CEO outreach copy' }))).toBe(true);
    expect(isDecision(wo({ title: 'Ship it', owner: 'Ali' }))).toBe(true);
    expect(isDecision(wo({ title: 'FC7 - Content Picker' }))).toBe(false);
  });

  it('never counts both "decision" and "needs you"', () => {
    const s = scoreTask(wo({ title: 'Decide the vendor', humanOnly: true }), TODAY);
    expect(s.score).toBe(50 + 20);
  });

  it('gives the gate bonus for an approval-gate LIST, not for an "Approve" title', () => {
    expect(scoreTask(wo({ title: 'Approve X' }), TODAY).score).toBe(50 + 20);
    expect(scoreTask(wo({ list: 'MILESTONE APPROVALS - Ali' }), TODAY).score).toBe(50 + 15);
  });

  it('adds outside commitments and subtracts scaffolding', () => {
    expect(scoreTask(wo({ cat: 'delivery' }), TODAY).score).toBe(60);
    expect(scoreTask(wo({ generated: true }), TODAY).score).toBe(25);
  });

  it('prefers the ticket\'s own Decide-by date over the Basecamp due date', () => {
    const s = scoreTask(wo({ dueOn: '2026-12-31', decideBy: '2026-11-10' }), TODAY);
    expect(s.usedDecideBy).toBe(true);
    expect(s.late).toBe(1);
  });
});

describe('pickFive', () => {
  it('takes at most two from one list', () => {
    const orders = [1, 2, 3, 4].map((n) => wo({ n, list: 'Same' })).concat([wo({ n: 9, list: 'Other', dueOn: '2026-11-13' })]);
    const { picks } = pickFive(orders, TODAY);
    expect(picks.filter((p) => p.list === 'Same')).toHaveLength(2);
    expect(picks.map((p) => p.list)).toContain('Other');
  });

  it('takes at most three from one project, across its lists', () => {
    const orders = ['a', 'b', 'c', 'd'].flatMap((list, i) => [wo({ n: i, id: `P1/${i}`, list })])
      .concat([wo({ id: 'P2/9', list: 'elsewhere', dueOn: '2026-11-13' })]);
    const { picks } = pickFive(orders, TODAY);
    expect(picks.filter((p) => p.id.startsWith('P1/'))).toHaveLength(3);
    expect(picks.map((p) => p.id)).toContain('P2/9');
  });

  it('orders by score, then the more overdue, then id', () => {
    const { picks } = pickFive([wo({ n: 2, dueOn: '2026-11-10', list: 'a' }), wo({ n: 1, dueOn: '2026-11-05', list: 'b' })], TODAY);
    expect(picks.map((p) => p.id)).toEqual(['p/1', 'p/2']);
  });

  it('returns nothing rather than padding with unqualified tasks', () => {
    expect(pickFive([wo({ dueOn: null })], TODAY)).toEqual({ picks: [], qualified: 0 });
    expect(pickFive(null, TODAY).picks).toEqual([]);
  });
});

describe('pickOneMove', () => {
  const late = { id: 'p/1', title: 'Approve X', isDecision: true, late: 3, score: 70 };
  const pile = { key: 'Old list', total: 25, dormant: 24 };

  it('rule 1: a late decision of yours beats everything', () => {
    expect(pickOneMove({ picks: [late], lists: [pile] })).toMatchObject({ kind: 'task', rule: 1 });
  });

  it('rule 2: otherwise a list with 20+ dormant tasks', () => {
    expect(pickOneMove({ picks: [{ ...late, isDecision: false }], lists: [pile] })).toMatchObject({ kind: 'list', rule: 2 });
  });

  it('ignores a pile that is mostly live', () => {
    expect(pickOneMove({ picks: [{ ...late, isDecision: false }], lists: [{ key: 'x', total: 60, dormant: 21 }] }).rule).toBe(3);
  });

  it('rule 3: otherwise the top pick; and says so when nothing qualifies', () => {
    expect(pickOneMove({ picks: [{ ...late, isDecision: false }], lists: [] })).toMatchObject({ kind: 'task', rule: 3 });
    expect(pickOneMove({ picks: [], lists: [] })).toMatchObject({ kind: 'none' });
  });

  it('lists the alternatives it considered', () => {
    expect(pickOneMove({ picks: [late], lists: [pile] }).candidates).toHaveLength(2);
  });
});
