/**
 * Agent Alias & Identity Fix — forward-fix for cory-engine's ticket-creator
 * identity, tested in isolation via the extracted pure helper
 * resolveCoryEngineTicketAssignee(), rather than mocking the full 8-step
 * autonomous cycle. See the function's own header comment in
 * autonomousEngine.ts for why the stamp is scoped to the isAutoExec branch
 * only (the Review branch's status:'todo' + assigned_to_id IS NULL combination
 * is real, load-bearing input to ticketManagementAgent.ts's auto-dispatch sweep).
 *
 * Agent Quality Cleanup, Item 2 — cory-engine ticket dedup. Two layers:
 * (1) resolveCoryEngineTicketDedupKey() tested as a pure function (same
 * pattern as the assignee helper above); (2) an integration block proving
 * the REAL createTicket() (not mocked) actually reuses/opens fresh tickets
 * given the keys that function produces — the mechanism that stops the
 * "same finding refiled roughly hourly forever" bug, not just the key math.
 */
import { resolveCoryEngineTicketAssignee, resolveCoryEngineTicketDedupKey } from '../autonomousEngine';

describe('resolveCoryEngineTicketAssignee', () => {
  it('happy path: auto-executable + a real AdminUser id -> stamps the real identity', () => {
    expect(resolveCoryEngineTicketAssignee(true, 'admin-cory-engine-1')).toEqual({
      assigned_to_type: 'ai_staff',
      assigned_to_id: 'admin-cory-engine-1',
    });
  });

  it('failure path: auto-executable but the AdminUser id is not yet resolvable (null) -> safe no-op, never a partial/invalid stamp', () => {
    expect(resolveCoryEngineTicketAssignee(true, null)).toEqual({});
  });

  it('the real risk being guarded against: NOT auto-executable (a "Review" ticket) is ALWAYS unstamped, even with a valid id — preserves ticketManagementAgent.ts\'s real auto-dispatch sweep', () => {
    expect(resolveCoryEngineTicketAssignee(false, 'admin-cory-engine-1')).toEqual({});
  });

  it('boundary: not auto-executable and no id -> still an empty, safe no-op (not a crash)', () => {
    expect(resolveCoryEngineTicketAssignee(false, null)).toEqual({});
  });
});

describe('resolveCoryEngineTicketDedupKey', () => {
  it('happy path: a stable problem identity (agent_failure) is keyed on entity + recommended action, not the decision id', () => {
    expect(
      resolveCoryEngineTicketDedupKey(
        { entity_type: 'agent', entity_id: 'agent-uuid-1' },
        'update_agent_config',
        'decision-uuid-1',
      ),
    ).toEqual({ entity_type: 'agent', entity_id: 'agent-uuid-1:update_agent_config' });
  });

  it('the real distinction that matters: a DIFFERENT recommended action for the same agent produces a DIFFERENT key — a genuinely different finding must still open its own ticket', () => {
    const first = resolveCoryEngineTicketDedupKey({ entity_type: 'agent', entity_id: 'agent-uuid-1' }, 'update_agent_config', 'd1');
    const second = resolveCoryEngineTicketDedupKey({ entity_type: 'agent', entity_id: 'agent-uuid-1' }, 'modify_agent_schedule', 'd2');
    expect(first.entity_id).not.toBe(second.entity_id);
  });

  it('is stable across two calls for the same problem (same decision id is irrelevant to the key) — this is what lets createTicket find the still-open ticket', () => {
    const cycle1 = resolveCoryEngineTicketDedupKey({ entity_type: 'agent', entity_id: 'agent-uuid-1' }, 'update_agent_config', 'decision-cycle-1');
    const cycle2 = resolveCoryEngineTicketDedupKey({ entity_type: 'agent', entity_id: 'agent-uuid-1' }, 'update_agent_config', 'decision-cycle-2');
    expect(cycle1).toEqual(cycle2);
  });

  it('regression guard: a problem with no stable identity (conversion_drop, error_spike) falls back to the original decision-id key — zero behavior change for those types', () => {
    expect(resolveCoryEngineTicketDedupKey({}, 'pause_campaign', 'decision-uuid-9')).toEqual({
      entity_type: 'decision',
      entity_id: 'decision-uuid-9',
    });
  });

  it('boundary: entity_type present but entity_id missing -> still falls back (both must be present, matching createTicket()\'s own guard)', () => {
    expect(resolveCoryEngineTicketDedupKey({ entity_type: 'agent' }, 'update_agent_config', 'decision-uuid-9')).toEqual({
      entity_type: 'decision',
      entity_id: 'decision-uuid-9',
    });
  });
});

// ─── Integration: the real createTicket() actually dedupes on this key ─────
// Mirrors backend/src/__tests__/services/ticketService.test.ts's own mock
// shape (proven safe for this module graph) rather than mocking the whole
// autonomousEngine.ts pipeline — this proves the ONE mechanism that changed
// (what key reaches createTicket()), using createTicket()'s real, already-
// tested dedup logic (ticketService.ts:68-81), not a re-implementation of it.
// Deliberately does NOT mock config/database: IntelligenceDecision.ts (and
// every other model autonomousEngine.ts's import graph pulls in) calls
// Model.init({ sequelize, ... }) at module load against the REAL sequelize
// instance — that instance never connects at construction time, so it's
// already safe to load unmocked (proven by this same file's top describe
// blocks, which already import '../autonomousEngine' with zero mocks). Only
// the models BARREL (Ticket/TicketActivity, used by ticketService.ts) and
// the work-ledger emit are mocked, since those are the two real side effects
// this integration test needs to observe/control.
jest.mock('../../../models', () => ({
  Ticket: { findOne: jest.fn(), create: jest.fn() },
  TicketActivity: { create: jest.fn() },
}));
jest.mock('../../../services/workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));

describe('cory-engine ticket dedup — real createTicket() integration', () => {
  const { Ticket, TicketActivity } = require('../../../models');
  const { createTicket } = require('../../../services/ticketService');
  const ticketFindOne = Ticket.findOne as jest.Mock;
  const ticketCreate = Ticket.create as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (TicketActivity.create as jest.Mock).mockResolvedValue({ id: 'activity-1' });
  });

  function baseTicketInput(overrides: Partial<Record<string, any>> = {}) {
    const dedupKey = resolveCoryEngineTicketDedupKey(
      { entity_type: 'agent', entity_id: 'agent-openclaw-learning-1' },
      'update_agent_config',
      overrides.decisionId || 'decision-any',
    );
    return {
      title: '[Review] update_agent_config',
      created_by_type: 'cory' as const,
      created_by_id: 'cory-engine',
      type: 'agent_action' as const,
      entity_type: dedupKey.entity_type,
      entity_id: dedupKey.entity_id,
      status: 'todo' as const,
    };
  }

  it('an open, unresolved finding does NOT spawn a second ticket — the second cycle reuses the first cycle\'s ticket', async () => {
    const existingOpenTicket = { id: 'ticket-1', status: 'todo', title: '[Review] update_agent_config' };
    // Cycle 1: no ticket exists yet.
    ticketFindOne.mockResolvedValueOnce(null);
    ticketCreate.mockResolvedValueOnce(existingOpenTicket);
    const firstTicket = await createTicket(baseTicketInput({ decisionId: 'decision-cycle-1' }));
    expect(firstTicket.id).toBe('ticket-1');
    expect(ticketCreate).toHaveBeenCalledTimes(1);

    // Cycle 2 (~1h later, same still-broken agent, same recommended action,
    // but a NEW decision id per the 60-min IntelligenceDecision window):
    // createTicket() finds cycle 1's still-open ticket and reuses it.
    ticketFindOne.mockResolvedValueOnce(existingOpenTicket);
    const secondTicket = await createTicket(baseTicketInput({ decisionId: 'decision-cycle-2' }));
    expect(secondTicket.id).toBe('ticket-1');
    expect(ticketCreate).toHaveBeenCalledTimes(1); // still only the one real Ticket.create call
  });

  it('a genuinely different finding (different recommended action) still opens its own ticket', async () => {
    ticketFindOne.mockResolvedValueOnce(null); // no open ticket for update_agent_config
    ticketCreate.mockResolvedValueOnce({ id: 'ticket-config' });
    const configTicket = await createTicket(baseTicketInput());
    expect(configTicket.id).toBe('ticket-config');

    const scheduleDedupKey = resolveCoryEngineTicketDedupKey(
      { entity_type: 'agent', entity_id: 'agent-openclaw-learning-1' },
      'modify_agent_schedule',
      'decision-other',
    );
    ticketFindOne.mockResolvedValueOnce(null); // different entity_id -> no open ticket found
    ticketCreate.mockResolvedValueOnce({ id: 'ticket-schedule' });
    const scheduleTicket = await createTicket({
      ...baseTicketInput(),
      title: '[Review] modify_agent_schedule',
      entity_type: scheduleDedupKey.entity_type,
      entity_id: scheduleDedupKey.entity_id,
    });
    expect(scheduleTicket.id).toBe('ticket-schedule');
    expect(ticketCreate).toHaveBeenCalledTimes(2);
  });

  it('a finding that was resolved (ticket done) and recurs later opens a FRESH ticket — this is "stop duplicating while open," not "never alert again"', async () => {
    // The prior ticket for this exact key is now done.
    ticketFindOne.mockResolvedValueOnce(null); // createTicket's query filters status NOT IN (done, cancelled) — a done ticket is invisible to it
    ticketCreate.mockResolvedValueOnce({ id: 'ticket-fresh-recurrence' });
    const recurrence = await createTicket(baseTicketInput({ decisionId: 'decision-recurrence' }));
    expect(recurrence.id).toBe('ticket-fresh-recurrence');
    expect(ticketCreate).toHaveBeenCalledTimes(1);
  });
});
