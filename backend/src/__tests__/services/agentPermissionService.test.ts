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
