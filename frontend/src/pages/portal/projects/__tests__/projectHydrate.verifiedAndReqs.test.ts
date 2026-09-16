/**
 * Two lies the build card told a student on 2026-09-15, and why they stop.
 *
 * She had 14 of 15 stories verified on one build and 8 of 8 on the other, and
 * the ledger had paid her 1,489 points. Her cards read "0/14 verified",
 * "0/8 verified" and "0/1055 pts".
 *
 *  - "N/M verified" is REQUIREMENTS. `backendTreeToProject` hardcoded every
 *    requirement to `planned`, so that number was zero for everyone, always.
 *  - "pts" counts `verifiedAt` on tasks. `overlayCompletions`, the path taken by
 *    the device that did the work, copied `done` and `points` from the server
 *    but never `verifiedAt`, so earned stayed 0 exactly where it mattered.
 *
 * Pure functions; no I/O.
 */
import {
  overlayCompletions, backendTreeToProject, deriveReqStates,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import { projectPoints, reqVerified, type StudentProject, type ProjectTask, type ProjectReq } from '../projectsStore';

const PROJECT_ID = '0a540b56-2565-4bd1-b273-b056c712a3e8';

const bTask = (story_id: string, position: number, over: Partial<BackendTaskNode> = {}): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: `${story_id} title`,
  description: null, status: 'not_started', position, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [], ...over,
});
const tree = (tasks: BackendTaskNode[]): BackendProjectTree => ({
  id: PROJECT_ID, name: 'Kashmir Craft AI Order Assistant', organization_name: null,
  lists: [{ id: 'l-r0', title: 'Release 0', position: 0, tasks }],
});
const localTask = (storyId: string, over: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id: `uuid-${storyId}`, title: `${storyId} title`, storyId, state: 'todo', due: 'up', ...over });
const local = (tasks: ProjectTask[], reqs: ProjectReq[] = []): StudentProject => ({
  id: PROJECT_ID, name: 'Kashmir Craft AI Order Assistant', slug: 'kashmir-craft', descriptor: '',
  accent: '#000', cover: '', icon: '', status: 'ready', createdAt: 1, stage: '',
  curStep: 2, size: 'project', idea: '', sample: false, reqs, activity: [],
  preview: { toolName: 'Kashmir Craft', summary: '', tools: [], dataSources: [], guardrails: [] },
  lists: [{ id: 'l-r0', step: 2, name: 'Release 0', sub: '', tasks }],
});

// The server, after the webhook verified two stories and paid them.
const SERVER = tree([
  bTask('STORY-000', 0, { status: 'complete', verified_at: '2026-09-11T22:09:00.000Z', points: 53, requirement_key: 'FUNC-001' }),
  bTask('STORY-001', 1, { status: 'complete', verified_at: '2026-09-12T01:30:00.000Z', points: 53, requirement_key: 'FUNC-001' }),
  bTask('STORY-002', 2, { status: 'not_started', points: 53, requirement_key: 'FUNC-002' }),
]);

describe('the device that did the work (overlayCompletions)', () => {
  it('carries the server\'s verifiedAt onto tasks it already holds, so earned points stop reading 0', () => {
    const before = local([
      localTask('STORY-000', { state: 'done', due: 'done', points: 53, req: 'FUNC-001' }),
      localTask('STORY-001', { state: 'done', due: 'done', points: 53, req: 'FUNC-001' }),
      localTask('STORY-002', { points: 53, req: 'FUNC-002' }),
    ], [{ id: 'FUNC-001', name: 'FUNC-001', kind: 'FUNC', state: 'planned' }, { id: 'FUNC-002', name: 'FUNC-002', kind: 'FUNC', state: 'planned' }]);
    expect(projectPoints(before).earned).toBe(0);           // the bug, as it was
    const after = overlayCompletions(before, SERVER);
    expect(after).not.toBe(before);
    // The unverified one is left exactly as this device held it (undefined),
    // not normalised: the overlay sets stamps, it never rewrites their absence.
    expect(after.lists[0].tasks.map((t) => t.verifiedAt)).toEqual(['2026-09-11T22:09:00.000Z', '2026-09-12T01:30:00.000Z', undefined]);
    expect(projectPoints(after)).toEqual({ earned: 106, available: 159, priced: 3 });
  });

  it('moves the requirement chips in the same pull', () => {
    const before = local([
      localTask('STORY-000', { state: 'done', due: 'done', req: 'FUNC-001' }),
      localTask('STORY-001', { state: 'done', due: 'done', req: 'FUNC-001' }),
      localTask('STORY-002', { req: 'FUNC-002' }),
    ], [{ id: 'FUNC-001', name: 'FUNC-001', kind: 'FUNC', state: 'planned' }, { id: 'FUNC-002', name: 'FUNC-002', kind: 'FUNC', state: 'planned' }]);
    const after = overlayCompletions(before, SERVER);
    expect(after.reqs.map((r) => `${r.id}:${r.state}`)).toEqual(['FUNC-001:verified', 'FUNC-002:planned']);
    expect(reqVerified(after)).toEqual({ v: 1, total: 2 });
  });

  it('never clears a stamp this device already holds when the server has none yet', () => {
    const before = local([localTask('STORY-002', { state: 'done', due: 'done', verifiedAt: '2026-09-15T00:00:00.000Z' })]);
    const after = overlayCompletions(before, tree([bTask('STORY-002', 0, { status: 'complete', verified_at: null })]));
    expect(after.lists[0].tasks[0].verifiedAt).toBe('2026-09-15T00:00:00.000Z');
  });

  it('is idempotent: a second pull with the same tree returns the same reference', () => {
    const before = local([
      localTask('STORY-000', { state: 'done', due: 'done', points: 53, req: 'FUNC-001' }),
      localTask('STORY-001', { state: 'done', due: 'done', points: 53, req: 'FUNC-001' }),
      localTask('STORY-002', { points: 53, req: 'FUNC-002' }),
    ], [{ id: 'FUNC-001', name: 'FUNC-001', kind: 'FUNC', state: 'planned' }, { id: 'FUNC-002', name: 'FUNC-002', kind: 'FUNC', state: 'planned' }]);
    const once = overlayCompletions(before, SERVER);
    const twice = overlayCompletions(once, SERVER);
    expect(twice).toBe(once);
  });
});

describe('a device that has never seen the build (backendTreeToProject)', () => {
  it('derives requirement state from the stories instead of hardcoding planned', () => {
    const p = backendTreeToProject(SERVER);
    expect(p.reqs.map((r) => `${r.id}:${r.state}`)).toEqual(['FUNC-001:verified', 'FUNC-002:planned']);
    expect(projectPoints(p).earned).toBe(106);
  });
});

describe('deriveReqStates', () => {
  const reqs: ProjectReq[] = [
    { id: 'FUNC-001', name: 'FUNC-001', kind: 'FUNC', state: 'planned' },
    { id: 'FUNC-002', name: 'FUNC-002', kind: 'FUNC', state: 'planned' },
    { id: 'NFR-001', name: 'NFR-001', kind: 'NFR', state: 'built' },
  ];
  const lists = (tasks: ProjectTask[]) => [{ id: 'l', step: 2, name: 'R0', sub: '', tasks }];

  it('verified only when EVERY citing story is verified; built when any is done', () => {
    const out = deriveReqStates(reqs, lists([
      localTask('STORY-000', { state: 'done', due: 'done', verifiedAt: 'x', req: 'FUNC-001' }),
      localTask('STORY-001', { state: 'done', due: 'done', verifiedAt: null, req: 'FUNC-001' }),
      localTask('STORY-002', { state: 'done', due: 'done', verifiedAt: 'x', req: 'FUNC-002' }),
    ]));
    expect(out.map((r) => r.state)).toEqual(['built', 'verified', 'built']);
  });

  it('says nothing about a requirement no story cites, and returns the same array when nothing moves', () => {
    const out = deriveReqStates(reqs, lists([localTask('STORY-009', { req: 'FUNC-001' })]));
    expect(out).toBe(reqs);   // FUNC-001 stays planned; NFR-001 keeps its built
  });
});
