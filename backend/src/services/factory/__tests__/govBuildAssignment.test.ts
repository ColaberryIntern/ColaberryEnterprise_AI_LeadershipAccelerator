/**
 * govBuildAssignment — the operator's assignment of a Build story to a student builder. THE RAIL under test: a
 * story may be assigned ONLY to someone the delivery engine recognises as a builder on the project (holds
 * story.execute); a non-builder is refused and nothing is written. Upsert is idempotent; the picker offers only
 * real builders. The engine's permission logic is REAL here (only buildDeliveryContext is stubbed to supply the
 * assignee's roles), so the test proves the actual grant rules, not a re-implementation of them.
 */
const asCreate = jest.fn();
const asFindOne = jest.fn();
const asFindAll = jest.fn();
const asDestroy = jest.fn();
jest.mock('../../../models/GovBuildStoryAssignment', () => ({
  __esModule: true,
  default: {
    create: (...a: any[]) => asCreate(...a), findOne: (...a: any[]) => asFindOne(...a),
    findAll: (...a: any[]) => asFindAll(...a), destroy: (...a: any[]) => asDestroy(...a),
  },
}));
const memFindAll = jest.fn();
const memFindOne = jest.fn();
const memCreate = jest.fn();
jest.mock('../../../models/DeliveryProjectMember', () => ({ __esModule: true, default: {
  findAll: (...a: any[]) => memFindAll(...a),
  findOne: (...a: any[]) => memFindOne(...a),
  create: (...a: any[]) => memCreate(...a),
} }));
const idFindAll = jest.fn();
jest.mock('../../../models/PlatformIdentity', () => ({ __esModule: true, default: { findAll: (...a: any[]) => idFindAll(...a) } }));
const getConsoleRoster = jest.fn();
jest.mock('../../internship/internConsoleRoster', () => ({ __esModule: true, getConsoleRoster: (...a: any[]) => getConsoleRoster(...a) }));
const ensurePlatformIdentity = jest.fn();
jest.mock('../../../modules/identity/platformIdentityService', () => ({ __esModule: true, normalizeEmail: (e: any) => String(e ?? '').trim().toLowerCase(), ensurePlatformIdentity: (...a: any[]) => ensurePlatformIdentity(...a) }));

// Keep the REAL permission logic (hasDeliveryPermission + the role grant map); stub ONLY the membership read so the
// test controls the assignee's roles. A mutant that drops the story.execute check therefore fails a real-grant test.
const buildCtx = jest.fn();
jest.mock('../../../modules/delivery/deliveryAuthorization', () => {
  const actual = jest.requireActual('../../../modules/delivery/deliveryAuthorization');
  return { __esModule: true, ...actual, buildDeliveryContext: (...a: any[]) => buildCtx(...a) };
});

import { assignBuildStory, unassignBuildStory, listBuildStoryAssignments, listAssignableBuilders, listActiveInternsForAssignment, ensureAssigneeCanBuild, AssignmentError } from '../govBuildAssignment';

const ctxWithRoles = (roles: string[]) => ({ platformIdentityId: 'who', deliveryProjectId: 'dp-1', projectTenantId: 't-1', roles, isClientOnly: false });
const rowFrom = (v: any) => ({ get: () => ({ id: 'as-1', assigned_at: new Date('2026-10-08T00:00:00Z'), ...v }) });
// A REAL uuid, because `granted_by_identity_id` is a uuid column and the fixture has to be able to tell the
// difference between "attribution recorded" and "attribution dropped" (see the actor-is-not-a-uuid tests below).
const OPERATOR_ID = '22222222-2222-4222-8222-222222222222';
const input = (over: any = {}) => ({ deliveryProjectId: 'dp-1', storyId: 'STORY-R1', canonicalReqId: 'R1', assigneeIdentityId: 'builder-7', assignedByIdentityId: OPERATOR_ID, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the assignee already has a membership on this project, so provision-on-assign is a no-op.
  // Tests that exercise provisioning (a brand-new builder) override memFindOne to resolve null.
  memFindOne.mockResolvedValue({ id: 'm-existing', delivery_role: 'associate_builder' });
  memCreate.mockImplementation(async (v: any) => ({ id: 'm-new', ...v }));
});

describe('assignBuildStory — the assignee MUST be a builder (story.execute)', () => {
  it('assigns when the assignee holds story.execute (associate_builder), creating the row with the assignee + assigner', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder'])); // real grant map: associate_builder HAS story.execute
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await assignBuildStory(input());
    expect(asCreate).toHaveBeenCalledTimes(1);
    const created = asCreate.mock.calls[0][0];
    expect(created.assignee_identity_id).toBe('builder-7');
    expect(created.assigned_by_identity_id).toBe(OPERATOR_ID);
    expect(created.story_id).toBe('STORY-R1');
    expect(r.assigneeIdentityId).toBe('builder-7');
  });

  it('REFUSES to assign to a non-builder (a reviewer-only member) — assignee_not_builder, nothing written', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles(['qa_reviewer'])); // real grant map: qa_reviewer does NOT have story.execute
    await expect(assignBuildStory(input())).rejects.toMatchObject({ reason: 'assignee_not_builder' });
    expect(asCreate).not.toHaveBeenCalled();
    expect(asFindOne).not.toHaveBeenCalled();
  });

  it('PROVISIONS a brand-new builder membership when the assignee has none, then assigns (provision-on-assign)', async () => {
    memFindOne.mockResolvedValue(null); // a freshly materialized gov intern: no delivery membership yet
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder'])); // after provisioning, the engine sees the role
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await assignBuildStory(input());
    expect(memCreate).toHaveBeenCalledTimes(1);
    expect(memCreate.mock.calls[0][0]).toMatchObject({
      delivery_project_id: 'dp-1', platform_identity_id: 'builder-7', delivery_role: 'associate_builder', granted_by_identity_id: OPERATOR_ID,
    });
    expect(r.assigneeIdentityId).toBe('builder-7');
  });

  it('is idempotent: re-assigning an existing story UPDATES in place, never a duplicate row', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles(['builder']));
    const existing: any = { _state: { id: 'as-1', story_id: 'STORY-R1' }, get() { return { ...this._state }; }, update: jest.fn(async function (this: any, patch: any) { Object.assign(this._state, patch); }) };
    asFindOne.mockResolvedValue(existing);
    const r = await assignBuildStory(input({ assigneeIdentityId: 'builder-9' }));
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ assignee_identity_id: 'builder-9' }));
    expect(asCreate).not.toHaveBeenCalled();
    expect(r.assigneeIdentityId).toBe('builder-9');
  });

  it('rejects missing identifiers (bad_input) and a missing assignee (no_assignee) before touching the engine', async () => {
    await expect(assignBuildStory(input({ canonicalReqId: '' }))).rejects.toMatchObject({ reason: 'bad_input' });
    await expect(assignBuildStory(input({ assigneeIdentityId: '' }))).rejects.toMatchObject({ reason: 'no_assignee' });
    expect(buildCtx).not.toHaveBeenCalled();
  });

  it('allows a null assigner (operator with no platform identity) — assignment is not blocked on audit plumbing', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder']));
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await assignBuildStory(input({ assignedByIdentityId: null }));
    expect(asCreate.mock.calls[0][0].assigned_by_identity_id).toBeNull();
    expect(r.assigneeIdentityId).toBe('builder-7');
  });
});

describe('provision-on-assign — keeps the gate and preserves separation of duties', () => {
  it('does NOT provision (or duplicate) when the assignee already has a membership here', async () => {
    memFindOne.mockResolvedValue({ id: 'm-1', delivery_role: 'associate_builder' });
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder']));
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await assignBuildStory(input());
    expect(memCreate).not.toHaveBeenCalled();
    expect(r.assigneeIdentityId).toBe('builder-7');
  });

  it('does NOT promote an existing non-builder member (a reviewer) — refused, no membership written', async () => {
    memFindOne.mockResolvedValue({ id: 'm-r', delivery_role: 'qa_reviewer' }); // existing membership -> left untouched
    buildCtx.mockResolvedValue(ctxWithRoles(['qa_reviewer']));                 // real grant map: no story.execute
    await expect(assignBuildStory(input())).rejects.toMatchObject({ reason: 'assignee_not_builder' });
    expect(memCreate).not.toHaveBeenCalled();
    expect(asCreate).not.toHaveBeenCalled();
  });

  it('does NOT reinstate a revoked builder — refused, no membership written', async () => {
    memFindOne.mockResolvedValue({ id: 'm-x', delivery_role: 'associate_builder', status: 'revoked' }); // row exists -> untouched
    buildCtx.mockResolvedValue(ctxWithRoles([])); // buildDeliveryContext counts only ACTIVE members -> no roles
    await expect(assignBuildStory(input())).rejects.toMatchObject({ reason: 'assignee_not_builder' });
    expect(memCreate).not.toHaveBeenCalled();
  });

  it('swallows a provisioning race (unique-constraint create failure) and still assigns', async () => {
    // A REAL race: our findOne saw nothing, the create lost to a concurrent insert, and the re-read now finds the
    // row the racer wrote. The grant is satisfied by somebody else's row, so assignment proceeds.
    memFindOne.mockResolvedValueOnce(null).mockResolvedValue({ id: 'm-racer', delivery_role: 'associate_builder' });
    memCreate.mockRejectedValue(new Error('duplicate key value violates unique constraint'));
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder'])); // the racer's row is now visible to the gate
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await assignBuildStory(input());
    expect(r.assigneeIdentityId).toBe('builder-7'); // did not throw; assignment proceeded
  });

  // THE REGRESSION THIS PAIR EXISTS FOR. The catch above used to be unconditional, so a create that failed for
  // any reason OTHER than a race was indistinguishable from one that succeeded, and the caller carried on with an
  // unauthorized builder. That is how a materialized gov build ended up with zero membership rows: its intern
  // could not open their own cockpit and the contract vanished from the admin nav, silently.
  it('does NOT swallow a create failure when the membership is still absent — throws grant_failed, assigns nothing', async () => {
    memFindOne.mockResolvedValue(null); // before AND after the failed create: the row genuinely is not there
    memCreate.mockRejectedValue(new Error('null value in column "delivery_role" violates not-null constraint'));
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder']));
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    await expect(assignBuildStory(input())).rejects.toMatchObject({ reason: 'grant_failed' });
    expect(asCreate).not.toHaveBeenCalled(); // nothing assigned on a failed grant
  });

  it('logs the failed grant with an error_class so it is traceable instead of silent', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      memFindOne.mockResolvedValue(null);
      const boom: any = new Error('connection terminated unexpectedly');
      boom.name = 'SequelizeConnectionError';
      memCreate.mockRejectedValue(boom);
      await expect(ensureAssigneeCanBuild('dp-1', 'builder-7', OPERATOR_ID)).rejects.toMatchObject({ reason: 'grant_failed' });
      expect(err).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(err.mock.calls[0][0] as string);
      expect(logged).toMatchObject({
        level: 'error',
        event: 'gov_build_membership_grant_failed',
        outcome: 'failure',
        error_class: 'SequelizeConnectionError',
      });
      expect(logged.context).toMatchObject({ deliveryProjectId: 'dp-1', assigneeIdentityId: 'builder-7' });
    } finally {
      err.mockRestore();
    }
  });

  it('is a silent no-op when the membership already exists (nothing created, nothing logged)', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      memFindOne.mockResolvedValue({ id: 'm-1', delivery_role: 'associate_builder' });
      await expect(ensureAssigneeCanBuild('dp-1', 'builder-7', OPERATOR_ID)).resolves.toBeUndefined();
      expect(memCreate).not.toHaveBeenCalled();
      expect(err).not.toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});

// THE BUG THE LOUD GRANT EXPOSED. Making the failure visible (above) turned a silent miss into one production
// log line, and the line named the cause outright: `invalid input syntax for type uuid: "admin@colaberry.com"`.
// The materialize route handed the admin's EMAIL to a uuid column, so the INSERT that grants the builder role was
// rejected every time. The route now resolves a real identity; this guard is the second half, so that no caller
// can ever again lose an authorization grant over a field that only records who performed it.
describe('ensureAssigneeCanBuild — attribution never blocks the grant', () => {
  beforeEach(() => { memFindOne.mockResolvedValue(null); }); // no membership yet: exercise the create

  it('records a non-uuid actor (an admin email) as null and still grants the role', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(ensureAssigneeCanBuild('dp-1', 'builder-7', 'admin@colaberry.com')).resolves.toBeUndefined();
      expect(memCreate).toHaveBeenCalledTimes(1);
      expect(memCreate.mock.calls[0][0]).toMatchObject({
        delivery_project_id: 'dp-1', platform_identity_id: 'builder-7', delivery_role: 'associate_builder',
        granted_by_identity_id: null,
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('logs the dropped attribution so it is visible rather than silent', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await ensureAssigneeCanBuild('dp-1', 'builder-7', 'admin@colaberry.com');
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(warn.mock.calls[0][0] as string);
      expect(logged).toMatchObject({ level: 'warn', event: 'gov_build_grant_by_not_an_identity', outcome: 'partial' });
      expect(logged.context).toMatchObject({ deliveryProjectId: 'dp-1', grantedByIdentityId: 'admin@colaberry.com' });
    } finally {
      warn.mockRestore();
    }
  });

  it('KEEPS a real uuid actor as the granter — the guard narrows nothing it should not', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await ensureAssigneeCanBuild('dp-1', 'builder-7', OPERATOR_ID);
      expect(memCreate.mock.calls[0][0].granted_by_identity_id).toBe(OPERATOR_ID);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('treats a null actor as the ordinary unattributed case — no warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await ensureAssigneeCanBuild('dp-1', 'builder-7', null);
      expect(memCreate.mock.calls[0][0].granted_by_identity_id).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('unassignBuildStory + listBuildStoryAssignments', () => {
  it('destroys the assignment and reports how many were removed; total on missing ids', async () => {
    asDestroy.mockResolvedValue(1);
    expect(await unassignBuildStory('dp-1', 'STORY-R1')).toEqual({ ok: true, removed: 1 });
    expect(asDestroy).toHaveBeenCalledWith({ where: { delivery_project_id: 'dp-1', story_id: 'STORY-R1' } });
    await expect(unassignBuildStory('', 'STORY-R1')).rejects.toBeInstanceOf(AssignmentError);
  });

  it('lists assignments as views and is total on empty input', async () => {
    expect(await listBuildStoryAssignments('')).toEqual([]);
    asFindAll.mockResolvedValue([rowFrom({ story_id: 'STORY-R1', canonical_req_id: 'R1', assignee_identity_id: 'b-1', assigned_by_identity_id: 'op-1' })]);
    const list = await listBuildStoryAssignments('dp-1');
    expect(list[0]).toMatchObject({ storyId: 'STORY-R1', canonicalReqId: 'R1', assigneeIdentityId: 'b-1' });
  });
});

describe('listAssignableBuilders — only real builders, via the real grant map', () => {
  it('returns members whose roles grant story.execute (builder/associate_builder) and EXCLUDES reviewer-only / client members', async () => {
    memFindAll.mockResolvedValue([
      { platform_identity_id: 'b-1', delivery_role: 'associate_builder' },
      { platform_identity_id: 'b-2', delivery_role: 'builder' },
      { platform_identity_id: 'r-1', delivery_role: 'qa_reviewer' },       // no story.execute → excluded
      { platform_identity_id: 'c-1', delivery_role: 'client_owner' },      // no story.execute → excluded
    ]);
    idFindAll.mockResolvedValue([{ id: 'b-1', primary_email: 'b1@x.com' }, { id: 'b-2', primary_email: 'b2@x.com' }]);
    const builders = await listAssignableBuilders('dp-1');
    expect(builders.map((b) => b.identityId).sort()).toEqual(['b-1', 'b-2']);
    expect(builders.find((b) => b.identityId === 'b-1')!.email).toBe('b1@x.com');
    expect(await listAssignableBuilders('')).toEqual([]);
  });
});

describe('listActiveInternsForAssignment — all active interns, UNASSIGNED first', () => {
  it('resolves existing identities by email AND backfills a missing one so every active intern is assignable (no-project first)', async () => {
    getConsoleRoster.mockResolvedValue([
      { enrollment_id: 'e1', name: 'Zoe Assigned', email: 'Zoe@x.com', project: { project_id: 'p1' } },
      { enrollment_id: 'e2', name: 'Amy Available', email: 'amy@x.com', project: null },
      { enrollment_id: 'e3', name: 'Ghost NoIdentity', email: 'ghost@x.com', project: null }, // no identity row -> backfilled, not dropped
    ]);
    idFindAll.mockResolvedValue([
      { id: 'id-zoe', primary_email: 'zoe@x.com' },
      { id: 'id-amy', primary_email: 'amy@x.com' },
    ]);
    ensurePlatformIdentity.mockImplementation(async ({ email }: any) => ({ identity: { id: 'id-' + String(email).split('@')[0] }, created: true }));
    const out = await listActiveInternsForAssignment();
    expect(out.map((o) => o.name)).toEqual(['Amy Available', 'Ghost NoIdentity', 'Zoe Assigned']); // both no-project first, by name
    expect(out.find((o) => o.name === 'Amy Available')).toMatchObject({ identityId: 'id-amy', hasProject: false });
    expect(out.find((o) => o.name === 'Zoe Assigned')).toMatchObject({ identityId: 'id-zoe', hasProject: true });
    // the intern with no identity row is BACKFILLED (ensurePlatformIdentity) and appears, instead of silently dropped
    expect(out.find((o) => o.name === 'Ghost NoIdentity')).toMatchObject({ identityId: 'id-ghost', hasProject: false });
    expect(ensurePlatformIdentity).toHaveBeenCalledWith(expect.objectContaining({ email: 'ghost@x.com' }));
  });

  it('is best-effort — a roster failure yields an empty list, never throws', async () => {
    getConsoleRoster.mockRejectedValue(new Error('db down'));
    expect(await listActiveInternsForAssignment()).toEqual([]);
  });
});
