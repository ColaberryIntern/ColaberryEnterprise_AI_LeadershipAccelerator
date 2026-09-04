jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models', () => ({
  Ticket: { findByPk: jest.fn() },
}));

import { Ticket } from '../../../models';
import { getEvidenceExpectations, getTicketEvidenceExpectations } from '../evidenceExpectationService';

const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// One row per real TicketType value from models/Ticket.ts's own union — 18 types,
// spelled out here (not imported as a type, since types don't exist at runtime) so a
// mismatch between this list and the real union is visible in review. The
// anti-vacuity floor below asserts this list's length matches the real enum's
// cardinality, so silently dropping a case here fails loudly rather than passing
// vacuously. 'inbox_case' added 2026-08-23 — the real writer had bypassed this
// union AND this classifier entirely via a `type: 'inbox_case' as any` cast; this
// exact test would have caught that the moment it was added properly, instead of
// silently.
const ALL_TICKET_TYPES = [
  'task', 'bug', 'feature', 'curriculum', 'agent_action', 'strategic',
  'strategic_initiative', 'ai_optimization', 'agent_restructure', 'agent_creation',
  'workflow_redesign', 'system_automation', 'company_directive', 'workforce_decision',
  'bpos_execution', 'student_support', 'reese_autonomous_outreach', 'inbox_case',
  'data_reliability_incident',
] as const;

describe('getEvidenceExpectations — anti-vacuity floor', () => {
  it('exercises exactly the 19 real TicketType values from models/Ticket.ts (fails loudly if the enum grows without a matching test case)', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../../models/Ticket.ts'),
      'utf8',
    );
    const unionMatch = source.match(/export type TicketType =([\s\S]*?);/);
    expect(unionMatch).toBeTruthy();
    const realTypes = Array.from(unionMatch![1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(realTypes.length).toBeGreaterThanOrEqual(19);
    expect(new Set(ALL_TICKET_TYPES)).toEqual(new Set(realTypes));
  });
});

describe('getEvidenceExpectations — per-type defaults (created_by_type: agent, no security source)', () => {
  const EXPECTED_TABLE: Record<(typeof ALL_TICKET_TYPES)[number], { visualProof: string; workGraph: string; decisions: string }> = {
    task: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' },
    bug: { visualProof: 'expected', workGraph: 'not_applicable', decisions: 'not_applicable' },
    feature: { visualProof: 'expected', workGraph: 'not_applicable', decisions: 'not_applicable' },
    curriculum: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' },
    agent_action: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' },
    strategic: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'expected' },
    strategic_initiative: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    ai_optimization: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    agent_restructure: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    agent_creation: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    workflow_redesign: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    system_automation: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    company_directive: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'expected' },
    workforce_decision: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'expected' },
    bpos_execution: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'not_applicable' },
    student_support: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' },
    reese_autonomous_outreach: { visualProof: 'expected', workGraph: 'not_applicable', decisions: 'not_applicable' },
    inbox_case: { visualProof: 'not_applicable', workGraph: 'expected', decisions: 'expected' },
    data_reliability_incident: { visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'expected' },
  };

  it.each(ALL_TICKET_TYPES)('%s classifies exactly as the grounded B3 table specifies', (type) => {
    const result = getEvidenceExpectations({ type, created_by_type: 'agent' });
    expect(result).toEqual(EXPECTED_TABLE[type]);
  });
});

describe('getEvidenceExpectations — cross-cutting overrides', () => {
  it('source==="security" forces visualProof and workGraph to not_applicable on a type:"bug" ticket, decisions unaffected', () => {
    const result = getEvidenceExpectations({ type: 'bug', source: 'security', created_by_type: 'agent' });
    expect(result).toEqual({ visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' });
  });

  it('a non-security-source "bug" ticket still gets visualProof expected (regression guard: override is source-scoped, not type-scoped)', () => {
    const result = getEvidenceExpectations({ type: 'bug', source: 'manual', created_by_type: 'agent' });
    expect(result.visualProof).toBe('expected');
  });

  it('created_by_type==="human" forces ALL THREE to expected regardless of type, even a type that would otherwise be all not_applicable', () => {
    const result = getEvidenceExpectations({ type: 'workforce_decision', created_by_type: 'human' });
    // workforce_decision's own type default is visualProof:not_applicable, workGraph:not_applicable —
    // the human override must win over both.
    expect(result).toEqual({ visualProof: 'expected', workGraph: 'expected', decisions: 'expected' });
  });

  it('precedence: the human override wins even when source is also "security" (human intent wins over the automated-agent override)', () => {
    const result = getEvidenceExpectations({ type: 'task', source: 'security', created_by_type: 'human' });
    expect(result).toEqual({ visualProof: 'expected', workGraph: 'expected', decisions: 'expected' });
  });

  it('an unknown/future type defaults to all not_applicable rather than crashing or guessing expected', () => {
    const result = getEvidenceExpectations({ type: 'some_future_type_nobody_classified_yet', created_by_type: 'agent' });
    expect(result).toEqual({ visualProof: 'not_applicable', workGraph: 'not_applicable', decisions: 'not_applicable' });
  });
});

describe('getTicketEvidenceExpectations — DB-backed wrapper', () => {
  it('looks up only type/source/created_by_type and classifies from them', async () => {
    ticketFindByPk.mockResolvedValue({ type: 'bpos_execution', source: 'bpos_engine', created_by_type: 'cory' });

    const result = await getTicketEvidenceExpectations('tk-1');

    expect(ticketFindByPk).toHaveBeenCalledWith('tk-1', { attributes: ['type', 'source', 'created_by_type'] });
    expect(result).toEqual({ visualProof: 'not_applicable', workGraph: 'expected', decisions: 'not_applicable' });
  });

  it('throws the same "not found" message shape generateTicketSummary() uses, for a missing ticket', async () => {
    ticketFindByPk.mockResolvedValue(null);
    await expect(getTicketEvidenceExpectations('missing')).rejects.toThrow('Ticket missing not found');
  });
});
