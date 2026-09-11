/**
 * managerAssignWorkIntentService — Reese Agentic AI Employee mission,
 * Capability 8's ASSIGN_WORK slice of the manager-intent classifier. Pure
 * logic: pins real trigger-phrase detection, that the manager's own message
 * becomes the task title verbatim, the honest confirmation-card text, the
 * real idempotency key minted at detection and replayed at confirm, and
 * that a confirmed assignment actually calls the real assignTaskToAgent()
 * with the pending record's exact fields — including the honest failure
 * paths (no linked org profile, agent outside the hierarchy, agent
 * deactivated) rather than a fabricated success.
 *
 * Mocks orgChartTaskAssignmentService wholesale so this file never loads
 * the real Ticket model (which pulls in the full models/index.ts
 * association barrel) — same isolation reasoning already applied to every
 * sibling intent-service test in this directory.
 */
// Mocked wholesale — including the error classes as plain local subclasses,
// never jest.requireActual — because the REAL module imports { Ticket }
// from models/index.ts, the full Sequelize association-setup barrel, which
// this file never wants to load. managerAssignWorkIntentService.ts's own
// `instanceof AgentNotInHierarchyError` checks resolve against whatever
// this mock exports, so a plain local class here is exactly as real as the
// genuine one for this test's purposes.
// Classes are defined INSIDE the factory (not referenced from outer scope)
// because jest's mock-factory hoisting only permits referencing outer
// variables named `mock*` — anything else throws an out-of-scope error.
const mockAssignTaskToAgent = jest.fn();
jest.mock('../workforce/orgChartTaskAssignmentService', () => {
  class AgentNotInHierarchyError extends Error {
    constructor(orgMemberId: string, agentId: string) {
      super(`Agent "${agentId}" is not in org_member "${orgMemberId}"'s downstream hierarchy.`);
      this.name = 'AgentNotInHierarchyError';
    }
  }
  class AgentDeactivatedError extends Error {
    constructor(agentId: string, agentName: string) {
      super(`Agent "${agentName}" (${agentId}) is currently deactivated and cannot be assigned a task.`);
      this.name = 'AgentDeactivatedError';
    }
  }
  return {
    AgentNotInHierarchyError,
    AgentDeactivatedError,
    assignTaskToAgent: (...a: any[]) => mockAssignTaskToAgent(...a),
  };
});

import {
  applyConfirmedAssignWork,
  buildAssignWorkConfirmationCardText,
  detectAssignWorkIntent,
  toPendingAssignWorkConfirmation,
} from '../managerAssignWorkIntentService';
import { AgentDeactivatedError, AgentNotInHierarchyError } from '../workforce/orgChartTaskAssignmentService';

beforeEach(() => {
  jest.clearAllMocks();
  mockAssignTaskToAgent.mockResolvedValue({ id: 'ticket-1' });
});

describe('detectAssignWorkIntent', () => {
  it.each([
    'New task: pull last week\'s conversion numbers by Friday.',
    'I need you to work on the Q3 enrollment report.',
    "Here's your task: audit the last 20 tickets for tone.",
    'Your assignment is to draft the win-back email copy.',
    'Please work on the cohort attendance summary.',
  ])('trigger phrase: %p', (message) => {
    const result = detectAssignWorkIntent(message);
    expect(result).not.toBeNull();
    expect(result?.title).toBe(message);
  });

  it('honesty boundary: an ordinary conversational ask with no task-assignment trigger phrase — no detection, no guessing', () => {
    expect(detectAssignWorkIntent('Can you help me understand this metric?')).toBeNull();
  });

  it('boundary: empty message', () => {
    expect(detectAssignWorkIntent('')).toBeNull();
  });

  it("the manager's own message becomes the task title verbatim, whitespace-trimmed only", () => {
    const result = detectAssignWorkIntent('  New task: reconcile the July invoices.  ');
    expect(result?.title).toBe('New task: reconcile the July invoices.');
  });
});

describe('buildAssignWorkConfirmationCardText', () => {
  it('restates what was understood, states the real effect, asks for confirmation', () => {
    const text = buildAssignWorkConfirmationCardText({ title: 'New task: reconcile the July invoices.' });

    expect(text).toContain('New task: reconcile the July invoices.');
    expect(text).toContain('ticket');
    expect(text).toContain('confirm');
  });
});

describe('toPendingAssignWorkConfirmation', () => {
  it('carries the real title forward, tags intentType, and mints a real idempotency key', () => {
    const pending = toPendingAssignWorkConfirmation({ title: 'New task: reconcile the July invoices.' });

    expect(pending.intentType).toBe('ASSIGN_WORK');
    expect(pending.title).toBe('New task: reconcile the July invoices.');
    expect(typeof pending.idempotencyKey).toBe('string');
    expect(pending.idempotencyKey.length).toBeGreaterThan(0);
    expect(typeof pending.detectedAt).toBe('string');
  });

  it('mints a DIFFERENT key on each call — never reused across two separate detections', () => {
    const a = toPendingAssignWorkConfirmation({ title: 'Task A' });
    const b = toPendingAssignWorkConfirmation({ title: 'Task B' });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
});

describe('applyConfirmedAssignWork', () => {
  const pending = {
    intentType: 'ASSIGN_WORK' as const,
    title: 'New task: reconcile the July invoices.',
    idempotencyKey: 'idem-key-1',
    detectedAt: '2026-09-09T00:00:00.000Z',
  };

  it('calls the real assignTaskToAgent() with the pending record\'s exact title and idempotency key', async () => {
    const result = await applyConfirmedAssignWork('agent-1', pending, 'ali@colaberry.com', 'org-member-1');

    expect(mockAssignTaskToAgent).toHaveBeenCalledWith({
      orgMemberId: 'org-member-1',
      agentId: 'agent-1',
      title: 'New task: reconcile the July invoices.',
      idempotencyKey: 'idem-key-1',
    });
    expect(result.summary).toContain('New task: reconcile the July invoices.');
  });

  it('a null org member id (super admin) never reaches assignTaskToAgent() — honest decline, not a fabricated write', async () => {
    const result = await applyConfirmedAssignWork('agent-1', pending, 'ali@colaberry.com', null);

    expect(mockAssignTaskToAgent).not.toHaveBeenCalled();
    expect(result.summary).toContain("can't assign work");
  });

  it('agent outside the confirming manager\'s hierarchy — the real error surfaces honestly, not a fabricated success', async () => {
    mockAssignTaskToAgent.mockRejectedValue(new AgentNotInHierarchyError('org-member-1', 'agent-1'));

    const result = await applyConfirmedAssignWork('agent-1', pending, 'ali@colaberry.com', 'org-member-1');

    expect(result.summary).toContain("couldn't assign");
    expect(result.summary).toContain('downstream hierarchy');
  });

  it('a deactivated target agent — the real error surfaces honestly, not a fabricated success', async () => {
    mockAssignTaskToAgent.mockRejectedValue(new AgentDeactivatedError('agent-1', 'Reese'));

    const result = await applyConfirmedAssignWork('agent-1', pending, 'ali@colaberry.com', 'org-member-1');

    expect(result.summary).toContain("couldn't assign");
    expect(result.summary).toContain('deactivated');
  });

  it('an unrelated error is never swallowed — it propagates rather than being reported as a decline', async () => {
    mockAssignTaskToAgent.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(applyConfirmedAssignWork('agent-1', pending, 'ali@colaberry.com', 'org-member-1')).rejects.toThrow('ECONNREFUSED');
  });
});
