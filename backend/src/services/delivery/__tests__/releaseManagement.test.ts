import {
  approveRelease,
  waiveReleaseCheck,
  createReleaseCandidate,
  evaluateRelease,
  recordReleaseCheck,
} from '../releaseManagement';

/**
 * The first code path that consults Gate 13 and Gate 14.
 *
 * Both had zero production callers because `delivery_releases` did not exist — there was
 * no release to ask about. These cover the wiring; `releaseGate` and `profileResolution`
 * already have their own tests for the rules themselves.
 *
 * The profile key and check names here are the REAL ones. The first version of this
 * fixture used 'sandbox' and 'tests_pass', neither of which exists - the real keys are
 * commercial_standard / internal_tool / government_public_sector, and the checks are
 * tests / browser / security / and so on. Both were refused correctly; the fixture was
 * wrong, not the code.
 *
 * The assertions that matter are the ones about what is NOT written: a refused approval
 * must leave no approver behind, and a refused check must not be stored.
 */

const PROJECT = 'project-1';
const APPROVER = 'identity-approver';

function makeModels(opts: {
  project?: any;
  release?: any;
} = {}) {
  const created: any[] = [];
  const updates: any[] = [];
  const release = opts.release === undefined ? null : opts.release;
  return {
    created,
    updates,
    DeliveryProject: {
      findOne: async () =>
        opts.project === undefined ? { id: PROJECT, delivery_profile_key: 'internal_tool' } : opts.project,
    },
    DeliveryRelease: {
      findOne: async () => release,
      create: async (row: any) => {
        created.push(row);
        return { id: 'release-1', ...row };
      },
    },
  };
}

const makeRelease = (over: any = {}) => ({
  id: 'release-1',
  delivery_project_id: PROJECT,
  version: '1.0.0',
  status: 'candidate',
  profile_key: 'internal_tool',
  check_results: [],
  waived_categories: [],
  goals_scores: null,
  approved_by_identity_id: null,
  update: jest.fn(async function (this: any, patch: any) {
    Object.assign(this, patch);
  }),
  ...over,
});

describe('createReleaseCandidate', () => {
  it('REFUSES a project with no delivery profile rather than defaulting one', async () => {
    // Guessing a profile guesses which checks are mandatory. The strict guess blocks
    // ordinary sandbox work; the convenient one waves a regulated engagement through.
    const models = makeModels({ project: { id: PROJECT, delivery_profile_key: null } });
    const out = await createReleaseCandidate({ projectId: PROJECT, version: '1.0.0', models });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_profile_on_project');
    expect(models.created).toHaveLength(0);
  });

  it('stores the resolved profile ON the release', async () => {
    // So a later change to the project's profile cannot silently re-interpret a release
    // that was already judged.
    const models = makeModels();
    const out = await createReleaseCandidate({ projectId: PROJECT, version: '1.0.0', models });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.profileKey).toBe('internal_tool');
    expect(models.created[0].profile_key).toBe('internal_tool');
  });

  it('is idempotent on (project, version)', async () => {
    const models = makeModels({ release: makeRelease() });
    const out = await createReleaseCandidate({ projectId: PROJECT, version: '1.0.0', models });
    expect(out.ok).toBe(true);
    expect(models.created).toHaveLength(0);
  });
});

describe('recordReleaseCheck', () => {
  it('REFUSES an unknown check rather than storing it', async () => {
    // The gate reports an unknown check as a blocker, so storing one would write a row
    // that permanently blocks the release.
    const release = makeRelease();
    const out = await recordReleaseCheck({
      releaseId: 'release-1',
      check: 'not_a_real_check',
      outcome: 'pass',
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('unknown_check');
    expect(release.update).not.toHaveBeenCalled();
  });

  it('REPLACES a prior result for the same check rather than appending', async () => {
    // A check has one current answer. Keeping both would leave the gate choosing between
    // a pass and a fail for the same thing.
    const release = makeRelease({
      check_results: [{ check: 'tests', outcome: 'fail', detail: 'was failing' }],
    });
    const out = await recordReleaseCheck({
      releaseId: 'release-1',
      check: 'tests',
      outcome: 'pass',
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.checkCount).toBe(1);
    expect(release.check_results[0].outcome).toBe('pass');
  });
});

describe('approveRelease', () => {
  it('REFUSES when the gate is not ready, and writes NO approver', async () => {
    // The important half. A refused approval that still recorded an approver would show
    // a person signing off on something that never passed.
    const release = makeRelease({ check_results: [] });
    const out = await approveRelease({
      releaseId: 'release-1',
      approverIdentityId: APPROVER,
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('not_ready');
    expect(release.update).not.toHaveBeenCalled();
    expect(release.approved_by_identity_id).toBeNull();
  });

  it('is idempotent — a retried approval is not a second sign-off', async () => {
    const release = makeRelease({ status: 'approved', approved_by_identity_id: APPROVER });
    const out = await approveRelease({
      releaseId: 'release-1',
      approverIdentityId: 'someone-else',
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(true);
    // The original approver stands. A retry must not overwrite who signed.
    expect(release.approved_by_identity_id).toBe(APPROVER);
    expect(release.update).not.toHaveBeenCalled();
  });
});

describe('evaluateRelease', () => {
  it('evaluates with the STORED approver, never the caller', async () => {
    // Evaluating with the requester's id would make the gate's approver_missing rule
    // unreachable: every evaluation would appear to have an approver simply because
    // somebody asked.
    const release = makeRelease({ approved_by_identity_id: null });
    const out = await evaluateRelease({ releaseId: 'release-1', models: makeModels({ release }) });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.gate.ready).toBe(false);
      expect(out.gate.blockers.some((b) => b.rule === 'approver_missing')).toBe(true);
    }
  });
});
describe('waiveReleaseCheck — scenario D territory', () => {
  it('REFUSES a waiver with no reason and writes nothing', async () => {
    // The failure D exists to catch is not 'the gate does not block'. It is 'the gate
    // stopped blocking for a reason nobody can see afterwards'. An unjustified waiver is
    // indistinguishable later from the gate never having applied.
    const release = makeRelease();
    const out = await waiveReleaseCheck({
      releaseId: 'release-1',
      check: 'accessibility',
      reason: '   ',
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('waiver_needs_reason');
    expect(release.update).not.toHaveBeenCalled();
  });

  it('REFUSES to waive a check that does not exist', async () => {
    const release = makeRelease();
    const out = await waiveReleaseCheck({
      releaseId: 'release-1',
      check: 'not_a_real_check',
      reason: 'because',
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('unknown_check');
    expect(release.update).not.toHaveBeenCalled();
  });

  it('stores the reason WITH the check, not beside it', async () => {
    // Two parallel arrays that must stay aligned eventually do not.
    const release = makeRelease();
    const out = await waiveReleaseCheck({
      releaseId: 'release-1',
      check: 'accessibility',
      reason: 'Client accepted a documented WCAG exception for the legacy embed.',
      actorIdentityId: APPROVER,
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.waived[0].check).toBe('accessibility');
      expect(out.waived[0].reason).toContain('WCAG');
      expect(out.waived[0].waivedByIdentityId).toBe(APPROVER);
    }
  });

  it('moves the check into WAIVED, never into passed', async () => {
    // The whole observable of scenario D. A waiver that folded into `passed` would make a
    // waived release indistinguishable from one that genuinely met the bar.
    // accessibility is mandatory ONLY under government_public_sector, which is the
    // profile scenario D is about. Under internal_tool the waiver would be a no-op and
    // this test would assert nothing.
    const release = makeRelease({
      profile_key: 'government_public_sector',
      waived_categories: [
        { check: 'accessibility', reason: 'documented exception', waivedByIdentityId: null, waivedAt: 'x' },
      ],
    });
    const out = await evaluateRelease({ releaseId: 'release-1', models: makeModels({ release }) });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.gate.waived).toContain('accessibility');
      expect(out.gate.passed).not.toContain('accessibility');
    }
  });

  it('replaces a prior waiver of the same check rather than stacking', async () => {
    const release = makeRelease({
      waived_categories: [
        { check: 'accessibility', reason: 'first', waivedByIdentityId: null, waivedAt: 'x' },
      ],
    });
    const out = await waiveReleaseCheck({
      releaseId: 'release-1', check: 'accessibility', reason: 'second and better',
      models: makeModels({ release }),
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.waived).toHaveLength(1);
      expect(out.waived[0].reason).toBe('second and better');
    }
  });

  it('still accepts a legacy bare-string waiver', async () => {
    // The column shipped holding plain strings. A row written before this change must not
    // start throwing on read.
    const release = makeRelease({
      profile_key: 'government_public_sector',
      waived_categories: ['accessibility'],
    });
    const out = await evaluateRelease({ releaseId: 'release-1', models: makeModels({ release }) });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.gate.waived).toContain('accessibility');
  });
});
