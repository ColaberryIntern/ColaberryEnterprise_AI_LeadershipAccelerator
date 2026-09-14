/**
 * Fleet-wide autonomy-level auto-classification, Phase 1 — the pure
 * classifier, tested against real agent `tools_granted` values pulled
 * straight from `agentRegistrySeed.ts` so the taxonomy's behavior on real
 * data is deliberate, not accidental. No wiring yet — this is the
 * zero-risk, fully-isolated first slice of the scoped plan.
 */
import { classifyAgentAutonomyLevel } from '../agentCapabilityClassifier';

describe('classifyAgentAutonomyLevel — real agent examples', () => {
  it('Reese: respond_to_dm is a communicate-tier tool, even alongside read-tier tools', () => {
    const result = classifyAgentAutonomyLevel([
      'respond_to_dm', 'read_learner_context', 'read_student_success_snapshot', 'assess_student_health',
    ]);

    expect(result.level).toBe('communicate');
    expect(result.matchedTool).toBe('respond_to_dm');
  });

  it('CoryBrain: create_/propose_ tools top out at act_audited (create_ outranks propose_)', () => {
    const result = classifyAgentAutonomyLevel([
      'create_agent_tasks', 'create_strategic_initiatives', 'propose_new_agents',
    ]);

    expect(result.level).toBe('act_audited');
    expect(result.matchedTool).toMatch(/^create_/);
  });

  it('AgentBehaviorMonitorAgent: detect_/create_ tools top out at act_audited', () => {
    const result = classifyAgentAutonomyLevel([
      'detect_stuck_agents', 'detect_agent_error_spikes', 'detect_agent_duration_anomalies',
      'create_security_alerts', 'create_tickets',
    ]);

    expect(result.level).toBe('act_audited');
  });

  it('department-health batch: evaluate_/identify_/create_/generate_/llm_strategy_analysis tops out at act_audited', () => {
    const result = classifyAgentAutonomyLevel([
      'evaluate_department_health', 'identify_strategic_opportunities', 'create_strategic_initiative',
      'generate_initiative_tickets', 'llm_strategy_analysis',
    ]);

    expect(result.level).toBe('act_audited');
    expect(result.matchedTool).toBe('create_strategic_initiative');
  });

  // Real production dry-run finding (2026-09-14, 166 real agents checked):
  // 'post_' used to be a communicate-tier keyword and wrongly promoted this
  // agent to the highest trust level — InboxCaseEngine's real tools are all
  // internal ticket-management actions ("post a progress note ON a
  // ticket"), never external communication. Caught by the "verify before
  // trusting" review step the classifier's own summarise() output is
  // designed to prompt, before any --apply ever ran. Regression-pinned here.
  it('InboxCaseEngine: internal ticket-comment tooling (post_case_progress_notes) stays act_audited, never promoted to communicate', () => {
    const result = classifyAgentAutonomyLevel(['create_case_tickets', 'sync_case_ticket_status', 'post_case_progress_notes']);

    expect(result.level).toBe('act_audited');
    expect(result.matchedTool).toBe('create_case_tickets');
  });

  it('boundary: a genuinely ambiguous real tool name (auto_execute_safe_actions) resolves on its verb, not the word "safe"', () => {
    // Isolated from its real sibling tools (detect_problems, create_intelligence_decisions,
    // create_tickets) deliberately: those are ALSO act_audited-tier, and the
    // classifier reports the first-encountered tool at the winning tier —
    // pairing the ambiguous tool with only a lower-tier one here is what
    // actually pins its own classification, not an earlier sibling's.
    const result = classifyAgentAutonomyLevel(['detect_problems', 'auto_execute_safe_actions']);

    expect(result.level).toBe('act_audited');
    expect(result.matchedTool).toBe('auto_execute_safe_actions');
  });
});

describe('classifyAgentAutonomyLevel — boundaries', () => {
  it('no tools_granted at all (null) is the safe observe default, not a guess', () => {
    const result = classifyAgentAutonomyLevel(null);

    expect(result.level).toBe('observe');
    expect(result.matchedTool).toBeNull();
    expect(result.reason).toMatch(/no tools_granted/i);
  });

  it('undefined tools_granted is treated the same as null', () => {
    const result = classifyAgentAutonomyLevel(undefined);

    expect(result.level).toBe('observe');
  });

  it('an empty array is treated the same as no data, not zero-capability evidence', () => {
    const result = classifyAgentAutonomyLevel([]);

    expect(result.level).toBe('observe');
    expect(result.reason).toMatch(/no tools_granted/i);
  });

  it('a real but entirely unrecognized tool name still defaults to observe, and says so honestly rather than implying a match', () => {
    const result = classifyAgentAutonomyLevel(['llm_strategy_analysis']);

    expect(result.level).toBe('observe');
    expect(result.matchedTool).toBeNull();
    expect(result.reason).toMatch(/none of this agent's 1 granted tool/i);
  });

  it('pure suggest-tier tools (propose_/identify_/generate_ only) classify as suggest, not act_audited', () => {
    const result = classifyAgentAutonomyLevel(['propose_content_rewrite']);

    expect(result.level).toBe('suggest');
  });

  it('pure observe-tier tools (read_/query_ only) classify as observe with a real matched tool, distinct from the no-data default', () => {
    const result = classifyAgentAutonomyLevel(['read_learner_context', 'query_agent_fleet_stats']);

    expect(result.level).toBe('observe');
    expect(result.matchedTool).not.toBeNull();
  });

  it('takes the maximum tier across mixed tools regardless of array order', () => {
    const forward = classifyAgentAutonomyLevel(['read_x', 'send_email']);
    const reversed = classifyAgentAutonomyLevel(['send_email', 'read_x']);

    expect(forward.level).toBe('communicate');
    expect(reversed.level).toBe('communicate');
  });
});
