/**
 * ticketReplyService — the signature check is enforced by the caller before this runs;
 * these tests cover what this service itself is responsible for: the per-ticket reply
 * token (the actual authorization boundary — a ticket UUID alone is visible to any admin
 * on the board), the sender allowlist (with the same env.emailFrom degrade path the send
 * side uses, so the two can't silently disagree), redelivery-safe idempotency, only
 * mutating a ticket that's actually awaiting approval, deterministic keyword-based intent
 * parsing (never LLM-based — untrusted email content should never drive a prompt), and
 * keeping the linked ProposedAgentAction in sync without letting a sync failure undo the
 * ticket mutation.
 */

jest.mock('../../../models/Ticket', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/TicketActivity', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/ProposedAgentAction', () => ({ __esModule: true, default: { update: jest.fn() } }));
jest.mock('../../ticketService', () => ({ updateTicketStatus: jest.fn(), addTicketComment: jest.fn() }));
jest.mock('../../settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../../emailService', () => ({ sendTicketReplyConfirmation: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../unsubscribeEnforcementService', () => ({
  topReplyText: (raw: string) => (raw || '').split(/\r?\n/).filter((l) => !/^\s*>/.test(l) && !/^\s*On\b.*wrote:\s*$/i.test(l)).join('\n').toLowerCase().trim(),
}));
jest.mock('../../../config/env', () => ({ env: { emailFrom: 'ali@colaberry.com' } }));

import Ticket from '../../../models/Ticket';
import TicketActivity from '../../../models/TicketActivity';
import ProposedAgentAction from '../../../models/ProposedAgentAction';
import { updateTicketStatus, addTicketComment } from '../../ticketService';
import { getSetting } from '../../settingsService';
import { sendTicketReplyConfirmation } from '../../emailService';
import { handleTicketReplyEmail } from '../ticketReplyService';

const ticketFindByPk = Ticket.findByPk as jest.Mock;
const activityFindOne = TicketActivity.findOne as jest.Mock;
const proposalUpdate = ProposedAgentAction.update as jest.Mock;
const updateStatus = updateTicketStatus as jest.Mock;
const addComment = addTicketComment as jest.Mock;
const settingGet = getSetting as jest.Mock;
const confirmEmail = sendTicketReplyConfirmation as jest.Mock;

const TOKEN = 'a1b2c3d4';

function inReviewTicket(over: any = {}) {
  return {
    id: 'ticket-1', ticket_number: 42, title: 'Content idea for review: X',
    status: 'in_review', entity_type: 'proposed_agent_action', entity_id: 'proposal-1',
    metadata: { reply_token: TOKEN },
    ...over,
  };
}

function reply(over: any = {}) {
  return { ticketId: 'ticket-1', replyToken: TOKEN, fromEmail: 'ali@colaberry.com', rawBody: 'Approved.', ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  settingGet.mockResolvedValue('ali@colaberry.com, ram@colaberry.com');
  activityFindOne.mockResolvedValue(null); // no prior duplicate by default
});

describe('sender authorization', () => {
  it('a reply from a non-allowlisted sender is ignored — no ticket lookup, no mutation', async () => {
    const result = await handleTicketReplyEmail(reply({ fromEmail: 'attacker@evil.com' }));

    expect(result).toEqual({ handled: false, reason: 'sender_not_authorized' });
    expect(ticketFindByPk).not.toHaveBeenCalled();
  });

  it('matches case-insensitively and trims whitespace in the allowlist', async () => {
    settingGet.mockResolvedValue(' Ali@Colaberry.com ,ram@colaberry.com');
    ticketFindByPk.mockResolvedValue(inReviewTicket());

    const result = await handleTicketReplyEmail(reply());

    expect(result.handled).toBe(true);
  });

  it('falls back to env.emailFrom when admin_notification_emails is unset — matching the send side, so the two never silently disagree', async () => {
    settingGet.mockResolvedValue('');
    ticketFindByPk.mockResolvedValue(inReviewTicket());

    const result = await handleTicketReplyEmail(reply({ fromEmail: 'ali@colaberry.com' }));

    expect(result.handled).toBe(true);
  });
});

describe('reply token — the actual authorization boundary', () => {
  it('a reply with the wrong token is rejected even from an allowlisted sender with a real ticket ID', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());

    const result = await handleTicketReplyEmail(reply({ replyToken: 'wrongtok1' }));

    expect(result).toEqual({ handled: false, reason: 'invalid_reply_token' });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('a ticket with no stored token at all (legacy/malformed row) rejects every reply', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket({ metadata: {} }));

    const result = await handleTicketReplyEmail(reply());

    expect(result).toEqual({ handled: false, reason: 'invalid_reply_token' });
  });
});

describe('ticket lookup', () => {
  it('an unknown ticket ID is a no-op, not an error', async () => {
    ticketFindByPk.mockResolvedValue(null);
    const result = await handleTicketReplyEmail(reply({ ticketId: 'nonexistent' }));
    expect(result).toEqual({ handled: false, reason: 'ticket_not_found' });
  });
});

describe('idempotency — redelivery safety', () => {
  it('the same sender replying with the same text within 5 minutes is treated as a redelivery, not reprocessed', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());
    activityFindOne.mockResolvedValue({ id: 'activity-1', created_at: new Date() });

    const result = await handleTicketReplyEmail(reply());

    expect(result).toEqual({ handled: true, reason: 'duplicate_redelivery' });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
    expect(confirmEmail).not.toHaveBeenCalled();
  });
});

describe('only a ticket awaiting approval can be moved', () => {
  it('a done ticket gets a comment, not a status transition', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket({ status: 'done' }));

    const result = await handleTicketReplyEmail(reply());

    expect(result).toEqual({ handled: true, reason: 'ticket_not_awaiting_approval' });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(addComment).toHaveBeenCalledWith('ticket-1', expect.stringContaining('no status change'), 'human', 'ali@colaberry.com');
    expect(confirmEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'commented' }));
  });
});

describe('intent parsing', () => {
  it('approve: transitions to done, comments, syncs the linked proposal, and confirms by email', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());

    const result = await handleTicketReplyEmail(reply({ rawBody: 'Approved, go ahead.' }));

    expect(result).toEqual({ handled: true, reason: 'approve', newStatus: 'done' });
    expect(updateStatus).toHaveBeenCalledWith('ticket-1', 'done', 'human', 'ali@colaberry.com');
    expect(addComment).toHaveBeenCalledWith('ticket-1', 'approved, go ahead.', 'human', 'ali@colaberry.com');
    expect(proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewed_by: 'ali@colaberry.com' }),
      { where: { id: 'proposal-1' } },
    );
    expect(confirmEmail).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'done', ticketNumber: 42 }));
  });

  it('reject: transitions to cancelled and syncs the proposal as rejected', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());

    const result = await handleTicketReplyEmail(reply({ fromEmail: 'ram@colaberry.com', rawBody: 'No, reject this one.' }));

    expect(result).toEqual({ handled: true, reason: 'reject', newStatus: 'cancelled' });
    expect(updateStatus).toHaveBeenCalledWith('ticket-1', 'cancelled', 'human', 'ram@colaberry.com');
    expect(proposalUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }), { where: { id: 'proposal-1' } });
  });

  it('ambiguous text is left in_review with a comment — never guesses at intent', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());

    const result = await handleTicketReplyEmail(reply({ rawBody: 'What was the source signal for this again?' }));

    expect(result).toEqual({ handled: true, reason: 'ambiguous_intent' });
    expect(updateStatus).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
    expect(addComment).toHaveBeenCalledWith('ticket-1', expect.stringContaining('could not determine'), 'human', 'ali@colaberry.com');
  });

  it('strips quoted reply history before matching, so keywords in the quoted original do not leak through', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());
    const body = [
      'Reject this, the signal is stale.',
      '',
      'On Wed, Jul 30, 2026 at 3:14 PM Colaberry AI Workforce <ali@colaberry.com> wrote:',
      '> AI Workforce — approval needed',
      '> Approved content ready for review',
    ].join('\n');

    const result = await handleTicketReplyEmail(reply({ rawBody: body }));

    expect(result.reason).toBe('reject');
  });

  it('a ticket not linked to a proposal (entity_type mismatch) skips the sync without error', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket({ entity_type: 'workforce_tasks', entity_id: 'task-1' }));

    const result = await handleTicketReplyEmail(reply());

    expect(result.reason).toBe('approve');
    expect(proposalUpdate).not.toHaveBeenCalled();
  });

  it('a proposal-sync failure does not undo the already-applied ticket status change', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());
    proposalUpdate.mockRejectedValue(new Error('db unavailable'));

    const result = await handleTicketReplyEmail(reply());

    expect(result).toEqual({ handled: true, reason: 'approve', newStatus: 'done' });
    expect(updateStatus).toHaveBeenCalled();
  });

  it('a confirmation-email failure does not change the reported outcome', async () => {
    ticketFindByPk.mockResolvedValue(inReviewTicket());
    confirmEmail.mockRejectedValue(new Error('SMTP down'));

    const result = await handleTicketReplyEmail(reply());

    expect(result).toEqual({ handled: true, reason: 'approve', newStatus: 'done' });
  });
});
