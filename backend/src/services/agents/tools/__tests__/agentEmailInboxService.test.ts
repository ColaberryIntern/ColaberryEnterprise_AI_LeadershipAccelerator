const query = jest.fn();

jest.mock('../../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a) },
}));
// Mocked only so the import chain resolves: the service imports its status constants from
// `agentEmailTool`, which reaches the models and the safety service. Nothing here is asserted.
jest.mock('../../../../models', () => ({ AiAgent: { findOne: jest.fn() } }));
jest.mock('../../../communicationSafetyService', () => ({ evaluateSend: jest.fn() }));
// T11: the inbox reads the agent's email identity first. Null (no address) by default, which keeps
// the read queries in drafts, sent, calls order; the identity cases set it.
const mockIdentity = jest.fn();
jest.mock('../../email/agentEmailIdentity', () => ({ resolveAgentEmailIdentity: (...a: unknown[]) => mockIdentity(...a) }));

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
  mockIdentity.mockReset().mockResolvedValue(null);
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

const MAYA_ID = { agentName: 'Maya', slug: 'maya', displayName: 'Maya', fromAddress: 'maya@colaberry.com', fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' };

describe('T11 an agent WITH an address: sent, inbound, pending replies, calls', () => {
  /** Answer each read by what it queries, so the test does not depend on Promise.all ordering. */
  function byTable(rows: { sent?: unknown[]; inbound?: unknown[]; pending?: unknown[]; calls?: unknown[] }) {
    query.mockImplementation(async (sql: string) => {
      if (/maya_outbound_approvals/.test(sql)) return rows.pending ?? [];
      if (/direction = 'inbound'/.test(sql)) return rows.inbound ?? [];
      if (/channel = 'voice'/.test(sql)) return rows.calls ?? [];
      if (/direction = 'outbound'/.test(sql)) return rows.sent ?? [];
      return [];
    });
  }

  it('sent is outbound EMAIL only, dated by created_at (there is no sent_at column), and non-empty with data', async () => {
    mockIdentity.mockResolvedValue(MAYA_ID);
    byTable({ sent: [{ id: 's1', to_address: 'pat@acme.com', subject: 'Re: pilot', status: 'sent', sent_at: '2026-11-22T15:00:00.000Z', error_message: null }] });
    const inbox = await getAgentEmailInbox('Maya');
    expect(inbox.sent).toEqual([{ id: 's1', toAddress: 'pat@acme.com', subject: 'Re: pilot', status: 'sent', sentAt: '2026-11-22T15:00:00.000Z', errorMessage: null }]);
    const sql = query.mock.calls.map((c) => String(c[0])).find((q) => /direction = 'outbound'/.test(q))!;
    expect(sql).toMatch(/created_at AS sent_at/);
    expect(sql).toMatch(/channel = 'email'/);
  });

  it('inbound is real once she has an address, with what happened to each message', async () => {
    mockIdentity.mockResolvedValue(MAYA_ID);
    byTable({ inbound: [{ id: 'i1', from_address: 'pat@acme.com', subject: 'Question', preview: 'How long?', lead_id: null, created_at: '2026-11-22T14:00:00.000Z', metadata: { agent_name: 'Maya', draft_outcome: 'queued' } }] });
    const inbox = await getAgentEmailInbox('Maya');
    expect(inbox.identity).toEqual({ fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' });
    expect(inbox.inbound).toEqual({ reason: null, items: [{ id: 'i1', fromAddress: 'pat@acme.com', subject: 'Question', preview: 'How long?', leadId: null, receivedAt: '2026-11-22T14:00:00.000Z', draftOutcome: 'queued', draftReason: null }] });
  });

  it('pending replies are scoped to THIS agent (agent_reply:<slug>:, plus Maya\'s older maya_reply:)', async () => {
    mockIdentity.mockResolvedValue(MAYA_ID);
    byTable({ pending: [{ id: 'p1', recipient_address: 'pat@acme.com', subject: 'Re: Question', body: '<p>Hi</p>', status: 'pending_approval', created_at: '2026-11-22T14:01:00.000Z', expires_at: null }] });
    const inbox = await getAgentEmailInbox('Maya');
    expect(inbox.pendingReplies.items[0]).toMatchObject({ id: 'p1', toAddress: 'pat@acme.com', status: 'pending_approval' });
    const call = query.mock.calls.find((c) => /maya_outbound_approvals/.test(String(c[0])))!;
    expect((call[1] as { bind: Record<string, unknown> }).bind).toEqual({ own: 'agent_reply:maya:', legacy: 'maya_reply:' });
  });

  it('calls show the summary and only the last four digits; a reservation reads as dialing', async () => {
    mockIdentity.mockResolvedValue(MAYA_ID);
    byTable({ calls: [{ id: 'c1', lead_id: 42, to_address: '+12145550142', status: 'reserving', created_at: '2026-11-22T16:00:00.000Z', metadata: { purpose: 'Pilot timeline', summary: 'Pat asked about timing.', summary_state: 'summarized', outcome: 'completed' } }] });
    const [call] = (await getAgentEmailInbox('Maya')).calls;
    expect(call).toEqual({ id: 'c1', leadId: 42, phoneLast4: '0142', status: 'dialing', purpose: 'Pilot timeline', outcome: 'completed', summary: 'Pat asked about timing.', summaryState: 'summarized', createdAt: '2026-11-22T16:00:00.000Z' });
    expect(JSON.stringify(call)).not.toContain('2145550142');
  });

  it('an identity READ FAILURE is reported as unavailable, never as "she has no address"', async () => {
    mockIdentity.mockRejectedValue(new Error('db down'));
    query.mockResolvedValue([]);
    const inbox = await getAgentEmailInbox('Maya');
    expect(inbox.inbound.reason).toBe('identity_unavailable');
    expect(inbox.pendingReplies.reason).toBe('identity_unavailable');
  });

  it('an agent with no address: inbound and pending replies say why, and are never queried', async () => {
    query.mockResolvedValue([]);
    const inbox = await getAgentEmailInbox(AGENT);
    expect(inbox.identity).toBeNull();
    expect(inbox.pendingReplies).toEqual({ items: [], reason: 'no_agent_address' });
    expect(query.mock.calls.some((c) => /maya_outbound_approvals|direction = 'inbound'/.test(String(c[0])))).toBe(false);
  });
});
