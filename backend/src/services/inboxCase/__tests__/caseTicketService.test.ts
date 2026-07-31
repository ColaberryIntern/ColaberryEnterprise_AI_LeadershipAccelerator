import { randomUUID } from 'crypto';

const mockCreateTicket = jest.fn();
const mockUpdateTicketStatus = jest.fn(async () => ({}));
const mockAddTicketComment = jest.fn(async () => ({}));
const mockGetTicketsByEntity = jest.fn();

jest.mock('../../ticketService', () => ({
  createTicket: (...args: any[]) => mockCreateTicket(...args),
  updateTicketStatus: (...args: any[]) => mockUpdateTicketStatus(...args),
  addTicketComment: (...args: any[]) => mockAddTicketComment(...args),
  getTicketsByEntity: (...args: any[]) => mockGetTicketsByEntity(...args),
}));

import { ensureCaseTicket, syncTicketForCase, postCaseProgressNote } from '../caseTicketService';

function ticket(overrides: Partial<any> = {}) {
  return { id: randomUUID(), status: 'backlog', created_at: new Date(), ...overrides };
}

beforeEach(() => {
  mockCreateTicket.mockReset();
  mockUpdateTicketStatus.mockReset().mockResolvedValue({});
  mockAddTicketComment.mockReset().mockResolvedValue({});
  mockGetTicketsByEntity.mockReset();
});

describe('ensureCaseTicket', () => {
  it('creates a ticket tagged with entity_type/entity_id/type for dedup', async () => {
    mockCreateTicket.mockResolvedValueOnce(ticket());
    await ensureCaseTicket('case-1', 'AI Flotation LLC ownership', 'TOPIC', 'ali@colaberry.com');

    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'inbox_case',
        entity_id: 'case-1',
        type: 'inbox_case',
        source: 'inbox_case',
        title: expect.stringContaining('AI Flotation LLC ownership'),
      })
    );
  });

  it('never throws when ticket creation fails (best-effort)', async () => {
    mockCreateTicket.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(ensureCaseTicket('case-1', 'Title', 'PERSON', 'ali@colaberry.com')).resolves.toBeUndefined();
  });
});

describe('syncTicketForCase — case-state to ticket-status mapping', () => {
  it('maps active-work states (DISCOVERING/ASSESSING/EXECUTING) to in_progress', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'todo' })]);
    await syncTicketForCase('case-1', 'ASSESSING');
    expect(mockUpdateTicketStatus).toHaveBeenLastCalledWith(expect.any(String), 'in_progress', 'agent', 'InboxCaseEngine');
  });

  it('maps needs-Ali-attention states (NEEDS_ALI/AWAITING_APPROVAL/WAITING/FAILED) to in_review', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'in_progress' })]);
    await syncTicketForCase('case-1', 'NEEDS_ALI');
    expect(mockUpdateTicketStatus).toHaveBeenLastCalledWith(expect.any(String), 'in_review', 'agent', 'InboxCaseEngine');
  });

  it('maps RESOLVED to done', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'in_progress' })]);
    await syncTicketForCase('case-1', 'RESOLVED');
    // in_progress -> done is a single valid hop
    expect(mockUpdateTicketStatus).toHaveBeenLastCalledWith(expect.any(String), 'done', 'agent', 'InboxCaseEngine');
  });

  it('walks multiple hops when the target is not directly adjacent (backlog -> in_review needs backlog->todo->in_progress->in_review)', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'backlog' })]);
    await syncTicketForCase('case-1', 'NEEDS_ALI'); // target bucket: in_review
    expect(mockUpdateTicketStatus).toHaveBeenNthCalledWith(1, expect.any(String), 'todo', 'agent', 'InboxCaseEngine');
    expect(mockUpdateTicketStatus).toHaveBeenNthCalledWith(2, expect.any(String), 'in_progress', 'agent', 'InboxCaseEngine');
    expect(mockUpdateTicketStatus).toHaveBeenNthCalledWith(3, expect.any(String), 'in_review', 'agent', 'InboxCaseEngine');
  });

  it('is a no-op when the ticket is already at the target bucket', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'in_progress' })]);
    await syncTicketForCase('case-1', 'EXECUTING'); // also maps to in_progress
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });

  it('does nothing (no throw) when no ticket exists yet for the case', async () => {
    mockGetTicketsByEntity.mockResolvedValue([]);
    await expect(syncTicketForCase('case-1', 'ASSESSING')).resolves.toBeUndefined();
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });

  it('does not throw when the ticket is terminal (done) and cannot move further', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'done' })]);
    await expect(syncTicketForCase('case-1', 'ASSESSING')).resolves.toBeUndefined();
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
  });

  it('never throws when the underlying update call fails (best-effort)', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket({ status: 'todo' })]);
    mockUpdateTicketStatus.mockRejectedValueOnce(new Error('invalid transition'));
    await expect(syncTicketForCase('case-1', 'ASSESSING')).resolves.toBeUndefined();
  });

  it('picks the most recently created non-terminal ticket when several exist for the same case (e.g. after a reopen)', async () => {
    const older = ticket({ status: 'done', created_at: new Date('2026-01-01') });
    const newer = ticket({ status: 'todo', created_at: new Date('2026-06-01') });
    mockGetTicketsByEntity.mockResolvedValue([older, newer]);
    await syncTicketForCase('case-1', 'ASSESSING');
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith(newer.id, 'in_progress', 'agent', 'InboxCaseEngine');
  });
});

describe('postCaseProgressNote', () => {
  it('posts a comment to the case ticket', async () => {
    const t = ticket();
    mockGetTicketsByEntity.mockResolvedValue([t]);
    await postCaseProgressNote('case-1', 'Assessment complete.');
    expect(mockAddTicketComment).toHaveBeenCalledWith(t.id, 'Assessment complete.', 'agent', 'InboxCaseEngine');
  });

  it('does nothing when no ticket exists', async () => {
    mockGetTicketsByEntity.mockResolvedValue([]);
    await postCaseProgressNote('case-1', 'note');
    expect(mockAddTicketComment).not.toHaveBeenCalled();
  });

  it('never throws when the underlying comment call fails (best-effort)', async () => {
    mockGetTicketsByEntity.mockResolvedValue([ticket()]);
    mockAddTicketComment.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(postCaseProgressNote('case-1', 'note')).resolves.toBeUndefined();
  });
});
