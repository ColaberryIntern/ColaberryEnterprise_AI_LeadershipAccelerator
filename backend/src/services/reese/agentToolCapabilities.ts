/**
 * agentToolCapabilities — Agent Detail transparency, part 2 (2026-08-18, session
 * CC-20260818-wf9k). Founder ask: "add what it reads and what it produces to the
 * AI agent detail page... derived from tools_granted... not hand-written free text
 * that could drift from reality."
 *
 * TOOL_CAPABILITIES is the one structured dictionary every agent's reads/produces
 * view is derived from. Each entry is grounded in the REAL implementing code (cited
 * inline), not invented — the exact same 22 distinct tool strings enumerated across
 * this repo's `AGENT_REGISTRY` for every agent that appears on the Workforce OS
 * Live Agents panel (backend/src/services/agentRegistrySeed.ts): Reese's 2,
 * cory-engine's 4, CoryBrain's 3, InboxCaseEngine's 3,
 * workforce_intelligence_engine's 2, bpos_orchestrator's 3, and the 16 department
 * Strategy Architects' shared 5 (PR #1576).
 *
 * A tool granted to a future agent that isn't in this dictionary yet is surfaced
 * honestly via `undocumentedTools` (deriveAgentCapabilities below), never silently
 * dropped — matching this repo's established honesty pattern (e.g.
 * workforce_intelligence_engine's disclosed anti-pattern-scan FAIL in the Agent
 * Ticket Standard validator).
 */

export interface ToolCapability {
  /** What real data this tool reads FROM — tables, models, or external signals. */
  reads: string[];
  /** What this tool actually creates or writes. */
  produces: string[];
}

export const TOOL_CAPABILITIES: Record<string, ToolCapability> = {
  // --- Reese (ai_staff_mentor) ---
  respond_to_dm: {
    reads: ['The student\'s direct-message conversation history'],
    produces: ['A reply message in the student DM thread'],
  },
  read_learner_context: {
    reads: ['ProofDesk learner-progress signals (XP, competencies, timeline state) for the student in the conversation'],
    produces: [],
  },

  // --- cory-engine (autonomousEngine.ts's runAutonomousCycle(), 8-step pipeline —
  // grounded in agentRegistrySeed.ts's own re-verified comment) ---
  detect_problems: {
    reads: ['Agent fleet run/error metrics (ProblemDiscoveryAgent.detectAgentFailures())', 'Lead conversion funnel metrics (ProblemDiscoveryAgent.detectConversionDrops())'],
    produces: [],
  },
  create_intelligence_decisions: {
    reads: [],
    produces: ['IntelligenceDecision records'],
  },
  create_tickets: {
    reads: [],
    produces: ['Tickets (via createTicket())'],
  },
  auto_execute_safe_actions: {
    reads: ['ai_agents.config / status / error_count (the agent it is about to act on)'],
    produces: ['ai_agents.config / status / error_count updates — low-risk safe actions only (ExecutionAgent)'],
  },

  // --- CoryBrain (coryInitiatives.ts / coryBrain.ts) ---
  create_agent_tasks: {
    reads: [],
    produces: ['AgentTask records'],
  },
  create_strategic_initiatives: {
    reads: [],
    produces: ['StrategicInitiative records', 'Initiative parent + subtask tickets (createStrategicInitiative())'],
  },
  propose_new_agents: {
    reads: [],
    produces: ['AgentCreationProposal records (never auto-creates an agent — admin approval required)'],
  },

  // --- InboxCaseEngine (caseTicketService.ts) ---
  create_case_tickets: {
    reads: ['Inbox case records (one ticket per case, deduped via createTicket()\'s entity dedup)'],
    produces: ['Tickets (one per inbox case)'],
  },
  sync_case_ticket_status: {
    reads: ['The linked inbox case\'s live progression state'],
    produces: ['Ticket status transitions (backlog -> todo -> in_progress -> in_review -> done, mirroring the case)'],
  },
  post_case_progress_notes: {
    reads: [],
    produces: ['Narrative progress comments on the linked ticket'],
  },

  // --- workforce_intelligence_engine (workforceIntelligenceEngine.ts's
  // runWorkforceAnalysis() — deterministic rules, no LLM) ---
  query_agent_fleet_stats: {
    reads: ['ai_agents fleet-wide run_count / error_count (direct SQL)'],
    produces: [],
  },
  create_workforce_tickets: {
    reads: [],
    produces: ['workforce_decision tickets (one per insight, deduped while a finding for the same agent/condition stays open)'],
  },

  // --- bpos_orchestrator (ticketOrchestrator.ts) ---
  create_bpos_tickets: {
    reads: [],
    produces: ['bpos_execution tickets (createBPOSTicket())'],
  },
  transition_bpos_ticket_status: {
    reads: [],
    produces: ['Ticket status transitions (updateTicketStatus())'],
  },
  attach_build_outputs: {
    reads: [],
    produces: ['Real build outputs attached to the ticket\'s activity feed (addTicketOutput())'],
  },

  // --- The 16 department Strategy Architects (strategyArchitectAgent.ts, all 16
  // share this identical 5-tool set — PR #1576). Grounded directly in the file's
  // real imports/usage: Department, DepartmentEvent, Initiative models;
  // getOpenAIClient() for the LLM step; generateInitiativeTickets(). ---
  evaluate_department_health: {
    reads: ['Department records (the agent\'s own department row)', 'DepartmentEvent history for that department'],
    produces: [],
  },
  identify_strategic_opportunities: {
    reads: ['Department + DepartmentEvent history', 'Existing Initiative records (to avoid redundant proposals)'],
    produces: [],
  },
  create_strategic_initiative: {
    reads: [],
    produces: ['Initiative records', 'DepartmentEvent records (DepartmentEvent.create())'],
  },
  generate_initiative_tickets: {
    reads: [],
    produces: ['strategic_initiative tickets (one per initiative)'],
  },
  llm_strategy_analysis: {
    reads: ['Department health + opportunity signals, reasoned over via GPT-4o (getOpenAIClient())'],
    produces: [],
  },
};

export interface AgentCapabilities {
  reads: string[];
  produces: string[];
  undocumentedTools: string[];
}

/**
 * Derives an agent's aggregate reads/produces from its real, live `tools_granted`
 * array — never hand-written per-agent prose. De-duplicates across all of the
 * agent's tools. Any tool name with no dictionary entry (a future agent whose
 * tools haven't been documented here yet) is surfaced honestly in
 * `undocumentedTools`, never silently dropped from the result.
 */
export function deriveAgentCapabilities(toolsGranted: string[] | null | undefined): AgentCapabilities {
  const reads = new Set<string>();
  const produces = new Set<string>();
  const undocumentedTools: string[] = [];

  for (const tool of toolsGranted || []) {
    const capability = TOOL_CAPABILITIES[tool];
    if (!capability) {
      undocumentedTools.push(tool);
      continue;
    }
    capability.reads.forEach((r) => reads.add(r));
    capability.produces.forEach((p) => produces.add(p));
  }

  return {
    reads: Array.from(reads),
    produces: Array.from(produces),
    undocumentedTools,
  };
}
