/**
 * agentToolCapabilities — Agent Detail transparency, part 2 (2026-08-18, session
 * CC-20260818-wf9k). Founder ask: "add what it reads and what it produces to the
 * AI agent detail page... derived from tools_granted... not hand-written free text
 * that could drift from reality."
 *
 * TOOL_CAPABILITIES is the one structured dictionary every agent's reads/produces
 * view is derived from — and, per Ali's own framing (2026-09-04, "a Global tool
 * chest so they can be reused across different agents"), THIS is that tool chest.
 * Before granting a new or existing agent a tool, check here first: reuse an
 * existing entry whose real behavior matches, rather than inventing a
 * differently-named tool that does the same thing. Only add a new entry when the
 * capability is genuinely new. See `build-platform-agent/SKILL.md`'s trust &
 * hierarchy section for the full onboarding checklist this backs.
 *
 * Each entry is grounded in the REAL implementing code (cited inline), not
 * invented — as of 2026-09-04, the full 35 distinct tool strings enumerated
 * across this repo's `AGENT_REGISTRY` (backend/src/services/agentRegistrySeed.ts):
 * Reese's 2, cory-engine's 4, CoryBrain's 3, InboxCaseEngine's 3,
 * workforce_intelligence_engine's 2, bpos_orchestrator's 3, the 16 department
 * Strategy Architects' shared 5 (PR #1576), AgentBehaviorMonitorAgent's 4, and 5
 * ticket/case auto-resolvers' 8 (WorkforceTicketAutoResolver,
 * CoryEngineTicketAutoResolver, CoryBrainInitiativeTicketAutoResolver,
 * InboxCaseSourceCompletionResolver, BposCapabilityTicketAutoResolver — added
 * while closing the coverage gap this file's own `undocumentedTools` surfacing
 * had been honestly flagging for them).
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

  // --- AgentBehaviorMonitorAgent (agentBehaviorMonitorAgent.ts, security_ops
  // cron, every 10 minutes — 3 anomaly checks + the security-alert write, added
  // 2026-09-04 closing this file's own previously-honest undocumentedTools gap) ---
  detect_stuck_agents: {
    reads: ['ai_agents.status / last_run_at — agents running longer than 15 minutes'],
    produces: [],
  },
  detect_agent_error_spikes: {
    reads: ['ai_agents.error_count — agents with more than 5 errors in the last hour'],
    produces: [],
  },
  detect_agent_duration_anomalies: {
    reads: ['ai_agents.avg_duration_ms — agents running more than 3x their own historical average'],
    produces: [],
  },
  create_security_alerts: {
    reads: [],
    produces: ['DepartmentEvent records (security-ops alert writes)'],
  },

  // --- 5 ticket/case auto-resolvers (added 2026-09-04). All 5 share one
  // pattern: deterministic re-derivation of the SAME condition the ticket/case
  // was opened under, never a time-based fallback — a still-open condition is
  // left untouched and reported, never force-closed. ---

  // WorkforceTicketAutoResolver (workforceTicketAutoResolver.ts) — re-checks the
  // exact >20% error-rate/>=10-error threshold a workforce_decision ticket was
  // opened under.
  close_workforce_tickets_on_recovery: {
    reads: ['The specific error-rate/error-count condition the ticket was opened under'],
    produces: ["Ticket status -> done, with a numbers-grounded evidence comment"],
  },

  // CoryEngineTicketAutoResolver (coryEngineTicketAutoResolver.ts) — re-runs
  // ProblemDiscoveryAgent's own detectAgentFailures()/detectConversionDrops()
  // against each open cory-engine ticket. error_spike tickets are deliberately
  // never auto-closed (a known bad SQL column reference makes that specific
  // re-check untrustworthy) — left untouched by design, not force-closed.
  query_lead_conversion_metrics: {
    reads: ['Lead conversion funnel metrics (ProblemDiscoveryAgent.detectConversionDrops())'],
    produces: [],
  },
  close_cory_engine_tickets_on_recovery: {
    reads: ['The specific detection condition (agent failure or conversion drop) the ticket was opened under'],
    produces: ["Ticket status -> done, with a numbers-grounded evidence comment"],
  },

  // CoryBrainInitiativeTicketAutoResolver (corybrainInitiativeTicketAutoResolver.ts)
  // — syncs a strategic initiative's parent/subtask tickets to the initiative's
  // own current live status; never decides completion/cancellation itself, only
  // propagates an already-established fact.
  query_strategic_initiative_status: {
    reads: ["The linked StrategicInitiative row's current status"],
    produces: [],
  },
  close_corybrain_tickets_on_initiative_terminal_state: {
    reads: [],
    produces: ['Ticket status -> done (initiative completed) or cancelled (initiative cancelled)'],
  },

  // InboxCaseSourceCompletionResolver (inboxCaseSourceCompletionResolver.ts) —
  // re-checks a case's linked basecamp_todo item via ops_bc_todos, then re-runs
  // the existing evaluateClosureGuard()/closeCase() authority unmodified; a
  // still-active todo or an undispositioned email item is left untouched.
  query_basecamp_todo_completion_status: {
    reads: ['ops_bc_todos — the Basecamp todo completion/trash disposition mirror'],
    produces: [],
  },
  close_inboxcase_cases_on_source_completion_or_existing_guard_pass: {
    reads: [],
    produces: ['Case item dispositions (RESOLVED/NO_ACTION) and case closures via the existing closeCase() authority'],
  },

  // BposCapabilityTicketAutoResolver (bposCapabilityTicketAutoResolver.ts) —
  // re-checks a capability_verification ticket's linked Capability row for a
  // real, human-asserted user_status:'verified' signal, or the row's own hard
  // deletion (capabilities has no soft-delete column). The ticket's original
  // completion route (the AI Project Builder's execution-ticket endpoint) was
  // deliberately retired 2026-07-18 with the backend left in place — this is
  // the replacement closure path.
  query_capability_verification_status: {
    reads: ["The linked Capability row's user_status, or its own continued existence"],
    produces: [],
  },
  close_bpos_tickets_on_capability_verified_or_deleted: {
    reads: [],
    produces: ['Ticket status -> done (capability verified) or cancelled (capability row deleted)'],
  },
};

/** One tool's own reads/produces, plus whether it has a dictionary entry at
 * all — the per-tool drill-down AgentDetailPage's "Tools & capabilities"
 * section renders (Ali, 2026-08-23: "I also would like to see the tool &
 * capability drill down so I can understand the tool better" — the aggregate
 * reads/produces lists alone don't say which tool a given fact came from). */
export interface ToolCapabilityDetail extends ToolCapability {
  tool: string;
  documented: boolean;
}

export interface AgentCapabilities {
  reads: string[];
  produces: string[];
  undocumentedTools: string[];
  byTool: ToolCapabilityDetail[];
}

/**
 * Derives an agent's aggregate reads/produces from its real, live `tools_granted`
 * array — never hand-written per-agent prose. De-duplicates across all of the
 * agent's tools. Any tool name with no dictionary entry (a future agent whose
 * tools haven't been documented here yet) is surfaced honestly in
 * `undocumentedTools`, never silently dropped from the result. `byTool` carries
 * the same facts broken out per tool, in `tools_granted` order, so a caller can
 * show "this specific tool reads X and produces Y" rather than only the
 * flattened, de-duplicated union.
 */
export function deriveAgentCapabilities(toolsGranted: string[] | null | undefined): AgentCapabilities {
  const reads = new Set<string>();
  const produces = new Set<string>();
  const undocumentedTools: string[] = [];
  const byTool: ToolCapabilityDetail[] = [];

  for (const tool of toolsGranted || []) {
    const capability = TOOL_CAPABILITIES[tool];
    if (!capability) {
      undocumentedTools.push(tool);
      byTool.push({ tool, reads: [], produces: [], documented: false });
      continue;
    }
    capability.reads.forEach((r) => reads.add(r));
    capability.produces.forEach((p) => produces.add(p));
    byTool.push({ tool, reads: capability.reads, produces: capability.produces, documented: true });
  }

  return {
    reads: Array.from(reads),
    produces: Array.from(produces),
    undocumentedTools,
    byTool,
  };
}
