/**
 * pressingLists - the five most pressing LISTS, ranked from the same task scores as the five.
 */
const { pickFiveLists, scoreList, proposalFor, LIST_WEIGHTS } = require('../pressingLists');

describe('proposalFor', () => {
  const run = { key: 'run_list', label: 'Run the list unattended (100% are session work)', why: 'x' };
  /** Live render 2026-11-12: "Path to Profitability - decisions for Ram" was told to run unattended. */
  it('proposes deciding a list whose pressing tasks are mostly decisions', () => {
    const p = proposalFor({ key: 'Decisions for Ram', suggestions: [run],
      pressing: [{ isDecision: true }, { isDecision: true }, { isDecision: false }] });
    expect(p.key).toBe('decide_block');
    expect(p.label).toBe('Decide its 2 pending decisions in one sitting');
  });
  it('keeps the list suggestion when decisions are a minority', () => {
    expect(proposalFor({ key: 'Build', suggestions: [run], pressing: [{ isDecision: true }, {}, {}] })).toBe(run);
  });
  it('returns null with no suggestion and no decisions', () => {
    expect(proposalFor({ key: 'x', pressing: [] })).toBeNull();
  });
});

const task = (over = {}) => ({ id: `p1/${Math.random()}`, projectId: 'p1', listId: 'L1', list: 'List one',
  title: 'A task', score: 50, late: 3, ...over });
const summary = (over = {}) => ({ id: 'p1/L1', key: 'List one', projectId: 'p1', listId: 'L1',
  total: 4, live: 4, dormant: 0, ...over });

describe('scoreList', () => {
  it('starts at the most pressing task score', () => {
    const r = scoreList(summary(), [task({ score: 70, title: 'Lead' })]);
    expect(r.score).toBe(70);
    expect(r.reasons[0].why).toMatch(/"Lead"/);
  });

  it('adds +5 per further pressing task, capped at +20', () => {
    expect(scoreList(summary(), [task({ score: 60 }), task(), task()]).score).toBe(70);
    const many = Array.from({ length: 10 }, () => task({ score: 40 }));
    const r = scoreList(summary(), many);
    expect(r.score).toBe(40 + LIST_WEIGHTS.eachCap);
    expect(r.reasons[1].why).toMatch(/capped/);
  });

  it('adds +10 when 10 or more tasks are dormant', () => {
    expect(scoreList(summary({ dormant: 10 }), [task({ score: 50 })]).score).toBe(60);
    expect(scoreList(summary({ dormant: 9 }), [task({ score: 50 })]).score).toBe(50);
  });

  /** Boundary: a list with no pressing task is not pressing, however big its dormant pile. */
  it('scores zero with no pressing task', () => {
    expect(scoreList(summary({ dormant: 300 }), []).score).toBe(0);
  });
});

describe('pickFiveLists', () => {
  it('ranks lists by score and skips lists with nothing pressing', () => {
    const scored = [
      task({ listId: 'L1', score: 40 }),
      task({ listId: 'L2', score: 80, projectId: 'p2' }),
      task({ listId: 'L3', score: 0, projectId: 'p3' }),
    ];
    const sums = [summary(), summary({ id: 'p2/L2', key: 'Two', projectId: 'p2', listId: 'L2' }),
      summary({ id: 'p3/L3', key: 'Three', projectId: 'p3', listId: 'L3' })];
    const { picks, qualified } = pickFiveLists(scored, sums);
    expect(picks.map((p) => p.key)).toEqual(['Two', 'List one']);
    expect(qualified).toBe(2);
  });

  it('takes at most two lists from one project', () => {
    const sums = ['A', 'B', 'C'].map((k) => summary({ id: `p1/${k}`, key: k, listId: k }));
    const scored = ['A', 'B', 'C'].map((k, i) => task({ listId: k, score: 60 - i }));
    const other = summary({ id: 'p9/Z', key: 'Z', projectId: 'p9', listId: 'Z' });
    const { picks } = pickFiveLists([...scored, task({ projectId: 'p9', listId: 'Z', score: 10 })], [...sums, other]);
    expect(picks.map((p) => p.key)).toEqual(['A', 'B', 'Z']);
  });

  it('carries the pressing tasks most pressing first', () => {
    const { picks } = pickFiveLists([task({ score: 30, title: 'low' }), task({ score: 90, title: 'high' })], [summary()]);
    expect(picks[0].pressing.map((t) => t.title)).toEqual(['high', 'low']);
  });

  /** Idempotent: same input, same order, run after run. */
  it('is stable for equal scores', () => {
    const sums = ['B', 'A'].map((k) => summary({ id: `p${k}/${k}`, key: k, projectId: `p${k}`, listId: k }));
    const scored = ['B', 'A'].map((k) => task({ id: `p${k}/1`, projectId: `p${k}`, listId: k, score: 50, late: 2 }));
    const a = pickFiveLists(scored, sums).picks.map((p) => p.key);
    expect(pickFiveLists(scored.slice().reverse(), sums.slice().reverse()).picks.map((p) => p.key)).toEqual(a);
  });

  it('copes with empty and malformed input', () => {
    expect(pickFiveLists(null, null)).toEqual({ picks: [], qualified: 0 });
  });
});
