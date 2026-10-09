import {
  compareBlueprintRevisions,
  requestBlueprintChanges,
  formatChangeRequest,
  parseChangeRequest,
  CHANGE_REQUEST_PERMISSION,
  ChangeRequestRefused,
} from '../blueprintChangeRequest';
import { AUTHORIZATION_STAGE } from '../lifecycleStages';
import { STAGE_PERMISSION } from '../lifecycleTransition';
import { rolesWithDeliveryPermission } from '../../../modules/delivery/deliveryRoles';
import { emptyRefs } from '../adapters/manifestRefs';

jest.mock('../lifecycleStatus', () => ({
  __esModule: true,
  loadAndAuthorize: jest.fn(),
}));
jest.mock('../../../models/OperatingBlueprintManifest', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));
jest.mock('../../../models/ProjectLifecycleState', () => ({
  __esModule: true,
  default: { update: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { loadAndAuthorize } = require('../lifecycleStatus') as { loadAndAuthorize: jest.Mock };
const Manifest = require('../../../models/OperatingBlueprintManifest').default as { findAll: jest.Mock };
const LifecycleState = require('../../../models/ProjectLifecycleState').default as { update: jest.Mock };
/* eslint-enable @typescript-eslint/no-var-requires */

/**
 * The roles are DERIVED from the registry, not named here.
 *
 * `rolesWithDeliveryPermission` is the inverse added by P5-T2. Hardcoding "architect" would make
 * this test assert the grant table's contents by accident, and it would start passing for the
 * wrong reason the day that role's grants changed.
 */
const APPROVER = rolesWithDeliveryPermission(CHANGE_REQUEST_PERMISSION)[0];
const NON_APPROVER = rolesWithDeliveryPermission('project.read')
  .find((r) => !rolesWithDeliveryPermission(CHANGE_REQUEST_PERMISSION).includes(r))!;

const admin = (role: string) => ({ id: 'a-1', email: 'reviewer@example.test', role });

const refsWith = (over: (r: Record<string, any>) => void) => {
  const r = emptyRefs('sbp', 'p-1') as unknown as Record<string, any>;
  over(r);
  return r;
};

const manifestRow = (revision: number, refs: unknown, over: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = {
    id: `m-${revision}`, revision, status: 'approved',
    content_sha256: `sha-${revision}`, refs_json: refs, ...over,
  };
  return { get: (k: string) => data[k] };
};

const lifecycleRow = (over: Record<string, unknown> = {}) => ({
  id: 'lc-1', tenant_id: 't-1',
  student_project_id: 'p-1', delivery_project_id: null,
  stage: 'awaiting_blueprint_approval', condition: null, condition_reason: null,
  ...over,
});

beforeEach(() => {
  loadAndAuthorize.mockReset();
  Manifest.findAll.mockReset();
  LifecycleState.update.mockReset();
  LifecycleState.update.mockResolvedValue([1]);
  loadAndAuthorize.mockResolvedValue(lifecycleRow());
});

const compare = (over: Record<string, unknown> = {}) => compareBlueprintRevisions({
  projectId: 'p-1', kind: 'student', admin: admin(APPROVER), ...over,
} as any);

describe('the authority to request changes is DERIVED from the approval stage', () => {
  it('is the same permission approving the blueprint needs', () => {
    expect(CHANGE_REQUEST_PERMISSION).toBe(STAGE_PERMISSION[AUTHORIZATION_STAGE]);
    // Pinned to a real value too, so the derivation cannot quietly become `undefined`.
    expect(CHANGE_REQUEST_PERMISSION).toBe('contract.approve');
  });

  it('the derived fixtures are non-empty, or every permission test below is vacuous', () => {
    expect(APPROVER).toBeTruthy();
    expect(NON_APPROVER).toBeTruthy();
    expect(APPROVER).not.toBe(NON_APPROVER);
  });
});

describe('comparing revisions', () => {
  it('compares the newest two when none are named', async () => {
    Manifest.findAll.mockResolvedValue([
      manifestRow(2, refsWith((r) => { r.sources = [{ id: 'req-1', revision: 2, source: 's' }]; })),
      manifestRow(1, refsWith((r) => { r.sources = [{ id: 'req-1', revision: 1, source: 's' }]; })),
    ]);
    const out = await compare();
    expect(out.state).toBe('compared');
    if (out.state !== 'compared') throw new Error('unreachable');
    // Oldest of the pair is `from`, newest is `to` — "what changed since the one I approved".
    expect(out.from.revision).toBe(1);
    expect(out.to.revision).toBe(2);
    expect(out.diff.changed).toBe(true);
    expect(out.diff.collections.find((c) => c.collection === 'sources')!.revised).toEqual(['req-1']);
  });

  it('reports an unchanged pair as compared-and-unchanged, not as an error', async () => {
    const refs = refsWith((r) => { r.sources = [{ id: 'req-1', revision: 1, source: 's' }]; });
    Manifest.findAll.mockResolvedValue([manifestRow(2, refs), manifestRow(1, refs)]);
    const out = await compare();
    if (out.state !== 'compared') throw new Error('expected compared');
    expect(out.diff.changed).toBe(false);
    expect(out.diff.unreadable).toEqual([]);
  });

  it('SINGLE REVISION is its own state, never an empty diff', async () => {
    // "Nothing to compare against" and "nothing changed" lead to different actions. A reviewer
    // shown an all-clear screen for a blueprint that was never revised would approve a
    // comparison that did not happen.
    Manifest.findAll.mockResolvedValue([manifestRow(1, emptyRefs('sbp', 'p-1'))]);
    const out = await compare();
    expect(out.state).toBe('single_revision');
    if (out.state !== 'single_revision') throw new Error('unreachable');
    expect(out.only.revision).toBe(1);
  });

  it('says no_manifest when the project has no blueprint at all', async () => {
    Manifest.findAll.mockResolvedValue([]);
    expect((await compare()).state).toBe('no_manifest');
  });

  it('says no_manifest when there is no lifecycle row', async () => {
    loadAndAuthorize.mockResolvedValue(null);
    expect((await compare()).state).toBe('no_manifest');
    expect(Manifest.findAll).not.toHaveBeenCalled();
  });

  it('compares the two revisions NAMED, not the newest two', async () => {
    Manifest.findAll.mockResolvedValue([
      manifestRow(3, refsWith((r) => { r.policies = [{ id: 'pol', revision: 3, source: 's' }]; })),
      manifestRow(2, refsWith((r) => { r.policies = [{ id: 'pol', revision: 2, source: 's' }]; })),
      manifestRow(1, refsWith((r) => { r.policies = [{ id: 'pol', revision: 1, source: 's' }]; })),
    ]);
    const out = await compare({ fromRevision: 1, toRevision: 3 });
    if (out.state !== 'compared') throw new Error('expected compared');
    expect([out.from.revision, out.to.revision]).toEqual([1, 3]);
  });

  it('refuses a revision that does not exist and lists the ones that do', async () => {
    Manifest.findAll.mockResolvedValue([manifestRow(2, emptyRefs('sbp', 'p-1')), manifestRow(1, emptyRefs('sbp', 'p-1'))]);
    const out = await compare({ fromRevision: 1, toRevision: 9 });
    expect(out.state).toBe('revision_not_found');
    if (out.state !== 'revision_not_found') throw new Error('unreachable');
    // The available list is what makes the refusal actionable.
    expect(out.available).toEqual([2, 1]);
    expect(out.requested).toEqual([1, 9]);
  });

  it('refuses a HALF-NAMED pair instead of defaulting the other side', async () => {
    // Defaulting would compare against a revision the caller never named, and the response would
    // look like the comparison they asked for.
    Manifest.findAll.mockResolvedValue([manifestRow(2, emptyRefs('sbp', 'p-1')), manifestRow(1, emptyRefs('sbp', 'p-1'))]);
    const out = await compare({ fromRevision: 1 });
    expect(out.state).toBe('revision_not_found');
    if (out.state !== 'revision_not_found') throw new Error('unreachable');
    expect(out.requested).toEqual([1]);
  });

  it('scopes the manifest lookup to the lifecycle row tenant and the right id column', async () => {
    Manifest.findAll.mockResolvedValue([]);
    await compare();
    expect(Manifest.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 't-1', student_project_id: 'p-1' },
    }));
    Manifest.findAll.mockClear();
    await compareBlueprintRevisions({ projectId: 'd-9', kind: 'delivery', admin: admin(APPROVER) });
    expect(Manifest.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 't-1', delivery_project_id: 'd-9' },
    }));
  });
});

describe('the persisted reason ROUND-TRIPS, which is why the revision survives', () => {
  // Rule 1: the claim is quantified over free text, so it ships with a generator.
  const TEXTS = [
    'add acceptance criteria',
    'colons: everywhere: like this',
    'line one\nline two\n',
    '  leading and trailing  ',
    'CHANGES_REQUESTED r5: text that looks like the format itself',
    'r3: not the prefix',
    '',
    'unicode — em dash, quotes “x”, emoji ✅',
  ];

  it('parses back exactly what it formatted, for every generated text', () => {
    const broken: string[] = [];
    for (const text of TEXTS) {
      for (const revision of [1, 7, 1234]) {
        const parsed = parseChangeRequest(formatChangeRequest(revision, text));
        if (!parsed || parsed.revision !== revision || parsed.text !== text) broken.push(`r${revision} ${JSON.stringify(text)}`);
      }
    }
    // Named, not counted: which text broke is the only useful output.
    expect(broken).toEqual([]);
    expect(TEXTS.length).toBe(8);
  });

  it('returns null for a reason this service did not write', () => {
    // A transition records its own free-text reason in the same column. Defaulting instead of
    // returning null would make every blocked project look like changes were requested on r0.
    expect(parseChangeRequest('Returned for rework by the architect')).toBeNull();
    expect(parseChangeRequest(null)).toBeNull();
    expect(parseChangeRequest('CHANGES_REQUESTED rX: bad revision')).toBeNull();
  });
});

describe('requesting changes', () => {
  const requestChanges = (over: Record<string, unknown> = {}) => requestBlueprintChanges({
    projectId: 'p-1', kind: 'student', revision: 2, text: 'tighten the acceptance criteria',
    admin: admin(APPROVER), ...over,
  } as any);

  beforeEach(() => {
    Manifest.findAll.mockResolvedValue([manifestRow(2, emptyRefs('sbp', 'p-1')), manifestRow(1, emptyRefs('sbp', 'p-1'))]);
  });

  it('writes awaiting_input with the structured reason', async () => {
    const out = await requestChanges();
    expect(out.applied).toBe(true);
    expect(LifecycleState.update).toHaveBeenCalledTimes(1);
    const [values, options] = LifecycleState.update.mock.calls[0];
    expect(values).toEqual({
      condition: 'awaiting_input',
      condition_reason: 'CHANGES_REQUESTED r2: tighten the acceptance criteria',
    });
    // Scoped by id only. Scoping by stage as well would make the write vanish whenever a
    // transition landed first, and requesting changes does not move the project.
    expect(options).toEqual({ where: { id: 'lc-1' } });
  });

  it('IS IDEMPOTENT: an identical resubmit changes nothing and says so', async () => {
    loadAndAuthorize.mockResolvedValue(lifecycleRow({
      condition: 'awaiting_input',
      condition_reason: 'CHANGES_REQUESTED r2: tighten the acceptance criteria',
    }));
    const out = await requestChanges();
    expect(out.applied).toBe(false);
    expect(LifecycleState.update).not.toHaveBeenCalled();
  });

  it('a SAME-TEXT request against a DIFFERENT revision is a new request', async () => {
    // The structural part. Free text alone could not tell these apart, so the second request
    // would have been dropped as a duplicate of the first.
    loadAndAuthorize.mockResolvedValue(lifecycleRow({
      condition: 'awaiting_input',
      condition_reason: 'CHANGES_REQUESTED r1: tighten the acceptance criteria',
    }));
    const out = await requestChanges({ revision: 2 });
    expect(out.applied).toBe(true);
    expect(LifecycleState.update).toHaveBeenCalledTimes(1);
  });

  it('a different text against the same revision is a new request', async () => {
    loadAndAuthorize.mockResolvedValue(lifecycleRow({
      condition: 'awaiting_input',
      condition_reason: 'CHANGES_REQUESTED r2: something else entirely',
    }));
    expect((await requestChanges()).applied).toBe(true);
  });

  it('the same reason under a DIFFERENT condition still applies', async () => {
    // `blocked` with this reason is not "changes requested". Treating the reason alone as the
    // key would leave the project blocked and report the request as already made.
    loadAndAuthorize.mockResolvedValue(lifecycleRow({
      condition: 'blocked',
      condition_reason: 'CHANGES_REQUESTED r2: tighten the acceptance criteria',
    }));
    expect((await requestChanges()).applied).toBe(true);
  });

  it('refuses a caller without the approval permission', async () => {
    await expect(requestChanges({ admin: admin(NON_APPROVER) }))
      .rejects.toMatchObject({ name: 'ChangeRequestRefused', status: 403, refusal: 'insufficient_permission' });
    expect(LifecycleState.update).not.toHaveBeenCalled();
  });

  it('refuses a caller with no identity at all', async () => {
    await expect(requestChanges({ admin: undefined })).rejects.toBeInstanceOf(ChangeRequestRefused);
    expect(LifecycleState.update).not.toHaveBeenCalled();
  });

  it('refuses a revision that does not exist rather than recording an untraceable reason', async () => {
    await expect(requestChanges({ revision: 99 }))
      .rejects.toMatchObject({ status: 404, refusal: 'revision_not_found' });
    expect(LifecycleState.update).not.toHaveBeenCalled();
  });

  it('refuses when the project has no lifecycle row', async () => {
    loadAndAuthorize.mockResolvedValue(null);
    await expect(requestChanges()).rejects.toMatchObject({ status: 404, refusal: 'no_lifecycle_row' });
    expect(LifecycleState.update).not.toHaveBeenCalled();
  });

  it('runs the AUDITED guard with write intent, not read', async () => {
    await requestChanges();
    expect(loadAndAuthorize).toHaveBeenCalledWith('p-1', 'student', expect.anything(), 'write');
  });

  it('compares with READ intent, so a reviewer who may only look is not recorded as a writer', async () => {
    Manifest.findAll.mockResolvedValue([]);
    await compare();
    expect(loadAndAuthorize).toHaveBeenCalledWith('p-1', 'student', expect.anything(), 'read');
  });
});
