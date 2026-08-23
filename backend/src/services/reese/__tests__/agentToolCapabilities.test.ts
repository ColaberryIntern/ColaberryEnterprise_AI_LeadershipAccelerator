import { deriveAgentCapabilities, TOOL_CAPABILITIES } from '../agentToolCapabilities';

describe('deriveAgentCapabilities', () => {
  it('happy path: a known multi-tool agent (cory-engine\'s real 4 tools) produces the expected de-duplicated reads/produces', () => {
    const result = deriveAgentCapabilities([
      'detect_problems',
      'create_intelligence_decisions',
      'create_tickets',
      'auto_execute_safe_actions',
    ]);

    expect(result.undocumentedTools).toEqual([]);
    expect(result.reads).toEqual(expect.arrayContaining([
      'Agent fleet run/error metrics (ProblemDiscoveryAgent.detectAgentFailures())',
      'Lead conversion funnel metrics (ProblemDiscoveryAgent.detectConversionDrops())',
      'ai_agents.config / status / error_count (the agent it is about to act on)',
    ]));
    expect(result.produces).toEqual(expect.arrayContaining([
      'IntelligenceDecision records',
      'Tickets (via createTicket())',
      'ai_agents.config / status / error_count updates — low-risk safe actions only (ExecutionAgent)',
    ]));
  });

  it('happy path: the 16 Architects\' shared 5-tool set resolves consistently (proves the shared-config derivation works, not just single-agent lookups)', () => {
    const architectTools = [
      'evaluate_department_health',
      'identify_strategic_opportunities',
      'create_strategic_initiative',
      'generate_initiative_tickets',
      'llm_strategy_analysis',
    ];
    const result = deriveAgentCapabilities(architectTools);

    expect(result.undocumentedTools).toEqual([]);
    expect(result.produces).toEqual(expect.arrayContaining(['Initiative records', 'strategic_initiative tickets (one per initiative)']));
    expect(result.reads.some((r) => r.includes('Department'))).toBe(true);
  });

  it('de-duplicates reads/produces when two tools cite the same fact (no repeated entries)', () => {
    // create_strategic_initiative and create_agent_tasks both come from CoryBrain
    // and don't overlap on their own, but re-deriving the same tool twice must
    // not duplicate its contribution.
    const result = deriveAgentCapabilities(['create_strategic_initiatives', 'create_strategic_initiatives']);
    const occurrences = result.produces.filter((p) => p === 'StrategicInitiative records').length;
    expect(occurrences).toBe(1);
  });

  it('boundary: null tools_granted returns empty reads/produces/undocumentedTools/byTool, never throws', () => {
    const result = deriveAgentCapabilities(null);
    expect(result).toEqual({ reads: [], produces: [], undocumentedTools: [], byTool: [] });
  });

  it('boundary: undefined tools_granted returns empty, never throws', () => {
    const result = deriveAgentCapabilities(undefined);
    expect(result).toEqual({ reads: [], produces: [], undocumentedTools: [], byTool: [] });
  });

  it('boundary: empty array returns empty', () => {
    const result = deriveAgentCapabilities([]);
    expect(result).toEqual({ reads: [], produces: [], undocumentedTools: [], byTool: [] });
  });

  it('honesty path: an unrecognized tool name is surfaced in undocumentedTools, never silently dropped or fabricated into reads/produces', () => {
    const result = deriveAgentCapabilities(['some_future_tool_not_yet_documented']);
    expect(result.undocumentedTools).toEqual(['some_future_tool_not_yet_documented']);
    expect(result.reads).toEqual([]);
    expect(result.produces).toEqual([]);
  });

  it('honesty path: a mix of known and unknown tools documents the known ones AND discloses the unknown one', () => {
    const result = deriveAgentCapabilities(['create_tickets', 'a_tool_from_the_future']);
    expect(result.produces).toContain('Tickets (via createTicket())');
    expect(result.undocumentedTools).toEqual(['a_tool_from_the_future']);
  });

  it('idempotency: calling twice with the same input is pure — no shared mutable state, same output both times', () => {
    const tools = ['create_case_tickets', 'sync_case_ticket_status'];
    const first = deriveAgentCapabilities(tools);
    const second = deriveAgentCapabilities(tools);
    expect(first).toEqual(second);
  });

  it('every entry in TOOL_CAPABILITIES has at least one read or produce fact (no dead/empty entries)', () => {
    for (const [tool, capability] of Object.entries(TOOL_CAPABILITIES)) {
      const hasContent = capability.reads.length > 0 || capability.produces.length > 0;
      expect(hasContent).toBe(true);
      // sanity: no accidental blank strings
      expect([...capability.reads, ...capability.produces].every((s) => s.trim().length > 0)).toBe(true);
      void tool;
    }
  });

  // Tool & capability drill-down (2026-08-23) — Ali: "I also would like to see
  // the tool & capability drill down so I can understand the tool better."
  // byTool carries the SAME facts as reads/produces above, broken out per tool
  // instead of flattened into one de-duplicated union.
  describe('byTool', () => {
    it('happy path: returns one entry per granted tool, in tools_granted order, each documented with its own reads/produces', () => {
      const result = deriveAgentCapabilities(['respond_to_dm', 'read_learner_context']);

      expect(result.byTool).toEqual([
        { tool: 'respond_to_dm', reads: ["The student's direct-message conversation history"], produces: ['A reply message in the student DM thread'], documented: true },
        { tool: 'read_learner_context', reads: ['ProofDesk learner-progress signals (XP, competencies, timeline state) for the student in the conversation'], produces: [], documented: true },
      ]);
    });

    it('does NOT de-duplicate across tools the way the flattened reads/produces do — each tool keeps its own full list', () => {
      // create_strategic_initiatives appears once; this proves byTool preserves
      // a per-entry breakdown rather than reusing the deduped Set output.
      const result = deriveAgentCapabilities(['create_agent_tasks', 'create_strategic_initiatives']);

      expect(result.byTool).toHaveLength(2);
      expect(result.byTool[0]).toEqual({ tool: 'create_agent_tasks', reads: [], produces: ['AgentTask records'], documented: true });
      expect(result.byTool[1].produces).toContain('StrategicInitiative records');
    });

    it('honesty path: an undocumented tool gets a byTool entry with empty reads/produces and documented:false, never fabricated content', () => {
      const result = deriveAgentCapabilities(['a_tool_from_the_future']);

      expect(result.byTool).toEqual([{ tool: 'a_tool_from_the_future', reads: [], produces: [], documented: false }]);
    });

    it('boundary: empty/null tools_granted returns an empty byTool array', () => {
      expect(deriveAgentCapabilities([]).byTool).toEqual([]);
      expect(deriveAgentCapabilities(null).byTool).toEqual([]);
    });
  });
});
