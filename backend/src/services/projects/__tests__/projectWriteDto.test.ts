/**
 * Pure write helpers for the Project Backend (P1b). No I/O.
 */
import { isTaskStatus, importTaskToAttributes, TASK_STATUSES } from '../projectWriteDto';

describe('isTaskStatus', () => {
  it('accepts the four valid statuses', () => {
    for (const s of TASK_STATUSES) expect(isTaskStatus(s)).toBe(true);
  });
  it('rejects anything else', () => {
    for (const s of ['done', 'todo', 'skipped', '', 'COMPLETE', 42, null, undefined]) {
      expect(isTaskStatus(s as any)).toBe(false);
    }
  });
});

describe('importTaskToAttributes', () => {
  it('maps a full story task onto StudentTask attributes', () => {
    const a = importTaskToAttributes(
      {
        story_id: 'STORY-001', requirement_key: 'REQ-001', title: 'Book online', description: 'd',
        status: 'in_progress', position: 3, owner_agent: 'Booking Agent', execution_mode: 'ai',
        release_key: 'r0', acceptance: ['Given…'], build: 'prompt', blocked_by: ['STORY-000'],
      },
      'proj1', 'list1', 9,
    );
    expect(a.project_id).toBe('proj1');
    expect(a.task_list_id).toBe('list1');
    expect(a.story_id).toBe('STORY-001');
    expect(a.status).toBe('in_progress');
    expect(a.position).toBe(3);
    expect(a.acceptance).toEqual(['Given…']);
    expect(a.blocked_by).toEqual(['STORY-000']);
    expect(a.requirement_map_id).toBeNull();
  });

  it('defaults invalid/missing fields (status → not_started, position → fallback, blocked_by → null)', () => {
    const a = importTaskToAttributes({ title: 'x', status: 'nope' }, 'p', 'l', 5);
    expect(a.status).toBe('not_started');
    expect(a.position).toBe(5);
    expect(a.blocked_by).toBeNull();
    expect(a.story_id).toBeNull();
  });

  it('bounds an over-long title to 500 chars', () => {
    const a = importTaskToAttributes({ title: 'a'.repeat(900) }, 'p', 'l', 0);
    expect(a.title.length).toBe(500);
  });
});
