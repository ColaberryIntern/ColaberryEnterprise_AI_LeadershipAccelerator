/**
 * Accepting the collaborator invitations students send us.
 *
 * The properties worth the most here:
 *
 *   - A LIVE INVITATION IS ACTUALLY ACCEPTED. Adding a collaborator on GitHub
 *     creates an invitation and grants nothing until it is accepted. Nothing in
 *     the platform ever accepted one, so every student who followed the
 *     instruction got a grant that did nothing — and the platform never
 *     delivered plan.json, progress.json or manifest.json to anybody.
 *
 *   - AN EXPIRED INVITATION IS NEVER PATCHED. This is the sharp edge. GitHub
 *     answers a PATCH on an expired invitation with 204 — success — while
 *     granting nothing and DESTROYING the record. So the status code lies twice,
 *     and the second lie is the expensive one: it removes the only evidence that
 *     the student ever invited us, which is what we need in order to go back and
 *     ask them to re-invite. Learned the hard way on Samrawit26/jobflow_Agent.
 *
 *   - A 204 IS NEVER TAKEN AS PROOF OF PUSH. The repo itself is re-read and
 *     `permissions.push` settles it, because a student can invite us as a reader
 *     and that accepts perfectly cleanly.
 */
const mockFetchRepoFacts = jest.fn();
const mockRequest = jest.fn();

jest.mock('../githubRepoClient', () => ({
  __esModule: true,
  ...jest.requireActual('../githubRepoClient'),
  githubApiRequest: (...a: any[]) => mockRequest(...a),
  isRateLimitedResult: () => false,
  fetchRepoFacts: (...a: any[]) => mockFetchRepoFacts(...a),
}));

import { acceptInvitationFor, listPendingInvitations, sweepPendingInvitations } from '../repoInvitations';

/** One invitation as GitHub shapes it, reduced to the fields we read. */
const invitation = (over: Record<string, unknown> = {}) => ({
  id: 329491655,
  permissions: 'write',
  created_at: '2026-08-18T03:14:47Z',
  expired: false,
  repository: {
    full_name: 'qninying/ai-operations-center',
    name: 'ai-operations-center',
    owner: { login: 'qninying' },
  },
  ...over,
});

const listReturns = (rows: unknown[]) => ({
  ok: true, status: 200, body: JSON.stringify(rows),
});

/** Every PATCH GitHub accepts answers 204 — including the ones that do nothing. */
const noContent = { ok: true, status: 204, body: '' };

const patchCalls = () => mockRequest.mock.calls.filter((c) => c[0] === 'PATCH');

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchRepoFacts.mockResolvedValue({ platform_can_push: true });
});

describe('listPendingInvitations', () => {
  it('reads the queue into the fields we act on', async () => {
    mockRequest.mockResolvedValueOnce(listReturns([invitation()]));
    const pending = await listPendingInvitations();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(329491655);
    expect(pending[0].full_name).toBe('qninying/ai-operations-center');
    expect(pending[0].expired).toBe(false);
  });

  it('returns nothing rather than throwing when GitHub will not answer', async () => {
    // This runs inside connect and inside sync. A housekeeping call that cannot
    // reach GitHub must never be the thing that fails either of them.
    mockRequest.mockResolvedValueOnce({ ok: false, status: 500, body: 'boom' });
    await expect(listPendingInvitations()).resolves.toEqual([]);
  });
});

describe('acceptInvitationFor — a live invitation', () => {
  it('accepts it, and reports the push access it actually bought', async () => {
    mockRequest
      .mockResolvedValueOnce(listReturns([invitation()]))
      .mockResolvedValueOnce(noContent);

    const result = await acceptInvitationFor('qninying', 'ai-operations-center');

    expect(result.outcome).toBe('accepted');
    expect(result.can_push).toBe(true);
    expect(patchCalls()).toHaveLength(1);
    expect(patchCalls()[0][1]).toBe('/user/repository_invitations/329491655');
  });

  it('does not believe the 204 — it re-reads the repo to find out what it got', async () => {
    // A `read` collaborator invitation accepts perfectly cleanly and leaves the
    // platform unable to commit. Reporting that as a plain success would rebuild
    // the original bug one level up.
    mockRequest
      .mockResolvedValueOnce(listReturns([invitation({ permissions: 'read' })]))
      .mockResolvedValueOnce(noContent);
    mockFetchRepoFacts.mockResolvedValue({ platform_can_push: false });

    const result = await acceptInvitationFor('qninying', 'ai-operations-center');

    expect(result.outcome).toBe('accepted_no_push');
    expect(result.can_push).toBe(false);
  });

  it('matches the repo case-insensitively, since GitHub owns the canonical casing', async () => {
    mockRequest
      .mockResolvedValueOnce(listReturns([invitation()]))
      .mockResolvedValueOnce(noContent);

    const result = await acceptInvitationFor('QNinying', 'AI-Operations-Center');

    expect(result.outcome).toBe('accepted');
  });

  it('leaves other students\' invitations alone', async () => {
    mockRequest.mockResolvedValueOnce(listReturns([invitation()]));

    const result = await acceptInvitationFor('someone-else', 'other-repo');

    expect(result.outcome).toBe('none');
    expect(patchCalls()).toHaveLength(0);
  });

  it('is a single read when the queue is empty, so it is free on every sync', async () => {
    mockRequest.mockResolvedValueOnce(listReturns([]));

    const result = await acceptInvitationFor('qninying', 'ai-operations-center');

    expect(result.outcome).toBe('none');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('reports a refused acceptance as failed rather than as a grant', async () => {
    mockRequest
      .mockResolvedValueOnce(listReturns([invitation()]))
      .mockResolvedValueOnce({ ok: false, status: 500, body: 'boom' });

    const result = await acceptInvitationFor('qninying', 'ai-operations-center');

    expect(result.outcome).toBe('failed');
    expect(result.can_push).toBe(false);
  });
});

describe('acceptInvitationFor — an EXPIRED invitation', () => {
  const expired = () => invitation({
    id: 326479690,
    expired: true,
    created_at: '2026-07-21T21:46:07Z',
    repository: {
      full_name: 'Samrawit26/jobflow_Agent',
      name: 'jobflow_Agent',
      owner: { login: 'Samrawit26' },
    },
  });

  /**
   * THE ONE THAT COST US A RECORD TO LEARN.
   *
   * PATCHing an expired invitation returns 204 and grants nothing, and GitHub
   * drops the invitation from the queue on the way through. The student's grant
   * then looks like it never happened to anyone who goes looking.
   */
  it('never PATCHes it — a 204 here would grant nothing and destroy the evidence', async () => {
    mockRequest.mockResolvedValueOnce(listReturns([expired()]));

    await acceptInvitationFor('Samrawit26', 'jobflow_Agent');

    expect(patchCalls()).toHaveLength(0);
  });

  it('reports it as expired so a human can ask the student to re-invite', async () => {
    mockRequest.mockResolvedValueOnce(listReturns([expired()]));

    const result = await acceptInvitationFor('Samrawit26', 'jobflow_Agent');

    expect(result.outcome).toBe('expired');
    expect(result.invitation_id).toBe(326479690);
    expect(result.can_push).toBe(false);
  });
});

describe('sweepPendingInvitations', () => {
  it('takes the live ones and quarantines the expired ones', async () => {
    const live = invitation();
    const dead = invitation({
      id: 326479690,
      expired: true,
      repository: {
        full_name: 'Samrawit26/jobflow_Agent',
        name: 'jobflow_Agent',
        owner: { login: 'Samrawit26' },
      },
    });
    // The sweep lists once, then acceptInvitationFor lists again per repo.
    mockRequest
      .mockResolvedValueOnce(listReturns([live, dead]))
      .mockResolvedValueOnce(listReturns([live, dead]))
      .mockResolvedValueOnce(noContent);

    const out = await sweepPendingInvitations();

    expect(out.accepted).toHaveLength(1);
    expect(out.accepted[0].full_name).toBe('qninying/ai-operations-center');
    expect(out.expired).toHaveLength(1);
    expect(out.expired[0].full_name).toBe('Samrawit26/jobflow_Agent');
    expect(patchCalls()).toHaveLength(1);
  });

  it('costs one request against an empty queue', async () => {
    mockRequest.mockResolvedValueOnce(listReturns([]));

    const out = await sweepPendingInvitations();

    expect(out.accepted).toHaveLength(0);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
