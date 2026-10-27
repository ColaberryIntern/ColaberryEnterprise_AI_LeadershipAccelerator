const query = jest.fn();

jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a) },
}));
// Mocked only so the import chain resolves: the service imports its status constants from
// `agentEmailTool`, which reaches the models and the safety service. Nothing here is asserted.
jest.mock('../../../../models', () => ({ AiAgent: { findOne: jest.fn() } }));
jest.mock('../../../communicationSafetyService', () => ({ evaluateSend: jest.fn() }));

import {
  getAgentEmailInbox, approveAgentDraft, discardAgentDraft, AGENT_APPROVED_STATUS,
} from '../agentEmailInboxService';
import { AGENT_DRAFT_STATUS, AGENT_EMAIL_TOOL } from '../agentEmailTool';

/**
 * The agent's own mail, on her dashboard.
 *
 * WHY IT MATTERS MORE THAN A LIST VIEW USUALLY DOES: `agentEmailTool` fails closed, so every
 * uncertainty becomes an `agent_draft` row. Before this service those rows had nowhere to be seen,
 * which makes the safety argument for drafting-instead-of-sending hollow - a queue nobody opens is
 * a silent accumulation.
 *
 * The assertions in rough order of what they would cost to get wrong:
 *
 *  1. NO TRANSITION EVER PRODUCES `'pending'`. That is the only status the sender claims, so a
 *     review action that wrote it would turn "a human looked at this" into "it went out".
 *  2. Approval DOES NOT SEND - it flips status and records who, matching the repo's own stated
 *     precedent in `approvalApply.ts`.
 *  3. Drafts are scoped to ONE agent, so one agent's dashboard cannot show another's mail.
 *  4. The inbound panel reports WHY it is unavailable instead of returning an empty list.
 */

const AGENT = 'AdmissionsAssistantAgent';

function draftRow(over: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    to_email: 'dana@example.com',
    subject: 'Following up',
    body: 'Hello Dana,',
    status: AGENT_DRAFT_STATUS,
    created_at: '2026-10-26T12:00:00.000Z',
    metadata: { agent_name: AGENT, draft_reason: 'autonomy_insufficient:observe', tool: AGENT_EMAIL_TOOL },
    ...over,
  };
}

/** The bind values of the Nth query. */
function bindOf(n: number): Record<string, unknown> {
  return (query.mock.calls[n][1] as { bind: Record<string, unknown> }).bind;
}
function sqlOf(n: number): string {
  return query.mock.calls[n][0] as string;
}

beforeEach(() => {
  query.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reading the inbox', () => {
  it('returns drafts scoped to this agent and this tool', async () => {
    query.mockResolvedValueOnce([draftRow()]).mockResolvedValueOnce([]);

    const inbox = await getAgentEmailInbox(AGENT);

    expect(inbox.drafts).toHaveLength(1);
    expect(inbox.drafts[0]).toMatchObject({
      id: 'draft-1',
      toEmail: 'dana@example.com',
      subject: 'Following up',
      draftReason: 'autonomy_insufficient:observe',
    });
    // Both the agent AND the tool are in the filter: without the tool filter this would show any
    // row that happened to carry an `agent_name`.
    expect(bindOf(0)).toMatchObject({ agentName: AGENT, tool: AGENT_EMAIL_TOOL });
  });

  it('shows approved drafts too, so an approval does not vanish from the queue', async () => {
    query.mockResolvedValueOnce([draftRow({ status: AGENT_APPROVED_STATUS })]).mockResolvedValueOnce([]);

    const inbox = await getAgentEmailInbox(AGENT);

    expect(inbox.drafts[0].status).toBe(AGENT_APPROVED_STATUS);
    expect(bindOf(0)).toMatchObject({ approvedStatus: AGENT_APPROVED_STATUS });
  });

  it('surfaces the approver once there is one', async () => {
    query.mockResolvedValueOnce([draftRow({
      status: AGENT_APPROVED_STATUS,
      metadata: { agent_name: AGENT, tool: AGENT_EMAIL_TOOL, approved_by: 'ali@colaberry.com' },
    })]).mockResolvedValueOnce([]);

    expect((await getAgentEmailInbox(AGENT)).drafts[0].approvedBy).toBe('ali@colaberry.com');
  });

  it('REPORTS why inbound is unavailable instead of returning an empty list', async () => {
    query.mockResolvedValue([]);

    const inbox = await getAgentEmailInbox(AGENT);

    // "no address to be replied to" and "nobody replied" lead to opposite actions.
    expect(inbox.inbound.reason).toBe('no_agent_address');
    expect(inbox.inbound.items).toEqual([]);
  });

  it('survives a read failure without throwing, and reports empty rather than partial truth', async () => {
    query.mockRejectedValue(new Error('db down'));

    const inbox = await getAgentEmailInbox(AGENT);

    expect(inbox.drafts).toEqual([]);
    expect(inbox.sent).toEqual([]);
  });

  it('maps sent history, including a failure reason', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      id: 'log-1', to_address: 'dana@example.com', subject: 'Hi', status: 'failed',
      sent_at: null, error_message: 'smtp refused',
    }]);

    const inbox = await getAgentEmailInbox(AGENT);

    expect(inbox.sent[0]).toMatchObject({
      status: 'failed', sentAt: null, errorMessage: 'smtp refused',
    });
  });
});

describe('approval, which never sends', () => {
  it('flips agent_draft to agent_approved and records who', async () => {
    query.mockResolvedValue([[], 1]);

    const r = await approveAgentDraft('draft-1', 'ali@colaberry.com');

    expect(r).toEqual({ ok: true, reason: null });
    expect(bindOf(0)).toMatchObject({
      draftId: 'draft-1',
      from: AGENT_DRAFT_STATUS,
      to: AGENT_APPROVED_STATUS,
      actor: 'ali@colaberry.com',
    });
  });

  it('NEVER writes pending, which is the only status the sender claims', async () => {
    query.mockResolvedValue([[], 1]);

    await approveAgentDraft('draft-1', 'ali@colaberry.com');
    await discardAgentDraft('draft-2', 'ali@colaberry.com');

    for (let i = 0; i < query.mock.calls.length; i += 1) {
      expect(bindOf(i).to).not.toBe('pending');
      expect(sqlOf(i)).not.toMatch(/'pending'/);
    }
  });

  it('is guarded on the current status inside the UPDATE, not read-then-write', async () => {
    query.mockResolvedValue([[], 1]);
    await approveAgentDraft('draft-1', 'ali@colaberry.com');

    // Two reviewers clicking at once must not both succeed; the WHERE does that, and the
    // affected-row count is the answer.
    expect(sqlOf(0)).toMatch(/AND status = \$from/);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses a second approval, because the row is no longer a draft', async () => {
    query.mockResolvedValue([[], 0]);

    expect(await approveAgentDraft('draft-1', 'ali@colaberry.com'))
      .toEqual({ ok: false, reason: 'not_in_expected_state' });
  });

  it('requires an approver, since who said yes is the point', async () => {
    const r = await approveAgentDraft('draft-1', '');

    expect(r).toEqual({ ok: false, reason: 'approver_required' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports a failed transition rather than throwing', async () => {
    query.mockRejectedValue(new Error('update failed'));

    expect(await approveAgentDraft('draft-1', 'ali@colaberry.com'))
      .toEqual({ ok: false, reason: 'transition_failed' });
  });
});

describe('discarding', () => {
  it('cancels rather than inventing a fourth status', async () => {
    query.mockResolvedValue([[], 1]);

    const r = await discardAgentDraft('draft-1', 'ali@colaberry.com');

    expect(r.ok).toBe(true);
    expect(bindOf(0)).toMatchObject({ to: 'cancelled', from: AGENT_DRAFT_STATUS });
  });

  it('cannot revive an already-decided draft', async () => {
    query.mockResolvedValue([[], 0]);
    expect((await discardAgentDraft('draft-1', 'ali@colaberry.com')).ok).toBe(false);
  });
});
