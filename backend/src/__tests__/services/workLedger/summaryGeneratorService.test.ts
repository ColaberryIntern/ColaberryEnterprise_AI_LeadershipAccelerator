import { Ticket, TicketActionLink, WorkLedgerEvent } from '../../../models';
import { getEvidenceForTicket } from '../../../services/evidence/evidenceService';
import { resolveActorDisplayName } from '../../../services/actorIdentity/resolveActorDisplayName';
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
// resolveActorDisplayName has its own full unit-test coverage (see
// actorIdentity/__tests__/resolveActorDisplayName.test.ts) — mocked here so this
// file tests the WIRING (does summaryGeneratorService call it with the event's real
// actor_type/actor_id and embed its return value) rather than re-testing the
// resolver's own DB-lookup behavior, matching this file's existing convention of
// mocking getEvidenceForTicket at the layer boundary rather than hitting real data.
jest.mock('../../../services/actorIdentity/resolveActorDisplayName', () => ({
  resolveActorDisplayName: jest.fn(),
}));

const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const linkFindAll = TicketActionLink.findAll as unknown as jest.Mock;
const eventFindAll = WorkLedgerEvent.findAll as unknown as jest.Mock;
const mockGetEvidence = getEvidenceForTicket as unknown as jest.Mock;
const mockResolveActorDisplayName = resolveActorDisplayName as unknown as jest.Mock;

const TICKET_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM_WORDS = /verified|deployed|sent|fixed/i;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

beforeEach(() => {
  jest.clearAllMocks();
  ticketFindByPk.mockResolvedValue({ id: TICKET_ID, title: 'Fix broken link' });
  // Default passthrough so every pre-existing test (written before this run, using
  // already-readable actor_id fixtures like 'PlatformFixAgent') keeps its exact
  // prior assertions true without having to know about the resolver at all — only
  // tests that care about the resolution behavior itself override this per-test.
  mockResolveActorDisplayName.mockImplementation(async (_type: string, id: string) => id);
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

  // Regression guard for the SECOND raw-ID defect Ali found live, minutes after the
  // first one (ticket titles/descriptions) shipped: "Outcome: create was reported
  // successful by 82c2dfd2-369e-4545-8d2f-22d1ae3451ff at Aug 12, 10:00 AM CDT" — a
  // raw actor UUID (Reese's own AdminUser id, actor_type 'ai_staff') baked straight
  // into generated prose. These assert the exact shape of that live example, and are
  // the "test asserting generated Outcome/Proof text never contains a raw UUID
  // pattern when a resolvable actor exists" the request names explicitly.
  const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';

  it('resolves a resolvable ai_staff actor to a real name in the outcome line, never the raw UUID (Ali\'s exact live example, success+no-evidence branch)', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-4' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-4', intent: 'ticket.create', actor_type: 'ai_staff', actor_id: REESE_ADMIN_ID, result: 'success', occurred_at: new Date('2026-08-12T15:00:00Z'), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([]);
    mockResolveActorDisplayName.mockResolvedValue('Reese');

    const result = await generateTicketSummary(TICKET_ID);

    expect(mockResolveActorDisplayName).toHaveBeenCalledWith('ai_staff', REESE_ADMIN_ID);
    expect(result.outcome).toContain('Reese');
    expect(result.outcome).not.toMatch(UUID_PATTERN);
  });

  it('resolves a resolvable ai_staff actor to a real name in the outcome line, never the raw UUID (success+evidence branch)', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-5' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-5', intent: 'ticket.dispatch', actor_type: 'ai_staff', actor_id: REESE_ADMIN_ID, result: 'success', occurred_at: new Date(), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([{ id: 'art-1', artifact_type: 'screenshot' }]);
    mockResolveActorDisplayName.mockResolvedValue('Reese');

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.outcome).toContain('Reese');
    expect(result.outcome).not.toMatch(UUID_PATTERN);
  });

  it('boundary: an unresolvable actor still produces honest, non-crashing outcome text (resolver\'s own fail-closed label, never a raw UUID)', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-6' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-6', intent: 'ticket.create', actor_type: 'ai_staff', actor_id: REESE_ADMIN_ID, result: 'success', occurred_at: new Date(), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([]);
    // Simulates resolveActorDisplayName's own real fail-closed behavior (it never
    // throws — see its unit tests) rather than a rejection, since that's what the
    // real function actually returns on a miss.
    mockResolveActorDisplayName.mockResolvedValue('Ai Staff');

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.outcome).not.toMatch(UUID_PATTERN);
    expect(result.outcome).toContain('Ai Staff');
  });

  // T005 — this generator is shared by EVERY ticket type in ProofDesk (task, bug,
  // feature, curriculum, agent_action, strategic, etc.), not just Reese's ai_staff
  // tickets. These pin that a non-Reese ticket's dispatched-to-an-agent or
  // Cory-driven outcome still resolves correctly, proving the fix generalizes.
  it('non-Reese ticket regression: an agent-dispatched task/bug/feature-type ticket resolves its actor correctly, unchanged behavior', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-8' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-8', intent: 'ticket.dispatch', actor_type: 'agent', actor_id: 'CurriculumArchitectAgent', result: 'success', occurred_at: new Date(), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([{ id: 'art-1', artifact_type: 'diff' }]);
    // Real resolveActorDisplayName behavior for a non-UUID agent id is a passthrough
    // (see resolveActorDisplayName.test.ts) — the default mock here already does
    // this, asserted explicitly rather than relied on implicitly.

    const result = await generateTicketSummary(TICKET_ID);

    expect(mockResolveActorDisplayName).toHaveBeenCalledWith('agent', 'CurriculumArchitectAgent');
    expect(result.outcome).toContain('CurriculumArchitectAgent');
    expect(result.outcome).not.toMatch(UUID_PATTERN);
  });

  it('non-Reese ticket regression: a Cory-driven outcome resolves its actor correctly, unchanged behavior', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-9' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-9', intent: 'ticket.status_change', actor_type: 'cory', actor_id: 'bpos_orchestrator', result: 'success', occurred_at: new Date(), reason_code: null },
    ]);
    mockGetEvidence.mockResolvedValue([]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(mockResolveActorDisplayName).toHaveBeenCalledWith('cory', 'bpos_orchestrator');
    expect(result.outcome).toContain('bpos_orchestrator');
    expect(result.outcome).not.toMatch(UUID_PATTERN);
  });

  it('the failure-outcome branch is unaffected by this fix — it never named an actor before and still does not (confirms no unintended content change, no resolver call)', async () => {
    linkFindAll.mockResolvedValue([{ event_id: 'evt-7' }]);
    eventFindAll.mockResolvedValue([
      { event_id: 'evt-7', intent: 'ticket.dispatch', actor_type: 'ai_staff', actor_id: REESE_ADMIN_ID, result: 'failure', occurred_at: new Date(), reason_code: 'agent_threw' },
    ]);
    mockGetEvidence.mockResolvedValue([]);

    const result = await generateTicketSummary(TICKET_ID);

    expect(result.outcome.startsWith('Outcome: dispatch failed at')).toBe(true);
    expect(result.outcome).toContain('(agent_threw)');
    expect(result.outcome).not.toContain(REESE_ADMIN_ID);
    expect(mockResolveActorDisplayName).not.toHaveBeenCalled();
  });
});
