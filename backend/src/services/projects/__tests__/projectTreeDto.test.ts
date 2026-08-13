/**
 * Pure mappers for the Project Backend read API (P1). No I/O.
 */
import {
  toTaskDto,
  toListDto,
  toProjectTreeDto,
  toProjectSummaryDto,
} from '../projectTreeDto';

describe('toTaskDto', () => {
  it('maps story + requirement fields and passes acceptance/fulfills through', () => {
    const dto = toTaskDto({
      id: 't1', story_id: 'STORY-001', requirement_key: 'AUTH.001', requirement_map_id: 'r1',
      title: 'Book online', description: 'desc', status: 'in_progress', position: 2,
      owner_agent: 'Booking Agent', execution_mode: 'ai', release_key: 'r0',
      acceptance: ['Given… When… Then…'], build: 'prompt', vibe: 'v', trust: 'audited',
      fulfills: ['AUTH.001'], blocked_by: ['STORY-000'],
    });
    expect(dto.story_id).toBe('STORY-001');
    expect(dto.acceptance).toEqual(['Given… When… Then…']);
    expect(dto.fulfills).toEqual(['AUTH.001']);
    expect(dto.blocked_by).toEqual(['STORY-000']);
    expect(dto.execution_mode).toBe('ai');
  });

  it('defaults missing/null fields safely (blocked_by → [], status → not_started)', () => {
    const dto = toTaskDto({ id: 't2', title: 'x' });
    expect(dto.blocked_by).toEqual([]);
    expect(dto.status).toBe('not_started');
    expect(dto.position).toBe(0);
    expect(dto.story_id).toBeNull();
    expect(dto.requirement_key).toBeNull();
  });
});

describe('toListDto', () => {
  it('sorts tasks by position regardless of input order', () => {
    const list = toListDto({ id: 'l1', cluster: 'AUTH', title: 'Auth', status: 'not_started', position: 0 }, [
      { id: 'b', title: 'b', position: 2 },
      { id: 'a', title: 'a', position: 0 },
      { id: 'c', title: 'c', position: 1 },
    ]);
    expect(list.tasks.map((t) => t.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('toProjectTreeDto', () => {
  const project = { id: 'p1', name: 'Salon', organization_name: 'Acme', industry: 'beauty', project_stage: 'implementation', requirements_completion_pct: 40, health_score: 70 };

  it('sorts lists by position and counts tasks by status', () => {
    const tree = toProjectTreeDto(project, [
      { id: 'l2', cluster: 'PAY', title: 'Payments', position: 1, tasks: [{ id: 't3', title: 't3', position: 0, status: 'blocked' }] },
      { id: 'l1', cluster: 'AUTH', title: 'Auth', position: 0, tasks: [
        { id: 't1', title: 't1', position: 0, status: 'complete' },
        { id: 't2', title: 't2', position: 1, status: 'in_progress' },
      ] },
    ]);
    expect(tree.lists.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(tree.task_counts).toEqual({ total: 3, complete: 1, in_progress: 1, blocked: 1, not_started: 0 });
    expect(tree.name).toBe('Salon');
  });

  it('handles a project with no lists', () => {
    const tree = toProjectTreeDto(project, []);
    expect(tree.lists).toEqual([]);
    expect(tree.task_counts.total).toBe(0);
  });
});

describe('toProjectSummaryDto', () => {
  it('flags the active project', () => {
    expect(toProjectSummaryDto({ id: 'p1', name: 'A' }, 'p1').is_active).toBe(true);
    expect(toProjectSummaryDto({ id: 'p2', name: 'B' }, 'p1').is_active).toBe(false);
    expect(toProjectSummaryDto({ id: 'p1', name: 'A' }, null).is_active).toBe(false);
  });
});

describe('the schedule reaches the portal', () => {
  /**
   * MEASURED, 2026-08-13, production. The pipeline computed real due dates and
   * wrote them to student_tasks — 19 of 19 rows dated — and the portal showed
   * none of them, because ProjectTaskDto simply had no field for them. The
   * whole scheduling feature was invisible on the only surface a student looks
   * at. Nothing failed; the dates just stopped at the DTO boundary.
   */
  it('carries the due date and its untouched baseline', () => {
    const dto = toTaskDto({
      id: 't1', title: 'Build your Command Center', position: 0,
      due_on: '2026-08-13', due_baseline_on: '2026-08-13',
    });

    expect(dto.due_on).toBe('2026-08-13');
    expect(dto.due_baseline_on).toBe('2026-08-13');
  });

  it('keeps the baseline when the current date has moved — that gap is the lesson', () => {
    const dto = toTaskDto({ id: 't1', title: 'Slipped', position: 0,
      due_on: '2026-09-10', due_baseline_on: '2026-08-20' });

    expect(dto.due_on).toBe('2026-09-10');
    expect(dto.due_baseline_on).toBe('2026-08-20');
  });

  it('emits a date, never a timestamp, whichever way the driver returns it', () => {
    // A due date carrying a time lands on the wrong day in another timezone.
    const dto = toTaskDto({ id: 't1', title: 'x', position: 0,
      due_on: new Date('2026-08-13T00:00:00Z'), due_baseline_on: '2026-08-13T00:00:00.000Z' });

    expect(dto.due_on).toBe('2026-08-13');
    expect(dto.due_baseline_on).toBe('2026-08-13');
  });

  it('is null, not undefined or an empty string, when a cohort has no start date', () => {
    const dto = toTaskDto({ id: 't1', title: 'x', position: 0 });

    expect(dto.due_on).toBeNull();
    expect(dto.due_baseline_on).toBeNull();
  });

  it('refuses to pass through something that is not a date', () => {
    const dto = toTaskDto({ id: 't1', title: 'x', position: 0, due_on: 'soon' } as any);
    expect(dto.due_on).toBeNull();
  });
});
