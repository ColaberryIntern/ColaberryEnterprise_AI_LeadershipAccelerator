import { recordClientAcceptance } from '../clientAcceptance';

/**
 * Scenario B's second half, which had no writer.
 *
 * `clientAcceptanceService.ts` was pure logic imported only by its own test, so nothing
 * ever wrote a `delivery_client_acceptances` row. B's observable is a row whose snapshots
 * match **what the client actually saw** — and the assertions that matter here are the ones
 * proving the client did not get to say what that was.
 */

const PROJECT = 'project-1';
const CLIENT = 'identity-client';

function makeModels(opts: { release?: any; story?: any; evidence?: any[]; existing?: any } = {}) {
  const created: any[] = [];
  return {
    created,
    DeliveryRelease: {
      findOne: async () =>
        opts.release === undefined
          ? {
              id: 'release-1', delivery_project_id: PROJECT, version: '2.1.0',
              status: 'approved', candidate_sha: 'abc123',
              check_results: [{ check: 'tests', outcome: 'pass' }],
              waived_categories: [{ check: 'accessibility', reason: 'documented exception' }],
            }
          : opts.release,
    },
    DeliveryStory: {
      findOne: async () =>
        opts.story === undefined
          ? {
              id: 'story-1', delivery_project_id: PROJECT, story_key: 'S-1',
              contract: { acceptance: ['The export downloads.', 'Rows match the page.'] },
            }
          : opts.story,
    },
    DeliveryEvidence: { findAll: async () => opts.evidence ?? [] },
    DeliveryClientAcceptance: {
      findOne: async () => opts.existing ?? null,
      create: async (row: any) => {
        created.push(row);
        return { id: 'acceptance-1', ...row };
      },
    },
  };
}

const accept = (over: any = {}) => ({
  projectId: PROJECT,
  scopeKind: 'release',
  releaseId: 'release-1',
  status: 'accepted',
  acceptedByIdentityId: CLIENT,
  ...over,
});

describe('the snapshot is built server-side', () => {
  it('records what the system holds, not what the request sent', async () => {
    // There is no parameter for promisedAcceptance or evidenceSummary, which is the point:
    // an acceptance is only worth keeping if it pins what was actually put in front of the
    // client. If the signer supplies it, the record answers nothing.
    const models = makeModels();
    const out = await recordClientAcceptance({ ...accept(), models } as any);
    expect(out.ok).toBe(true);
    expect(models.created[0].promised_acceptance).toEqual([{ check: 'tests', outcome: 'pass' }]);
    expect(models.created[0].preview_ref).toBe('sha:abc123');
  });

  it('carries a WAIVER into the snapshot the client signed', async () => {
    // A client accepting a release with a waived check should have that on the record they
    // signed, not only on the release row where it can be read separately later.
    const models = makeModels();
    const out = await recordClientAcceptance({ ...accept(), models } as any);
    expect(out.ok).toBe(true);
    const summary = JSON.stringify(models.created[0].evidence_summary);
    expect(summary).toContain('waiver');
    expect(summary).toContain('documented exception');
  });

  it('snapshots a STORY from its stored contract, not the live story', async () => {
    // A later edit to the story must not change what the client is recorded as accepting.
    const models = makeModels();
    const out = await recordClientAcceptance({
      ...accept({ scopeKind: 'story', releaseId: null, storyId: 'story-1' }),
      models,
    } as any);
    expect(out.ok).toBe(true);
    expect(models.created[0].promised_acceptance).toEqual([
      'The export downloads.',
      'Rows match the page.',
    ]);
    expect(models.created[0].preview_ref).toBe('story:S-1');
  });

  it('summarises the evidence that exists for the story', async () => {
    const models = makeModels({
      evidence: [
        { dimension: 'browser', evidence_type: 'browser_run', outcome: 'pass', created_at: new Date() },
      ],
    });
    const out = await recordClientAcceptance({
      ...accept({ scopeKind: 'story', releaseId: null, storyId: 'story-1' }),
      models,
    } as any);
    expect(out.ok).toBe(true);
    expect(models.created[0].evidence_summary[0].evidenceType).toBe('browser_run');
  });
});

describe('refusals', () => {
  it('REFUSES an acceptance against a release that is not on this project', async () => {
    // A signature on nothing.
    const models = makeModels({ release: null });
    const out = await recordClientAcceptance({ ...accept(), models } as any);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_such_scope');
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES an acceptance the validator says would mean nothing, writing no row', async () => {
    // An acceptance that failed validation but left a row behind would read later as a
    // real sign-off.
    const models = makeModels();
    const out = await recordClientAcceptance({
      ...accept({ acceptedByIdentityId: null }),
      models,
    } as any);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('invalid');
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES accepted_with_exceptions when no exceptions are given', async () => {
    // The middle state exists so open items survive the sign-off. Empty, it is just
    // "accepted" wearing a hedge.
    const models = makeModels();
    const out = await recordClientAcceptance({
      ...accept({ status: 'accepted_with_exceptions', exceptions: [] }),
      models,
    } as any);
    expect(out.ok).toBe(false);
    expect(models.created).toHaveLength(0);
  });
});

describe('idempotency', () => {
  it('a client clicking twice has not accepted twice', async () => {
    // A second row would make it ambiguous which decision is current.
    const models = makeModels({
      existing: {
        id: 'acceptance-existing', status: 'accepted',
        promised_acceptance: [], preview_ref: 'sha:abc123', evidence_summary: [],
      },
    });
    const out = await recordClientAcceptance({ ...accept(), models } as any);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.acceptanceId).toBe('acceptance-existing');
    expect(models.created).toHaveLength(0);
  });
});
