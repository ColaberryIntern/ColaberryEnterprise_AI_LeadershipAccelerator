/**
 * GET /api/portal/sbp/builds/:projectId/stories/:storyId/prompt — and the one
 * story it could never return.
 *
 * ── THE DEFECT (D3) ──────────────────────────────────────────────────────────
 *
 * `GET .../stories/STORY-000/prompt` answered
 * `404 {"error":"Story STORY-000 is not in this plan"}` on a project whose
 * STORY-000 was materialized, seeded, documented and verifiable. STORY-001 on
 * the same project returned 200.
 *
 * STORY-000 is deliberately kept OUT of `plan.stories`: the Command Center
 * fulfils no requirement of the student's own system, so including it would
 * distort the traceability gate and the release sizing. The cost is that every
 * path which iterates or looks up `plan.stories` silently omits it — and this
 * route's `^STORY-\d+$` validator accepts `STORY-000` happily before handing it
 * to a lookup that cannot find it.
 *
 * Not student-visible today, because the workspace UI copies `task.build` off
 * the project tree rather than calling this. That makes it a trap for the next
 * caller rather than a fixed bug, and this exact omission has already cost this
 * workstream three separate defects: a verification miss, a missing
 * `docs/stories/STORY-000.md`, and a missing `progress.json` entry.
 */
import express from 'express';
import request from 'supertest';

const ENROLLMENT = 'aced5b39-0000-4000-8000-000000000001';
const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

jest.mock('../../config/env', () => ({ env: { sbpPipelineEnabled: true } }));

jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => {
    req.participant = { sub: ENROLLMENT, email: 's@test.com', role: 'participant' };
    next();
  },
}));

const mockFindByPk = jest.fn();
jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockFindByPk(...a) },
}));

const mockGetPlan = jest.fn();
jest.mock('../../services/sbp/planStore', () => ({
  __esModule: true,
  getPlan: (...a: any[]) => mockGetPlan(...a),
}));

// No repo: keeps the GitHub manifest read out of the picture entirely, so this
// suite is about story resolution and nothing else.
jest.mock('../../services/sbp/workspaceRepo', () => ({
  __esModule: true,
  repoForProject: jest.fn().mockResolvedValue(null),
}));

const mockSchedule = jest.fn();
jest.mock('../../services/sbp/scheduleForEnrollment', () => ({
  __esModule: true,
  scheduleForEnrollment: (...a: any[]) => mockSchedule(...a),
}));

import sbpRoutes from '../sbpRoutes';
import { COMMAND_CENTER_STORY_ID, COMMAND_CENTER_ACCEPTANCE } from '../../services/sbp/commandCenterStory';

const app = express();
app.use(express.json());
app.use(sbpRoutes);

/** A published plan that carries the student's own stories and NOT STORY-000. */
function storedPlan() {
  return {
    id: 'plan-1', project_id: PROJECT, version: 2, status: 'published',
    plan_sha256: 'x'.repeat(64), gate_ok: true, gate_violations: [],
    model: 'test', attempts: 1, correlation_id: null, published_at: null,
    plan: {
      project_name: 'Student Engagement Monitoring Tool',
      descriptor: 'watches who is falling behind',
      requirements: [
        { id: 'REQ-001', statement: 'The system must flag a student who misses two sessions.', kind: 'FUNC', priority: 'must', cluster: 'core' },
        { id: 'REQ-002', statement: 'Nothing is emailed to a student without a named person approving it.', kind: 'SAFE', priority: 'must', cluster: 'core' },
      ],
      releases: [{ key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
      stories: [{
        id: 'STORY-001', release: 'r0', title: 'Flag the missed sessions',
        narrative: 'As an instructor, I want the misses flagged, so that I can act.',
        fulfills: ['REQ-001'], owner_agent: 'Monitoring Agent',
        acceptance: ['Given two misses, when the run happens, then the student is flagged.'],
        task_guidance: 'guidance', failure_paths: ['attendance feed down'],
      }],
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: ENROLLMENT });
  mockGetPlan.mockResolvedValue(storedPlan());
  mockSchedule.mockResolvedValue(null);
});

const get = (storyId: string) =>
  request(app).get(`/api/portal/sbp/builds/${PROJECT}/stories/${storyId}/prompt`);

describe('STORY-000 resolves even though it is not in plan.stories', () => {
  it('returns 200 and the Command Center prompt, not "not in this plan"', async () => {
    const res = await get(COMMAND_CENTER_STORY_ID);

    expect(res.status).toBe(200);
    expect(res.body.story_id).toBe(COMMAND_CENTER_STORY_ID);
    // The stored plan genuinely does not carry it — this is resolution, not a
    // fixture that quietly put STORY-000 into the plan to make the test pass.
    expect(storedPlan().plan.stories.map((s) => s.id)).not.toContain(COMMAND_CENTER_STORY_ID);
  });

  it('returns the SAME prompt materialize stored on the task row, not a second assembly', async () => {
    // `commandCenterPrompt` is what materializeTasks writes to
    // `student_tasks.build`. Building STORY-000's prompt any other way here
    // would be a second thing to drift, and drift between the prompt a student
    // reads and the criteria the platform matches is the defect that started
    // this workstream.
    const { commandCenterPrompt } = await import('../../services/sbp/commandCenterStory');
    const expected = commandCenterPrompt(storedPlan().plan as any, null);

    const res = await get(COMMAND_CENTER_STORY_ID);

    expect(res.body.prompt).toBe(expected);
  });

  it('carries the acceptance criteria the platform actually verifies', async () => {
    const res = await get(COMMAND_CENTER_STORY_ID);

    // Anti-vacuity: assert the list is non-empty before looping it, so a
    // constant that emptied out cannot make this pass with zero checks.
    expect(COMMAND_CENTER_ACCEPTANCE.length).toBeGreaterThan(0);
    for (const line of COMMAND_CENTER_ACCEPTANCE) expect(res.body.prompt).toContain(line);
  });

  it('matches the story id case-insensitively, like every other story does', async () => {
    // The route already lowercases nothing and compares with toUpperCase for
    // plan stories; STORY-000 must not be the one id that is case-sensitive.
    expect((await get('story-000')).status).toBe(200);
  });

  it('uses the cohort schedule when there is one, so the dates match the portal', async () => {
    mockSchedule.mockResolvedValue({
      buildStart: new Date('2026-08-15T00:00:00Z'),
      buildEnd: new Date('2026-10-01T00:00:00Z'),
      demoDay: new Date('2026-10-08T00:00:00Z'),
      buildWeeks: 7, capacity: { low: 7, high: 14 }, totalTasks: 1,
      demoReleaseKey: 'r0', roadmapReleaseKeys: [], verdict: 'comfortable',
      tasks: [{ storyId: 'STORY-001', releaseKey: 'r0', dueOn: new Date('2026-08-20T00:00:00Z') }],
      prep: [],
    });

    const res = await get(COMMAND_CENTER_STORY_ID);

    expect(mockSchedule).toHaveBeenCalledWith(ENROLLMENT, expect.anything(), null);
    expect(res.body.prompt).toContain('Demo day is 2026-10-08');
  });

  it('still answers when the cohort has no start date and the schedule is null', async () => {
    // Null is a NORMAL outcome of scheduleForEnrollment. A missing cohort date
    // must never cost a student their prompt.
    mockSchedule.mockResolvedValue(null);

    const res = await get(COMMAND_CENTER_STORY_ID);

    expect(res.status).toBe(200);
    expect(res.body.prompt).not.toContain('Demo day is');
  });
});

describe('the rest of the route is unchanged', () => {
  it('still serves an ordinary story from the plan', async () => {
    const res = await get('STORY-001');

    expect(res.status).toBe(200);
    expect(res.body.story_id).toBe('STORY-001');
    expect(res.body.prompt).toContain('Flag the missed sessions');
    // And it did NOT take the STORY-000 branch on the way past.
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('still 404s for a story that genuinely is not in the plan', async () => {
    // The message has to keep meaning what it says. STORY-000 was the one id
    // for which it was false; STORY-404 is a case where it is true.
    const res = await get('STORY-404');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Story STORY-404 is not in this plan');
  });

  it('404s for a project that is not the caller\'s, before any plan is read', async () => {
    mockFindByPk.mockResolvedValue({ id: PROJECT, enrollment_id: 'someone-else' });

    const res = await get(COMMAND_CENTER_STORY_ID);

    expect(res.status).toBe(404);
    expect(mockGetPlan).not.toHaveBeenCalled();
  });

  it('404s when the project has no plan at all', async () => {
    mockGetPlan.mockResolvedValue(null);

    const res = await get(COMMAND_CENTER_STORY_ID);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No plan for this project');
  });
});
