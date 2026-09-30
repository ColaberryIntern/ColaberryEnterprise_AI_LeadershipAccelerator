import { claimFromEvidence, ledgerFor } from '../experienceClaims';

/**
 * The first caller of Gate 11's Experience Ledger, which had no table and so could never
 * earn anything.
 *
 * The two assertions worth the most here are about the ways a claim could be earned
 * dishonestly: by describing the evidence yourself, and by saying nothing about whether you
 * did the work.
 */

const BUILDER = 'identity-builder';
const EVIDENCE = 'evidence-1';
const PROJECT = 'project-1';

function makeModels(opts: { evidence?: any; existing?: any } = {}) {
  const created: any[] = [];
  return {
    created,
    DeliveryEvidence: {
      findOne: async () =>
        opts.evidence === undefined
          ? {
              id: EVIDENCE,
              delivery_project_id: PROJECT,
              evidence_type: 'pull_request',
              outcome: 'pass',
            }
          : opts.evidence,
    },
    DeliveryExperienceClaim: {
      findOne: async () => opts.existing ?? null,
      findAll: async () => opts.existing ?? [],
      create: async (row: any) => {
        created.push(row);
        return { id: 'claim-1', ...row };
      },
    },
  };
}

const earn = (over: any = {}) => ({
  builderIdentityId: BUILDER,
  claimType: 'requirements_authored',
  evidenceId: EVIDENCE,
  builderDidTheWork: true,
  ...over,
});

describe('claimFromEvidence', () => {
  it('earns a claim from real, passing evidence', async () => {
    const models = makeModels();
    const out = await claimFromEvidence({ ...earn(), models });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.claimType).toBe('requirements_authored');
      expect(out.band).toBe('application');
    }
    expect(models.created[0].evidence_id).toBe(EVIDENCE);
  });

  it('takes the evidence type and outcome from the ROW, never the caller', async () => {
    // The load-bearing rule. A caller that could describe its own evidence could
    // substantiate anything, and the ledger would record claims about a world it was told
    // existed. Here the caller lies and the row tells the truth.
    const models = makeModels({
      evidence: {
        id: EVIDENCE, delivery_project_id: PROJECT,
        evidence_type: 'pull_request', outcome: 'fail',
      },
    });
    const out = await claimFromEvidence({
      ...earn(),
      // Ignored — there is no parameter for these, which is the point.
      models,
    } as any);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.rejections?.some((r) => r.rule === 'evidence_not_passing')).toBe(true);
    }
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES a claim with no attestation, rather than treating silence as yes', async () => {
    // evaluateClaim rejects an explicit false but an OMITTED value passes its check, so
    // this is the one door the pure rule leaves open. Credit for attendance is exactly
    // what §Gate 11 forbids.
    const models = makeModels();
    const out = await claimFromEvidence({ ...earn({ builderDidTheWork: undefined }), models } as any);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('attestation_required');
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES attendance-only work, and says so', async () => {
    const models = makeModels();
    const out = await claimFromEvidence({ ...earn({ builderDidTheWork: false }), models });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.rejections?.some((r) => r.rule === 'attendance_only')).toBe(true);
    }
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES evidence that cannot substantiate the claim type', async () => {
    // A pull request does not evidence an architecture decision.
    const models = makeModels();
    const out = await claimFromEvidence({
      ...earn({ claimType: 'architecture_decisions', humanConfirmed: true }),
      models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.rejections?.some((r) => r.rule === 'evidence_cannot_substantiate')).toBe(true);
    }
  });

  it('REFUSES a judgment-band claim with no human behind it', async () => {
    const models = makeModels({
      evidence: {
        id: EVIDENCE, delivery_project_id: PROJECT,
        evidence_type: 'architecture_review', outcome: 'pass',
      },
    });
    const out = await claimFromEvidence({
      ...earn({ claimType: 'architecture_decisions', humanConfirmed: false }),
      models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.rejections?.some((r) => r.rule === 'human_confirmation_missing')).toBe(true);
    }
  });

  it('earns a judgment-band claim once a person stands behind it', async () => {
    const models = makeModels({
      evidence: {
        id: EVIDENCE, delivery_project_id: PROJECT,
        evidence_type: 'architecture_review', outcome: 'pass',
      },
    });
    const out = await claimFromEvidence({
      ...earn({ claimType: 'architecture_decisions', humanConfirmed: true }),
      attestedByIdentityId: 'identity-mentor',
      models,
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.band).toBe('judgment');
    expect(models.created[0].attested_by_identity_id).toBe('identity-mentor');
  });

  it('REFUSES an unknown claim type', async () => {
    const models = makeModels();
    const out = await claimFromEvidence({ ...earn({ claimType: 'vibes' }), models });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.rejections?.some((r) => r.rule === 'unknown_claim_type')).toBe(true);
    }
  });

  it('REFUSES a claim against evidence that does not exist', async () => {
    const models = makeModels({ evidence: null });
    const out = await claimFromEvidence({ ...earn(), models });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_such_evidence');
  });

  it('is idempotent — replaying a claim is not a second achievement', async () => {
    // Without this a single passing test run could be claimed repeatedly and the ledger
    // would inflate on replay alone.
    const models = makeModels({
      existing: { id: 'claim-existing', claim_type: 'requirements_authored', band: 'application' },
    });
    const out = await claimFromEvidence({ ...earn(), models });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.created).toBe(false);
      expect(out.claimId).toBe('claim-existing');
    }
    expect(models.created).toHaveLength(0);
  });
});

describe('ledgerFor', () => {
  it('replays stored claims through the CURRENT rules rather than counting rows', async () => {
    // If a rubric tightens, the summary should reflect the rules as they are now instead of
    // standing on a verdict recorded under an older version of them.
    const models = makeModels({
      existing: [
        {
          id: 'c1', claim_type: 'requirements_authored', band: 'application',
          evidence_id: EVIDENCE, evidence_type: 'pull_request', evidence_outcome: 'pass',
          human_confirmed: false, builder_did_the_work: true, created_at: new Date(),
        },
        {
          // Stored, but no longer earns anything: attendance only.
          id: 'c2', claim_type: 'requirements_authored', band: 'application',
          evidence_id: 'evidence-2', evidence_type: 'pull_request', evidence_outcome: 'pass',
          human_confirmed: false, builder_did_the_work: false, created_at: new Date(),
        },
      ],
    });
    const out = await ledgerFor({ builderIdentityId: BUILDER, models });
    expect(out.claims).toHaveLength(2);
    expect(out.earnedByType.requirements_authored).toBe(1);
  });
});
