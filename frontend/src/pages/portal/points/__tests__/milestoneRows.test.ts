import { milestoneRows, milestonesHeld, summariseWeeks } from '../milestoneRows';
import type { MilestoneLens } from '../../../../services/onboardingApi';

// Farhat Beig, as measured on 2026-09-16 with D8 applied: curriculum 77/77,
// AI Support Workflow Assistant 8/8, Kashmir Craft 14/15, no certification.
const farhat: MilestoneLens = {
  rung_name: 'AI Builder II', rank: 2, next_rung_name: 'AI Builder III', at_max: false,
  curriculum: { complete: true, done: 77, total: 77, incomplete_weeks: [] },
  projects: [
    { id: 'p1', name: 'AI Support Workflow Assistant', verified: 8, total: 8, complete: true },
    { id: 'p2', name: 'Kashmir Craft AI Order Assistant', verified: 14, total: 15, complete: false },
  ],
  projects_complete: 1,
  certification: { status: 'none', reviewed_by: null },
  gaps: ['Projects verified — 1 of 3'],
};

describe('milestoneRows', () => {
  it('lists curriculum, three project slots and the certification, in that order', () => {
    const rows = milestoneRows(farhat);
    expect(rows.map((r) => r.key)).toEqual(['curriculum', 'project:p1', 'project:p2', 'project:slot3', 'certification']);
  });

  it('reads Farhat the way the dry run measured her', () => {
    const rows = milestoneRows(farhat);
    expect(rows[0]).toMatchObject({ state: 'done', detail: '77 of 77 graded cards', to: null });
    expect(rows[1]).toMatchObject({ label: 'Project 1 — AI Support Workflow Assistant', state: 'done', detail: '8 of 8 stories verified', to: null });
    expect(rows[2]).toMatchObject({ label: 'Project 2 — Kashmir Craft AI Order Assistant', state: 'progress', detail: '14 of 15 stories verified', to: '/portal/projects' });
    expect(rows[3]).toMatchObject({ label: 'Project 3', state: 'todo', detail: 'Start a build', to: '/portal/projects' });
    expect(rows[4]).toMatchObject({ state: 'todo', detail: 'Upload your certificate in Cert Prep', to: '/portal/cert-prep' });
    expect(milestonesHeld(farhat)).toBe(2);
  });

  it('puts complete projects first so the numbering matches the count', () => {
    const rows = milestoneRows({ ...farhat, projects: [farhat.projects[1], farhat.projects[0]] });
    expect(rows[1].label).toContain('AI Support Workflow Assistant');
    expect(rows[2].label).toContain('Kashmir Craft');
  });

  it('names the short weeks for an unfinished curriculum and links to the classroom', () => {
    const rows = milestoneRows({ ...farhat, curriculum: { complete: false, done: 54, total: 77, incomplete_weeks: [9, 10, 11, 12] } });
    expect(rows[0]).toMatchObject({ state: 'progress', detail: '54 of 77 graded cards · short in weeks 9–12', to: '/portal/classroom' });
  });

  it('a latched-complete curriculum reads complete even if live counts fell behind (D5)', () => {
    const rows = milestoneRows({ ...farhat, curriculum: { complete: true, done: 70, total: 77, incomplete_weeks: [3] } });
    expect(rows[0].state).toBe('done');
    expect(rows[0].detail).toBe('77 of 77 graded cards');
  });

  it('certification states: pending, rejected, approved with the reviewer named', () => {
    expect(milestoneRows({ ...farhat, certification: { status: 'pending', reviewed_by: null } })[4]).toMatchObject({ state: 'progress', detail: 'Uploaded — waiting for staff review' });
    expect(milestoneRows({ ...farhat, certification: { status: 'rejected', reviewed_by: null } })[4]).toMatchObject({ state: 'todo', to: '/portal/cert-prep' });
    expect(milestoneRows({ ...farhat, certification: { status: 'approved', reviewed_by: 'ali@colaberry.com' } })[4]).toMatchObject({ state: 'done', detail: 'Verified by ali@colaberry.com', to: null });
  });

  it('caps held milestones at four, and a fourth project never substitutes for the curriculum', () => {
    expect(milestonesHeld({ ...farhat, curriculum: { ...farhat.curriculum, complete: false }, projects_complete: 5 })).toBe(3);
    expect(milestonesHeld({ ...farhat, projects_complete: 3 })).toBe(4);
  });

  it('a brand-new student sees five todo rows and 0 of 4', () => {
    const fresh: MilestoneLens = { ...farhat, rung_name: '', rank: 0, next_rung_name: 'AI Builder I', curriculum: { complete: false, done: 0, total: 77, incomplete_weeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, projects: [], projects_complete: 0 };
    const rows = milestoneRows(fresh);
    expect(rows.every((r) => r.state === 'todo')).toBe(true);
    expect(rows[0].detail).toBe('0 of 77 graded cards · short in weeks 1–12');
    expect(milestonesHeld(fresh)).toBe(0);
  });
});

describe('summariseWeeks', () => {
  it('collapses a run, joins a pair with "and", and cuts long lists', () => {
    expect(summariseWeeks([9, 10, 11, 12])).toBe('9–12');
    expect(summariseWeeks([3, 7])).toBe('3 and 7');
    expect(summariseWeeks([2, 5, 8])).toBe('2, 5, 8');
    expect(summariseWeeks([1, 3, 5, 7, 9])).toBe('1, 3, 5…');
    expect(summariseWeeks([])).toBe('');
    expect(summariseWeeks([12, 11, 10])).toBe('10–12');
  });
});
