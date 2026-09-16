/**
 * agentPermissionService — ProofDesk Milestone 4 registration coverage.
 * No test file previously existed for this service; scope kept to what T004 changed
 * (the 4 new AGENT_PERMISSIONS entries) plus the pure getAgentPermission()/default
 * lookup contract those entries depend on, per this task's acceptance criteria.
 */
import { getAgentPermission } from '../../services/agentPermissionService';
import { levelForTier, levelAllowsAction } from '../../services/agentAutonomy';

describe('agentPermissionService — ProofDesk capability-registry agents (Milestone 4)', () => {
  const proofDeskAgents = [
    'CurriculumArchitectAgent',
    'ArtifactGenerationAgent',
    'CurriculumQAAgent',
    'PlatformFixAgent',
  ];

  it.each(proofDeskAgents)('%s is registered as write_with_audit, not the suggest_only default', (agentName) => {
    const permission = getAgentPermission(agentName);
    expect(permission.tier).toBe('write_with_audit');
    expect(permission.allowedOperations).toContain('ticket_dispatch');
  });

  it.each(proofDeskAgents)('%s resolves to the act_audited ladder level, which permits write actions', (agentName) => {
    const permission = getAgentPermission(agentName);
    const level = levelForTier(permission.tier);
    expect(level).toBe('act_audited');
    expect(levelAllowsAction(level, 'ticket_dispatch')).toBe(true);
  });

  it('boundary: an unregistered agent name still falls to the suggest_only default (regression guard)', () => {
    const permission = getAgentPermission('SomeAgentThatDoesNotExist');
    expect(permission.tier).toBe('suggest_only');
    // ...and that default level would NOT permit a write-category action - this is
    // exactly the inaccurate-signal T004's own comment describes, confirming the
    // registration in this task is what fixes it, not an accidental side effect.
    expect(levelAllowsAction(levelForTier(permission.tier), 'ticket_dispatch')).toBe(false);
  });

  it('no pre-existing AGENT_PERMISSIONS entry was modified (additive-only regression guard)', () => {
    // Spot-check a handful of pre-existing entries across all 4 original tiers.
    expect(getAgentPermission('CampaignHealthScanner').tier).toBe('read_only');
    expect(getAgentPermission('ContentOptimizationAgent').tier).toBe('suggest_only');
    expect(getAgentPermission('CampaignRepairAgent').tier).toBe('write_with_audit');
    expect(getAgentPermission('AdmissionsSMSAgent').tier).toBe('communication');
  });
});

// AI Employee Consolidation Program (2026-09-16) — Ali, live: "I want the AI
// Agent to own the process." Dara's real writes (both curriculum-domain
// directors, re-pointed in directorActions.ts) now authorize under her own
// name. Without this entry she would silently fall to DEFAULT_PERMISSION
// (suggest_only, zero allowedOperations) and both real writes would start
// getting rejected — exactly the regression this test guards against.
describe('agentPermissionService — Dara (AI Employee Consolidation Program)', () => {
  it('Dara is registered as write_with_audit, covering both flag_curriculum and flag_certification — not the suggest_only default', () => {
    const permission = getAgentPermission('Dara');
    expect(permission.tier).toBe('write_with_audit');
    expect(permission.allowedTables).toEqual(['workforce_tasks']);
    expect(permission.allowedOperations).toEqual(expect.arrayContaining(['flag_curriculum', 'flag_certification']));
  });

  it('the legacy WorkforceCurriculumDirector/WorkforceCertificationDirector names now fall to the suggest_only default — a deliberate removal, not an oversight', () => {
    // Their own AiAgent rows still exist (absorbed, historical) but no longer
    // independently authorize a write — Dara's entry above is the real one now.
    expect(getAgentPermission('WorkforceCurriculumDirector').tier).toBe('suggest_only');
    expect(getAgentPermission('WorkforceCertificationDirector').tier).toBe('suggest_only');
  });

  it('Dara resolves to the act_audited ladder level, which permits her real write actions', () => {
    const permission = getAgentPermission('Dara');
    const level = levelForTier(permission.tier);
    expect(level).toBe('act_audited');
    expect(levelAllowsAction(level, 'flag_curriculum')).toBe(true);
    expect(levelAllowsAction(level, 'flag_certification')).toBe(true);
  });
});
