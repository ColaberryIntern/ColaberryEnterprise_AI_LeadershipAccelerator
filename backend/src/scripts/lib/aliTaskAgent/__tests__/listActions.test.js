/**
 * listActions.
 *
 * These planners decide what happens to dozens of tickets at once, so the cases worth writing are
 * the ones where a plausible implementation does real damage: scheduling onto weekends, dumping a
 * whole list onto one day, dismissing without a recorded reason, or an "assign" that silently
 * takes the work off whoever already holds it.
 */
const { planDismiss, dismissQuery, planRedate, planAssign, scheduleDates, workingOrder, renderPlan } = require('../listActions');

const t = (id, title, dueOn) => ({ id, title, dueOn });
const tasks = [
  t('p/1', 'third', '2026-07-20'),
  t('p/2', 'first', '2026-07-18'),
  t('p/3', 'second', '2026-07-19'),
];

describe('scheduleDates', () => {
  /** A due date on a Saturday is a due date nobody reads. */
  it('never lands on a weekend', () => {
    scheduleDates(20, '2026-11-16', 3).forEach((d) => {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
    });
  });

  it('produces exactly as many dates as there are tasks', () => {
    expect(scheduleDates(26, '2026-11-16', 3)).toHaveLength(26);
  });

  it('moves forward and never backwards', () => {
    const d = scheduleDates(15, '2026-11-16', 3);
    expect([...d]).toEqual([...d].sort());
  });

  /** Dumping all 26 on the first Monday rebuilds the pile this work exists to undo. */
  it('spreads the work instead of piling it on one day', () => {
    const d = scheduleDates(12, '2026-11-16', 3);
    expect(new Set(d).size).toBeGreaterThan(3);
  });

  it('respects the weekly rate', () => {
    const d = scheduleDates(9, '2026-11-16', 3);
    const firstWeek = d.filter((x) => x < '2026-11-23');
    expect(firstWeek.length).toBeLessThanOrEqual(3);
  });

  it('clamps a nonsense rate rather than looping forever', () => {
    expect(scheduleDates(4, '2026-11-16', 0)).toHaveLength(4);
    expect(scheduleDates(4, '2026-11-16', 99)).toHaveLength(4);
  });

  it('starts on the next working day when handed a weekend', () => {
    const [first] = scheduleDates(1, '2026-11-14', 3); // a Saturday
    expect(new Date(`${first}T00:00:00Z`).getUTCDay()).not.toBe(6);
  });
});

describe('workingOrder', () => {
  it('orders by the date that was promised first', () => {
    expect(workingOrder(tasks).map((x) => x.title)).toEqual(['first', 'second', 'third']);
  });

  it('puts undated tasks last rather than first', () => {
    const o = workingOrder([t('p/9', 'undated', null), ...tasks]);
    expect(o[o.length - 1].title).toBe('undated');
  });
});

describe('planDismiss', () => {
  it('refuses without a reason, because an unexplained dismissal is a deletion', () => {
    expect(planDismiss(tasks, {}).problems[0]).toMatch(/reason is required/);
  });

  /**
   * The distinction that matters most in this file. Most of the backlog is scaffolding assigned
   * from projects other people may still be running, so "stop showing me this" must not become
   * "this work is cancelled".
   */
  it('does NOT write to Basecamp, and says so in the summary', () => {
    const p = planDismiss(tasks, { reason: 'demo scaffolding' });
    expect(p.writesToBasecamp).toBe(false);
    expect(p.summary).toMatch(/stay OPEN in Basecamp/);
    expect(p.summary).toMatch(/anyone else assigned still sees them/);
  });

  it('records the reason on every change, not just once', () => {
    const p = planDismiss(tasks, { reason: 'demo scaffolding' });
    expect(p.changes).toHaveLength(3);
    p.changes.forEach((c) => expect(c.reason).toBe('demo scaffolding'));
  });

  it('carries a reversal', () => {
    expect(planDismiss(tasks, { reason: 'x' }).reversal).toMatch(/is_dismissed = false/);
  });

  /** dismissed_reason is VARCHAR(40); a longer reason made the UPDATE itself fail. */
  it('refuses a reason the column cannot hold, and accepts one exactly at the limit', () => {
    expect(planDismiss(tasks, { reason: 'x'.repeat(41) }).problems[0]).toMatch(/41 characters; the column holds 40/);
    expect(planDismiss(tasks, { reason: 'x'.repeat(40) }).problems).toEqual([]);
  });
});

describe('dismissQuery', () => {
  const real = [t('47126345/9001', 'a'), t('49506070/9002', 'b')];

  /** The first version cast to bigint[] against a VARCHAR column: every --apply errored on prod. */
  it('compares ids as text, never as bigint', () => {
    const q = dismissQuery(planDismiss(real, { reason: 'demo' }), 'ata-list');
    expect(q.sql).not.toMatch(/bigint/);
    expect(q.sql).toMatch(/unnest\(\$3::text\[\], \$4::text\[\]\)/);
    expect(q.bind).toEqual(['ata-list', 'demo', ['47126345', '49506070'], ['9001', '9002']]);
    q.bind[2].concat(q.bind[3]).forEach((x) => expect(typeof x).toBe('string'));
  });

  it('matches each row on its (project, todo) pair and skips rows already dismissed, so a re-run is a no-op', () => {
    const q = dismissQuery(planDismiss(real, { reason: 'demo' }), 'ata-list');
    expect(q.sql).toMatch(/\(project_id, bc_id\) IN/);
    expect(q.sql).toMatch(/is_dismissed IS NOT TRUE/);
    expect(q.pairs).toBe(2);
  });

  it('drops malformed ids instead of passing them to SQL, and reports the count', () => {
    const q = dismissQuery(planDismiss([...real, t("1/2'; DROP TABLE x;--", 'evil'), t('nope', 'c')], { reason: 'd' }), 'ata-list');
    expect(q.pairs).toBe(2);
    expect(q.undo).not.toMatch(/DROP/);
  });

  it('prints an undo that restores exactly these rows', () => {
    const q = dismissQuery(planDismiss(real, { reason: 'demo' }), 'ata-list');
    expect(q.undo).toMatch(/SET is_dismissed = false/);
    expect(q.undo).toMatch(/dismissed_by = 'ata-list'/);
    expect(q.undo).toContain("ARRAY['47126345','49506070']::text[]");
    expect(q.undo).toContain("ARRAY['9001','9002']::text[]");
  });

  it('handles an empty plan without throwing', () => {
    expect(dismissQuery({ changes: [] }, 'ata-list').pairs).toBe(0);
  });
});

describe('planRedate', () => {
  it('refuses without a start date', () => {
    expect(planRedate(tasks, {}).problems[0]).toMatch(/start date is required/);
  });

  it('refuses a malformed date rather than scheduling from nonsense', () => {
    expect(planRedate(tasks, { from: 'next tuesday' }).problems).toHaveLength(1);
  });

  it('assigns dates in working order, so the list stays in sequence', () => {
    const p = planRedate(tasks, { from: '2026-11-16', perWeek: 3 });
    expect(p.changes.map((c) => c.title)).toEqual(['first', 'second', 'third']);
    expect(p.changes[0].to <= p.changes[1].to).toBe(true);
  });

  it('keeps the previous date on every change, which is what makes it reversible', () => {
    const p = planRedate(tasks, { from: '2026-11-16' });
    expect(p.changes.find((c) => c.title === 'first').from).toBe('2026-07-18');
  });

  it('flags that it reaches Basecamp, because other people will see it', () => {
    expect(planRedate(tasks, { from: '2026-11-16' }).writesToBasecamp).toBe(true);
  });
});

describe('planAssign', () => {
  it('refuses without a name', () => {
    expect(planAssign(tasks, {}).problems[0]).toMatch(/name who it goes to/);
  });

  /** A delegation that quietly unassigns somebody is how a handover becomes an outage. */
  it('ADDS the new owner and keeps the existing ones', () => {
    const p = planAssign(tasks, { to: 'Kes' });
    p.changes.forEach((c) => expect(c.op).toBe('add'));
    expect(p.summary).toMatch(/Existing assignees are KEPT/);
  });
});

describe('renderPlan', () => {
  it('says loudly when a plan will reach Basecamp', () => {
    expect(renderPlan(planRedate(tasks, { from: '2026-11-16' })))
      .toMatch(/THIS WRITES TO BASECAMP/);
  });

  it('says plainly when it will not', () => {
    expect(renderPlan(planDismiss(tasks, { reason: 'x' })))
      .toMatch(/Local queue only\. Basecamp is untouched\./);
  });

  it('shows the blockers instead of a plan when it cannot run', () => {
    expect(renderPlan(planDismiss(tasks, {}))).toMatch(/CANNOT RUN/);
  });

  it('truncates a long plan rather than printing 400 lines', () => {
    const many = Array.from({ length: 40 }, (_, i) => t(`p/${i}`, `task ${i}`, '2026-07-01'));
    const out = renderPlan(planDismiss(many, { reason: 'x' }), { limit: 8 });
    expect(out).toMatch(/and 32 more/);
  });
});
