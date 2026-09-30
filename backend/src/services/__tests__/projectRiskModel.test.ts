import { assessPortfolio, ownerKey, RISK_LABEL, RiskInput } from '../projectRiskModel';

/**
 * These cases are the production portfolio as it stood on 2026-09-10, because the
 * model exists to survive exactly one thing: a student who holds several projects.
 * A per-project rule reads Firas — 21/27 on one build and 16/22 on another — as two
 * healthy projects and two abandoned ones needing rescue. He needs no rescue.
 */

const p = (over: Partial<RiskInput> & { project_id: string }): RiskInput => ({
  student_email: 'someone@example.com',
  student_name: 'Someone',
  tasks_total: 20,
  tasks_complete: 0,
  tasks_overdue: 0,
  already_case_study: false,
  is_active_project: true,
  ...over,
});

const state = (m: Map<string, { state: string }>, id: string) => m.get(id)!.state;

describe('assessPortfolio — the multi-project students', () => {
  it('THE RULE: a student with progress anywhere is never "not started"', () => {
    // Firas, exactly as production holds him: four projects, one empty.
    const m = assessPortfolio([
      p({ project_id: 'ledgerly-smart', tasks_total: 27, tasks_complete: 21, is_active_project: false }),
      p({ project_id: 'sifra', tasks_total: 22, tasks_complete: 16, is_active_project: true }),
      p({ project_id: 'homehub', tasks_total: 20, tasks_complete: 1, tasks_overdue: 8, is_active_project: false }),
      p({ project_id: 'ledgerly-empty', tasks_total: 27, tasks_complete: 0, is_active_project: false }),
    ]);
    expect(state(m, 'ledgerly-empty')).toBe('dormant');
    expect(state(m, 'homehub')).toBe('dormant');
    expect(state(m, 'sifra')).toBe('on_track');
    expect(state(m, 'ledgerly-smart')).toBe('on_track');
    // Nothing in this student's portfolio may reach the intervention list.
    for (const id of ['ledgerly-smart', 'sifra', 'homehub', 'ledgerly-empty']) {
      expect(state(m, id)).not.toBe('stalled');
    }
  });

  it('flags a genuinely stalled student even when nothing is overdue yet', () => {
    // Maria C Garcia: plan issued 4 Sep, 0 of 18 done, no due date reached.
    // "Not late yet" and "has not started" are different claims.
    const m = assessPortfolio([
      p({ project_id: 'happy-child', student_email: 'm@x.com', tasks_total: 18, tasks_complete: 0, tasks_overdue: 0 }),
    ]);
    expect(state(m, 'happy-child')).toBe('stalled');
    expect(m.get('happy-child')!.reason).toBe('Nothing completed yet');
  });

  it('names the overdue count when a stalled student is also late', () => {
    const m = assessPortfolio([
      p({ project_id: 'databuddy', student_email: 'a@x.com', tasks_total: 18, tasks_complete: 0, tasks_overdue: 6 }),
    ]);
    expect(state(m, 'databuddy')).toBe('stalled');
    expect(m.get('databuddy')!.reason).toContain('6 tasks are overdue');
  });

  it('reads a FINISHED side project as on track, not as abandoned', () => {
    // Quincy: CoreOps 22/28 active, Ambit 13/13 complete and not active. Ambit is
    // done, not dormant — the on-track check must run before the spare-row check.
    const m = assessPortfolio([
      p({ project_id: 'coreops', tasks_total: 28, tasks_complete: 22, is_active_project: true }),
      p({ project_id: 'ambit', tasks_total: 13, tasks_complete: 13, is_active_project: false }),
    ]);
    expect(state(m, 'ambit')).toBe('on_track');
    expect(state(m, 'coreops')).toBe('on_track');
  });

  it('calls a single-project student with overdue work "behind", not "stalled"', () => {
    const m = assessPortfolio([
      p({ project_id: 'propertypulse', tasks_total: 22, tasks_complete: 1, tasks_overdue: 8 }),
    ]);
    expect(state(m, 'propertypulse')).toBe('behind');
  });

  it('does not mark a spare row dormant when the student is stalled everywhere', () => {
    // Two projects, nothing done on either: both are the intervention, and the
    // inactive one must not be excused as "building elsewhere".
    const m = assessPortfolio([
      p({ project_id: 'a', tasks_complete: 0, is_active_project: true }),
      p({ project_id: 'b', tasks_complete: 0, is_active_project: false }),
    ]);
    expect(state(m, 'a')).toBe('stalled');
    expect(state(m, 'b')).toBe('stalled');
  });
});

describe('assessPortfolio — states and ordering', () => {
  it('drops a published case study out of the running', () => {
    const m = assessPortfolio([
      p({ project_id: 'shipped', tasks_complete: 20, already_case_study: true }),
    ]);
    expect(state(m, 'shipped')).toBe('shipped');
    expect(m.get('shipped')!.attention).toBeLessThan(0);
  });

  it('treats a project with no tasks as unplanned rather than perfect', () => {
    // 0 of 0 must not read as "nothing overdue, all done".
    const m = assessPortfolio([p({ project_id: 'empty', tasks_total: 0, tasks_complete: 0 })]);
    expect(state(m, 'empty')).toBe('no_plan');
  });

  it('orders stalled above behind above dormant, whatever the overdue counts', () => {
    // The band must win over the tie-breaker: a dormant row with 99 overdue may
    // never outrank a stalled student with none.
    const m = assessPortfolio([
      p({ project_id: 's', student_email: 's@x.com', tasks_complete: 0, tasks_overdue: 0 }),
      p({ project_id: 'b', student_email: 'b@x.com', tasks_complete: 5, tasks_overdue: 99 }),
      p({ project_id: 'd1', student_email: 'd@x.com', tasks_complete: 9, is_active_project: true }),
      p({ project_id: 'd2', student_email: 'd@x.com', tasks_complete: 0, tasks_overdue: 99, is_active_project: false }),
    ]);
    const a = (id: string) => m.get(id)!.attention;
    expect(a('s')).toBeGreaterThan(a('b'));
    expect(a('b')).toBeGreaterThan(a('d2'));
  });

  it('sorts the worst case first within a single band', () => {
    const m = assessPortfolio([
      p({ project_id: 'mild', student_email: '1@x.com', tasks_complete: 0, tasks_overdue: 1 }),
      p({ project_id: 'severe', student_email: '2@x.com', tasks_complete: 0, tasks_overdue: 10 }),
    ]);
    expect(m.get('severe')!.attention).toBeGreaterThan(m.get('mild')!.attention);
  });

  it('reports how many projects the student holds and their total progress', () => {
    const m = assessPortfolio([
      p({ project_id: 'x', tasks_complete: 4 }),
      p({ project_id: 'y', tasks_complete: 6, is_active_project: false }),
    ]);
    expect(m.get('x')).toMatchObject({ owner_projects: 2, owner_complete: 10 });
  });

  it('assesses every project it is given', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const m = assessPortfolio(ids.map((id) => p({ project_id: id })));
    expect([...m.keys()].sort()).toEqual(ids);
  });

  it('handles an empty portfolio', () => {
    expect(assessPortfolio([]).size).toBe(0);
  });
});

describe('ownerKey', () => {
  it('groups by email, case- and whitespace-insensitively', () => {
    expect(ownerKey(p({ project_id: '1', student_email: ' Firas@X.com ' })))
      .toBe(ownerKey(p({ project_id: '2', student_email: 'firas@x.com' })));
  });

  it('falls back to name when there is no email', () => {
    expect(ownerKey(p({ project_id: '1', student_email: null, student_name: 'Ada' })))
      .toBe(ownerKey(p({ project_id: '2', student_email: '', student_name: 'ada' })));
  });

  it('NEVER pools unowned projects into one pseudo-student', () => {
    // Pooling them would sum unrelated students' progress and could excuse a
    // genuinely stalled build as "this person is working elsewhere".
    const a = ownerKey(p({ project_id: 'a', student_email: null, student_name: null }));
    const b = ownerKey(p({ project_id: 'b', student_email: null, student_name: null }));
    expect(a).not.toBe(b);
  });

  it('keeps unowned projects independently assessable', () => {
    const m = assessPortfolio([
      p({ project_id: 'a', student_email: null, student_name: null, tasks_complete: 0, tasks_overdue: 3 }),
      p({ project_id: 'b', student_email: null, student_name: null, tasks_complete: 9 }),
    ]);
    expect(state(m, 'a')).toBe('stalled');
    expect(state(m, 'b')).toBe('on_track');
  });
});

describe('RISK_LABEL', () => {
  it('labels every state, so the UI can never render a raw key', () => {
    const m = assessPortfolio([
      p({ project_id: 'a', tasks_complete: 0 }),
      p({ project_id: 'b', tasks_total: 0 }),
      p({ project_id: 'c', tasks_complete: 3, already_case_study: true }),
    ]);
    for (const [, r] of m) expect(RISK_LABEL[r.state]).toBeTruthy();
    expect(Object.keys(RISK_LABEL).sort()).toEqual(
      ['behind', 'dormant', 'no_plan', 'on_track', 'shipped', 'stalled']
    );
  });
});
