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
jest.mock('../../../models/DeliveryProjectMember', () => ({ __esModule: true, default: { findAll: (...a: any[]) => memFindAll(...a) } }));
const idFindAll = jest.fn();
jest.mock('../../../models/PlatformIdentity', () => ({ __esModule: true, default: { findAll: (...a: any[]) => idFindAll(...a) } }));

// Keep the REAL permission logic (hasDeliveryPermission + the role grant map); stub ONLY the membership read so the
// test controls the assignee's roles. A mutant that drops the story.execute check therefore fails a real-grant test.
const buildCtx = jest.fn();
jest.mock('../../../modules/delivery/deliveryAuthorization', () => {
  const actual = jest.requireActual('../../../modules/delivery/deliveryAuthorization');
  return { __esModule: true, ...actual, buildDeliveryContext: (...a: any[]) => buildCtx(...a) };
});

import { assignBuildStory, unassignBuildStory, listBuildStoryAssignments, listAssignableBuilders, AssignmentError } from '../govBuildAssignment';

const ctxWithRoles = (roles: string[]) => ({ platformIdentityId: 'who', deliveryProjectId: 'dp-1', projectTenantId: 't-1', roles, isClientOnly: false });
const rowFrom = (v: any) => ({ get: () => ({ id: 'as-1', assigned_at: new Date('2026-10-08T00:00:00Z'), ...v }) });
const input = (over: any = {}) => ({ deliveryProjectId: 'dp-1', storyId: 'STORY-R1', canonicalReqId: 'R1', assigneeIdentityId: 'builder-7', assignedByIdentityId: 'op-1', ...over });

beforeEach(() => { jest.clearAllMocks(); });

describe('assignBuildStory — the assignee MUST be a builder (story.execute)', () => {
  it('assigns when the assignee holds story.execute (associate_builder), creating the row with the assignee + assigner', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles(['associate_builder'])); // real grant map: associate_builder HAS story.execute
    asFindOne.mockResolvedValue(null);
    asCreate.mockImplementation(async (v: any) => rowFrom(v));
    const r = await assignBuildStory(input());
    expect(asCreate).toHaveBeenCalledTimes(1);
    const created = asCreate.mock.calls[0][0];
    expect(created.assignee_identity_id).toBe('builder-7');
    expect(created.assigned_by_identity_id).toBe('op-1');
    expect(created.story_id).toBe('STORY-R1');
    expect(r.assigneeIdentityId).toBe('builder-7');
  });

  it('REFUSES to assign to a non-builder (a reviewer-only member) — assignee_not_builder, nothing written', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles(['qa_reviewer'])); // real grant map: qa_reviewer does NOT have story.execute
    await expect(assignBuildStory(input())).rejects.toMatchObject({ reason: 'assignee_not_builder' });
    expect(asCreate).not.toHaveBeenCalled();
    expect(asFindOne).not.toHaveBeenCalled();
  });

  it('REFUSES to assign to a non-member (no roles) — assignee_not_builder, nothing written', async () => {
    buildCtx.mockResolvedValue(ctxWithRoles([]));
    await expect(assignBuildStory(input())).rejects.toMatchObject({ reason: 'assignee_not_builder' });
    expect(asCreate).not.toHaveBeenCalled();
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
