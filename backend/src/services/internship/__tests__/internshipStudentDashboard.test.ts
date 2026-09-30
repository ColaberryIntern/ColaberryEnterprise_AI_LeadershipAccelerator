import { deriveAttentionQueue } from '../internshipStudentDashboard';
import type { ChecklistStepStatus } from '../internshipOnboarding';

// deriveAttentionQueue splits the incomplete checklist by who owns each step:
// the student's own to-dos vs what Colaberry still owes. Pure — no I/O.
function step(over: Partial<ChecklistStepStatus>): ChecklistStepStatus {
  return {
    key: 'k', order: 10, label: 'L', detail: 'D',
    actor: 'student', blocking_activation: false, complete: false, waiting_on: null,
    ...over,
  } as ChecklistStepStatus;
}

describe('deriveAttentionQueue', () => {
  it('puts an incomplete student step in your_turn', () => {
    const q = deriveAttentionQueue([step({ key: 'first_week_checkin', actor: 'student', complete: false })]);
    expect(q.your_turn.map((i) => i.key)).toEqual(['first_week_checkin']);
    expect(q.waiting_on_colaberry).toEqual([]);
  });

  it('puts an incomplete Colaberry step in waiting_on_colaberry, never your_turn', () => {
    const q = deriveAttentionQueue([step({ key: 'first_project_assigned', actor: 'colaberry', complete: false, waiting_on: 'your manager is assigning it' })]);
    expect(q.waiting_on_colaberry.map((i) => i.key)).toEqual(['first_project_assigned']);
    expect(q.your_turn).toEqual([]);
  });

  it('drops completed steps from both lists', () => {
    const q = deriveAttentionQueue([
      step({ key: 'done_student', actor: 'student', complete: true }),
      step({ key: 'done_colaberry', actor: 'colaberry', complete: true }),
    ]);
    expect(q.your_turn).toEqual([]);
    expect(q.waiting_on_colaberry).toEqual([]);
  });

  it('carries the blocking flag and waiting_on through', () => {
    const q = deriveAttentionQueue([step({ key: 'membership_active', actor: 'student', blocking_activation: true, waiting_on: 'not active yet' })]);
    expect(q.your_turn[0]).toMatchObject({ blocking: true, waiting_on: 'not active yet' });
  });
});
