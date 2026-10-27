/**
 * The "Repairs Today" counter has to recognize the repairs that are actually logged.
 *
 * Quincy, 2026-10-26: the AI Ops overview counts activity rows whose action contains "repair",
 * and OrchestrationAutoRepairAgent logs `reactivate_prompt`, `null_broken_fk` and
 * `null_broken_artifact_fk`. None of the three contains the word, so every repair that agent has
 * ever made was missing from the only number on the dashboard that reports repairs.
 *
 * The drift test below is the point of the file: it fails if someone adds a fourth repair action
 * to the agent without the counter learning about it, which is exactly how this happened the
 * first time.
 *
 * Mutation that kills a NAMED test: drop the named-action branch from `isRepairAction` and
 * "recognizes every action the auto-repair agent can log" fails.
 */
// agentPermissionService reaches the models layer on import; the wiring assertion below only
// needs its static permission table, so the models are stubbed rather than stood up.
jest.mock('../../../models', () => ({ AiAgent: {} }));
jest.mock('../../../models/AgentWriteAudit', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/ProposedAgentAction', () => ({ __esModule: true, default: {} }));
jest.mock('../../agentAuthorizationService', () => ({ authorizeAgentAction: jest.fn() }));

import { ORCHESTRATION_REPAIR_ACTIONS, isRepairAction } from '../repairActions';

describe('isRepairAction', () => {
  it('recognizes every action the auto-repair agent can log', () => {
    for (const action of ORCHESTRATION_REPAIR_ACTIONS) {
      expect({ action, counted: isRepairAction(action) }).toEqual({ action, counted: true });
    }
  });

  it('still recognizes the actions the old ILIKE caught, so nobody loses a count', () => {
    for (const action of ['auto_repair', 'campaign_repair_retry', 'REPAIR_SOMETHING', 'post_repair_retest']) {
      expect(isRepairAction(action)).toBe(true);
    }
  });

  it('does not count things that are not repairs', () => {
    for (const action of ['scan_completed_no_issues', 'secret_scan', 'dependency_audit', '3 action(s): flag_lead']) {
      expect({ action, counted: isRepairAction(action) }).toEqual({ action, counted: false });
    }
  });

  it('treats an empty or missing action as not a repair', () => {
    expect(isRepairAction('')).toBe(false);
    expect(isRepairAction(null)).toBe(false);
    expect(isRepairAction(undefined)).toBe(false);
  });

  it('matches an action embedded in a longer summary line', () => {
    // runAgent logs multi-action runs as "2 action(s): reactivate_prompt, null_broken_fk", so the
    // counter sees the names inside a sentence rather than on their own.
    expect(isRepairAction('2 action(s): reactivate_prompt, null_broken_fk')).toBe(true);
  });
});

describe('the list is the contract', () => {
  it('is what the permission layer allows', async () => {
    // agentPermissionService spreads this same list into allowedOperations. If the two ever
    // diverge, a repair the agent is willing to make becomes one the permission layer refuses,
    // which fails at runtime and not here — so assert the wiring.
    const { getAgentPermission } = await import('../../agentPermissionService');
    const permission = getAgentPermission('OrchestrationAutoRepairAgent');
    expect(permission.allowedOperations).toEqual([...ORCHESTRATION_REPAIR_ACTIONS]);
  });

  it('holds exactly the three actions the agent writes today', () => {
    // A deliberate tripwire. Adding a repair action means updating this expectation, and the
    // counter and permission layer pick it up from the same list automatically.
    expect([...ORCHESTRATION_REPAIR_ACTIONS]).toEqual([
      'reactivate_prompt',
      'null_broken_fk',
      'null_broken_artifact_fk',
    ]);
  });
});
