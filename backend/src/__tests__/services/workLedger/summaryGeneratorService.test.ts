import { Ticket, TicketActionLink, WorkLedgerEvent } from '../../../models';
import { getEvidenceForTicket } from '../../../services/evidence/evidenceService';
import { generateTicketSummary } from '../../../services/workLedger/summaryGeneratorService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models', () => ({
  Ticket: { findByPk: jest.fn() },
  TicketActionLink: { findAll: jest.fn() },
  WorkLedgerEvent: { findAll: jest.fn() },
}));
jest.mock('../../../services/evidence/evidenceService', () => ({
  getEvidenceForTicket: jest.fn(),
}));

const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const linkFindAll = TicketActionLink.findAll as unknown as jest.Mock;
const eventFindAll = WorkLedgerEvent.findAll as unknown as jest.Mock;
const mockGetEvidence = getEvidenceForTicket as unknown as jest.Mock;

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_WORDS = /verified|deployed|sent|fixed/i;

beforeEach(() => {
  jest.clearAllMocks();
  ticketFindByPk.mockResolvedValue({ id: TICKET_ID, title: 'Fix broken link' });
});

describe('generateTicketSummary', () => {
  it('happy path: a success event WITH linked evidence produces a real, evidence-referencing summary', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-1' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-1', intent: 'ticket.status_change', actor_id: 'PlatformFixAgent', result: 'success', occurred_at: new Date('2026-08-01T10:00:00Z'), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([
      { id: 'art-1', artifact_type: 'screenshot' },
      { id: 'art-2', artifact_type: 'screenshot' },
    ]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.hasEvidence).toBe(true);
    expect(result.outcome).toContain('PlatformFixAgent');
    expect(result.proof).toContain('2 evidence items');
    expect(result.proof).toContain('screenshot');
    expect(result.proof).not.toBe('Proof: No proof recorded yet for this ticket.');
  });

  it('boundary/failure: zero linked events and zero evidence never fabricates a claim', async () => {
    linkFindAll.mockResolvedValue([]);
    mockGetEvidence.mockResolvedValue([]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.hasEvidence).toBe(false);
    expect(result.proof).toBe('Proof: No proof recorded yet for this ticket.');
    // All 3 fields, not just proof — a claim word leaking into outcome or humanAction
    // is exactly the failure mode this rule exists to prevent.
    expect(result.outcome).not.toMatch(CLAIM_WORDS);
    expect(result.proof).not.toMatch(CLAIM_WORDS);
    expect(result.humanAction).not.toMatch(CLAIM_WORDS);
  });

  it('boundary: a success event but NO evidence is honest about the gap, not a fabricated "verified" claim', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-2' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-2', intent: 'ticket.dispatch', actor_id: 'CurriculumArchitectAgent', result: 'success', occurred_at: new Date(), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.hasEvidence).toBe(false);
    expect(result.outcome).toContain('no evidence has been recorded');
    expect(result.humanAction).toContain('attach evidence');
    // Regression guard: this exact branch previously used the literal word "verified"
    // in humanAction while only outcome was checked against CLAIM_WORDS — check all 3
    // fields here, not just the one the branch's prose happens to foreground.
    expect(result.outcome).not.toMatch(CLAIM_WORDS);
    expect(result.proof).not.toMatch(CLAIM_WORDS);
    expect(result.humanAction).not.toMatch(CLAIM_WORDS);
  });

  it('failure path: a failed event does not claim success language', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-3' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-3', intent: 'ticket.dispatch', actor_id: 'PlatformFixAgent', result: 'failure', occurred_at: new Date(), reason_code: 'agent_threw' },
    ]);
    mockGetEvidence.mockResolvedValue([]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.outcome).toContain('failed');
    expect(result.outcome).toContain('agent_threw');
    expect(result.outcome).not.toMatch(/verified|deployed|sent|completed successfully/i);
    expect(result.proof).not.toMatch(CLAIM_WORDS);
    expect(result.humanAction).not.toMatch(CLAIM_WORDS);
  });

  it('rejects a nonexistent ticket', async () => {
    ticketFindByPk.mockResolvedValue(null);
    await expect(generateTicketSummary('missing')).rejects.toThrow('Ticket missing not found');
    expect(linkFindAll).not.toHaveBeenCalled();
  });

  // Regression guard for a real defect Ali found live: the outcome line used to embed
  // a raw, unlabeled UTC timestamp ("...at 2026-08-12 15:00.") straight into generated
  // prose. Fixed at the generation source (summaryGeneratorService.ts's formatDate now
  // delegates to centralDate's formatCentralDateTime) — these assert the fix from the
  // caller's side, not just centralDate's own unit tests.
  const RAW_UTC_PATTERN = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;

  it('embeds a CST/CDT-labeled timestamp in the outcome line, never raw unlabeled UTC (success+evidence)', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-1' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-1', intent: 'ticket.status_change', actor_id: 'PlatformFixAgent', result: 'success', occurred_at: new Date('2026-08-12T15:00:00Z'), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([{ id: 'art-1', artifact_type: 'screenshot' }]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.outcome).toMatch(/CST|CDT/);
    expect(result.outcome).not.toMatch(RAW_UTC_PATTERN);
  });

  it('embeds a CST/CDT-labeled timestamp in the outcome line, never raw unlabeled UTC (failure)', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-3' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-3', intent: 'ticket.dispatch', actor_id: 'PlatformFixAgent', result: 'failure', occurred_at: new Date('2026-11-01T07:00:00Z'), reason_code: 'agent_threw' },
    ]);
    mockGetEvidence.mockResolvedValue([]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.outcome).toMatch(/CST|CDT/);
    expect(result.outcome).not.toMatch(RAW_UTC_PATTERN);
  });
});
