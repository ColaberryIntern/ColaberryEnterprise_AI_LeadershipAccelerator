import { deriveWeek3Handoff, HANDOFF_WEEK } from '../internshipWeek3Handoff';

describe('deriveWeek3Handoff', () => {
  it('returns an honest "unknown" (never "late") when the week is not set', () => {
    const h = deriveWeek3Handoff(null, null);
    expect(h.phase).toBe('unknown');
    expect(h.owner).toBe('colaberry');
    expect(h.actionable).toBe(false);
  });

  it('before Week 3, the project is upcoming and it is the intern training', () => {
    const h = deriveWeek3Handoff(1, null);
    expect(h.phase).toBe('before_week_3');
    expect(h.owner).toBe('intern');
    expect(h.project_name).toBeNull();
    expect(h.actionable).toBe(false);
    expect(h.detail).toContain('Week 1');
  });

  it('flags Week 2 as "next week"', () => {
    const h = deriveWeek3Handoff(HANDOFF_WEEK - 1, null);
    expect(h.phase).toBe('before_week_3');
    expect(h.detail).toContain('next week');
  });

  it('a project before Week 3 does not trigger the assignment phases', () => {
    // A training project existing early must not be mistaken for the Week-3 assignment.
    const h = deriveWeek3Handoff(2, { name: 'Practice build', repo_connected: true });
    expect(h.phase).toBe('before_week_3');
    expect(h.project_name).toBeNull();
  });

  it('at Week 3 with no project, it is waiting on Colaberry — not the intern', () => {
    const h = deriveWeek3Handoff(HANDOFF_WEEK, null);
    expect(h.phase).toBe('awaiting_assignment');
    expect(h.owner).toBe('colaberry');
    expect(h.actionable).toBe(false);
    expect(h.detail.toLowerCase()).toContain('on us');
  });

  it('assigned but no repo connected is access-pending, owned by Colaberry', () => {
    const h = deriveWeek3Handoff(HANDOFF_WEEK, { name: 'CoreOps AI', repo_connected: false });
    expect(h.phase).toBe('access_pending');
    expect(h.owner).toBe('colaberry');
    expect(h.project_name).toBe('CoreOps AI');
    expect(h.actionable).toBe(false);
  });

  it('assigned with repo connected is the intern turn, actionable', () => {
    const h = deriveWeek3Handoff(HANDOFF_WEEK, { name: 'CoreOps AI', repo_connected: true });
    expect(h.phase).toBe('in_progress');
    expect(h.owner).toBe('intern');
    expect(h.project_name).toBe('CoreOps AI');
    expect(h.actionable).toBe(true);
  });

  it('holds for weeks well past 3 (boundary is >=, not ==)', () => {
    const h = deriveWeek3Handoff(7, { name: 'CoreOps AI', repo_connected: true });
    expect(h.phase).toBe('in_progress');
  });
});
