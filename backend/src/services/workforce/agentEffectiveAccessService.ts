/**
 * agentEffectiveAccessService — the Reese manager-growth mission's Phase 3
 * "effective access" resolver (T09). Reconciles the real, scattered
 * tool/capability authority sources found by this phase's own discovery pass
 * into one honest, READ-ONLY report per agent. Never writes anything, never
 * calls authorizeAgentAction() (which performs real work-ledger writes), and
 * never changes what any live authorization decision returns — see
 * `.loop-architect/runs/20261001-reese-manager-growth-phase3/execution-contract.md`
 * for the full discovery findings this file is built on.
 *
 * Deliberately a NEW module, not a rewrite of any of the 10 sources it reads —
 * T09's own instruction is "preserve stable identifiers and existing grants...
 * migrate without silently expanding access." Nothing is migrated here, only
 * read and reported.
 *
 * R198 design note (deviation from plan.md's literal wording, disclosed): the
 * plan originally called for adding `autonomy_level_source` to
 * `agentAuthorizationService.ts`'s own `fetchAgentRegistryRow()` SELECT so
 * this resolver could read it from there. Implemented instead as a fully
 * independent read, directly off this file's own unrestricted
 * `AiAgent.findByPk()` call below (which already returns every column,
 * `autonomy_level_source` included, with no `attributes` filter). This
 * achieves the identical disclosure goal with STRICTLY LOWER blast radius
 * than the plan specified: `agentAuthorizationService.ts` — the file Reese's
 * real, live `enforce`-mode authorization decisions run through — is not
 * touched by this task AT ALL, so the "resolveLevel()'s live behavior is
 * byte-for-byte unchanged" regression this task requires is true by
 * construction, not just by a before/after test.
 */
import AiAgent from '../../models/AiAgent';
import { listAgentTools } from '../agents/tools/agentToolRegistry';
import type { AgentKey } from '../agents/tools/types';
import { REESE_TOOLS } from '../reese/reeseTools';
import { DARA_TOOLS } from '../curriculum/daraTools';
import { getAgentPermission, type PermissionTier } from '../agentPermissionService';
import { TOOL_CAPABILITIES } from '../reese/agentToolCapabilities';
import { CAPABILITY_REGISTRY } from '../workGraph/capabilityRegistry';
import { SIBLING_REGISTRY_NAME } from '../reese/reeseBehaviourSwitchService';
import { getAbacMode, resolveEffectiveMode, type AbacMode } from '../agentAuthorizationService';
import { levelForTier, levelAllowsAction, actionRequiresApproval, type AutonomyLevel } from '../agentAutonomy';

/** One tool's reconciled view across every source that mentions it. */
export interface ToolAccessReport {
  toolName: string;
  /** A real handler exists for this agent+tool (GRANTS or the agent's own
   * OpenAI-tool-schema array) — distinct from merely being GRANTED. */
  registered: boolean;
  /** Which grant-shaped sources mention this tool for this agent, by name
   * (e.g. 'GRANTS', 'tools_granted'). Empty means no source grants it. */
  grantedVia: string[];
  /** Plain-English notes when sources disagree about this one tool. */
  mismatches: string[];
  /** Display metadata from TOOL_CAPABILITIES (source #3) — NEVER treated as a
   * grant; purely descriptive, matching the real file's own "display-only"
   * role. `documented: false` means this tool is granted/registered somewhere
   * but TOOL_CAPABILITIES has no entry for it (e.g. several of Dara's real
   * tools, per this phase's own Phase-1 finding that the file's header
   * undercounts her) — surfaced honestly, never silently dropped. */
  reads: string[];
  produces: string[];
  documented: boolean;
  /** Would a real execution-time check allow this RIGHT NOW, given the
   * agent's current `abac_enforcement`/`abac_mode_override` effective mode
   * and resolved autonomy level — computed via `agentAutonomy.ts`'s own
   * pure, dependency-free policy functions, never by calling
   * `authorizeAgentAction()` (which performs real work-ledger writes this
   * read-only resolver must never trigger). Always `true` when the tool
   * isn't even registered/granted (nothing to evaluate) is WRONG — see
   * `computeUsable()`'s own doc comment for the real, honest rule.
   *
   * HONESTY CAVEAT, disclosed rather than hidden: this evaluates the TOOL
   * NAME itself as if it were an action identifier (e.g.
   * 'read_student_success_snapshot'), the exact same free-form string
   * `agentAutonomy.ts`'s classifier is designed to receive — but per this
   * phase's own discovery, NONE of Reese's or Dara's real tools go through
   * `authorizeAgentAction()` at all today (`executeReeseTool()`/
   * `executeDaraTool()` have no authorization call of any kind). So
   * `usable: true` here is a POLICY PREDICTION ("if this were gated, would
   * it pass"), never a claim that this tool call is actually being
   * authorized right now — that remains a real, separate T12 gap. */
  usable: boolean;
}

/** Honest provenance for `AiAgent.autonomy_level` — NEVER conflates an
 * unreviewed keyword match with a deliberate human decision. `'unknown'` is
 * a real, distinct case: `autonomy_level_set_at` is stamped (someone set a
 * level) but `autonomy_level_source` is null, because that column was added
 * later (`ensureAiAgentAutonomySourceSchema.ts`'s own migration note: "NULL
 * for every existing row... never backfilled to a guessed value") — a
 * legitimately ambiguous legacy case, not something to guess toward
 * 'manual'. This field is computed independently of, and never fed back
 * into, `resolveLevel()` — see this file's header note. */
export type AutonomyProvenance = 'auto' | 'manual' | 'unknown' | 'never_set';

/** One real `AiAgent` row's own `enabled` state. `role: 'main'` is the
 * agent's own row; `role: 'sibling'` is a separate, cron-registered row tied
 * to the same real agent (Reese's 4, today — see
 * `reeseBehaviourSwitchService.ts`'s own `SIBLING_REGISTRY_NAME`). Reported
 * individually, never collapsed into one boolean — collapsing would repeat
 * the exact human-facing illusion this task exists to correct (that
 * disabling "the agent" in Admin > Agents stops everything it does). */
export interface EnabledRowReport {
  agentName: string;
  enabled: boolean;
  role: 'main' | 'sibling';
}

/** One agent's full effective-access report. */
export interface AgentEffectiveAccessReport {
  agentId: string;
  agentName: string;
  permissionTier: PermissionTier;
  autonomyLevel: string | null;
  autonomyProvenance: AutonomyProvenance;
  /** This agent's real, current effective mode — its own
   * `abac_mode_override` if set, otherwise the global `abac_enforcement`
   * setting. Context for interpreting every tool's `usable` field below. */
  abacMode: AbacMode;
  enabledRows: EnabledRowReport[];
  tools: ToolAccessReport[];
  /** Prompt-level instruction, never a code gate — source #4
   * (`reeseCharterAuthority.ts`'s own real finding: a role charter's
   * authority lists are injected into the agent's system prompt as LLM
   * persuasion, not enforced by any code boundary). Present for every agent
   * this report covers, not merged into any tool's `grantedVia`. */
  charterNote: string;
  /** Plain-English notes not tied to one specific tool. */
  mismatches: string[];
}

function computeAutonomyProvenance(agent: AiAgent): AutonomyProvenance {
  if (!agent.autonomy_level_set_at) return 'never_set';
  if (agent.autonomy_level_source === 'auto') return 'auto';
  if (agent.autonomy_level_source === 'manual') return 'manual';
  return 'unknown';
}

/** Every real `AiAgent` row tied to this agent — main row plus, for Reese
 * specifically, her 4 real cron-registered sibling rows
 * (`reeseBehaviourSwitchService.ts`'s own `SIBLING_REGISTRY_NAME`, reused
 * rather than duplicated). Every other agent has no known siblings today —
 * reported as just its own single row, never guessed. A missing sibling row
 * (shouldn't happen in practice, but the seed could drift) is skipped
 * silently rather than thrown — this resolver never blocks on missing data,
 * matching every other source's fail-open posture in this file. */
async function resolveEnabledRows(agent: AiAgent): Promise<EnabledRowReport[]> {
  const rows: EnabledRowReport[] = [{ agentName: agent.agent_name, enabled: agent.enabled, role: 'main' }];

  if (agent.agent_name === 'Reese') {
    const siblingNames = Array.from(new Set(Object.values(SIBLING_REGISTRY_NAME))).filter(
      (name): name is string => Boolean(name),
    );
    for (const siblingName of siblingNames) {
      const sibling = await AiAgent.findOne({ where: { agent_name: siblingName } });
      if (sibling) rows.push({ agentName: siblingName, enabled: sibling.enabled, role: 'sibling' });
    }
  }

  return rows;
}

/** Mirrors `agentAuthorizationService.ts`'s own private `resolveLevel()`
 * logic EXACTLY — deliberately duplicated here rather than exported and
 * reused, so this read-only resolver's own disclosure numbers can never
 * accidentally diverge FROM a shared edit, and (per R198's own header note)
 * so that file keeps being the one Reese's real, live `enforce`-mode
 * decisions run through, untouched by this phase. If that file's real logic
 * ever changes, this copy must be updated to match — flagged here so a
 * future edit to the real one doesn't silently leave this report wrong. */
function computeResolvedLevel(agent: AiAgent, tier: PermissionTier): AutonomyLevel {
  if (agent.autonomy_level_set_at && agent.autonomy_level) return agent.autonomy_level as AutonomyLevel;
  return levelForTier(tier);
}

/** Would a real execution-time check allow this tool right now? See
 * `ToolAccessReport.usable`'s own doc comment for the full honesty caveat.
 * Mirrors `authorizeAgentAction()`'s real policy SHAPE (not its kill-switch/
 * safe-mode checks, which this field's own documented scope in
 * execution-contract.md explicitly excludes — mode + autonomy level only):
 * not registered/granted -> never usable; agent disabled -> never usable;
 * mode isn't 'enforce' -> always usable (shadow/off never actually block);
 * mode is 'enforce' -> usable only if the level allows the action category
 * AND it doesn't require a human approval first. */
function computeUsable(
  agent: AiAgent,
  toolName: string,
  registered: boolean,
  grantedVia: string[],
  effectiveMode: AbacMode,
  resolvedLevel: AutonomyLevel,
): boolean {
  if (!registered || grantedVia.length === 0) return false;
  if (!agent.enabled) return false;
  if (effectiveMode !== 'enforce') return true;
  if (!levelAllowsAction(resolvedLevel, toolName)) return false;
  return !actionRequiresApproval(toolName).required;
}

const CHARTER_NOTE =
  'A role charter’s authority lists (autonomous / approval-required / forbidden), where one exists, are injected into this agent’s system prompt as an LLM instruction — not enforced by any code boundary. Never treated as a grant or a block by this resolver.';

/** The 4 real ProofDesk Work Graph agents (source #10) —
 * `capabilityRegistry.ts`'s own real `agent_name` values, not guessed. */
const PROOFDESK_AGENT_NAMES = new Set([
  'CurriculumArchitectAgent',
  'ArtifactGenerationAgent',
  'CurriculumQAAgent',
  'PlatformFixAgent',
]);

/** 'Reese' -> 'reese', 'Dara' -> 'dara' — the only 2 real matches today.
 * Deliberately NOT a fuzzy or configurable mapping: `agentToolRegistry.ts`'s
 * own `AgentKey` union is a small, hand-maintained set of exactly 3 literal
 * keys, so guessing beyond a case-fold would silently paper over a real gap
 * (e.g. 'CoryBrain' correctly does NOT match 'cory' — it is a different real
 * agent, and conflating them would misreport her real access). */
function toAgentKey(agentName: string): AgentKey | null {
  const candidate = agentName.toLowerCase();
  return candidate === 'cory' || candidate === 'reese' || candidate === 'dara'
    ? (candidate as AgentKey)
    : null;
}

/** Tool names this agent has a real, callable handler for, per source #2 —
 * Reese's `REESE_TOOLS` or Dara's `DARA_TOOLS` (both OpenAI tool-schema
 * arrays). Every other agent has none today — reported honestly as empty,
 * never guessed. */
function registeredHandlerToolNames(agentName: string): string[] {
  // Both arrays are typed as OpenAI's broader ChatCompletionTool union (which
  // also allows a 'custom' tool shape with no `.function`), but every real
  // entry in REESE_TOOLS/DARA_TOOLS is the function-tool variant — narrowed
  // explicitly rather than widening either array's own real, correct type.
  if (agentName === 'Reese') {
    return REESE_TOOLS.filter((t): t is typeof t & { type: 'function' } => t.type === 'function').map((t) => t.function.name);
  }
  if (agentName === 'Dara') {
    return DARA_TOOLS.filter((t): t is typeof t & { type: 'function' } => t.type === 'function').map((t) => t.function.name);
  }
  return [];
}

export async function resolveEffectiveAccess(agentId: string): Promise<AgentEffectiveAccessReport | null> {
  const agent = await AiAgent.findByPk(agentId);
  if (!agent) return null;

  const agentKey = toAgentKey(agent.agent_name);
  const grantsTools: string[] = agentKey ? listAgentTools(agentKey) : [];
  const registeredTools = registeredHandlerToolNames(agent.agent_name);
  const toolsGranted: string[] = agent.tools_granted ?? [];
  const permissionTier = getAgentPermission(agent.agent_name).tier;

  const allToolNames = new Set<string>([...grantsTools, ...registeredTools, ...toolsGranted]);

  const globalMode = await getAbacMode();
  const effectiveMode = resolveEffectiveMode(globalMode, agent.abac_mode_override);
  const resolvedLevel = computeResolvedLevel(agent, permissionTier);

  const tools: ToolAccessReport[] = Array.from(allToolNames)
    .sort()
    .map((toolName) => {
      const grantedVia: string[] = [];
      if (grantsTools.includes(toolName)) grantedVia.push('GRANTS');
      if (registeredTools.includes(toolName)) grantedVia.push(agent.agent_name === 'Reese' ? 'REESE_TOOLS' : 'DARA_TOOLS');
      if (toolsGranted.includes(toolName)) grantedVia.push('tools_granted');

      const mismatches: string[] = [];
      if (grantedVia.length > 0 && !toolsGranted.includes(toolName)) {
        mismatches.push(`granted via ${grantedVia.join(', ')} but absent from tools_granted`);
      }

      const capability = TOOL_CAPABILITIES[toolName];
      if (!capability) {
        mismatches.push('granted/registered but has no TOOL_CAPABILITIES entry (undocumented)');
      }

      const registered = grantsTools.includes(toolName) || registeredTools.includes(toolName);

      return {
        toolName,
        registered,
        grantedVia,
        mismatches,
        reads: capability?.reads ?? [],
        produces: capability?.produces ?? [],
        documented: Boolean(capability),
        usable: computeUsable(agent, toolName, registered, grantedVia, effectiveMode, resolvedLevel),
      };
    });

  const agentMismatches: string[] = [];
  if (PROOFDESK_AGENT_NAMES.has(agent.agent_name)) {
    const entries = CAPABILITY_REGISTRY.filter((e) => e.agent_name === agent.agent_name);
    for (const entry of entries) {
      // Flagged unconditionally, not only when the live and hardcoded values
      // currently disagree — the structural problem is standing, not
      // transient: capabilityRegistry.ts's `enabled` NEVER reads
      // AiAgent.enabled, so a future admin disabling this agent (expecting
      // ticketAgentDispatcher.ts to stop dispatching to it) would be wrong
      // regardless of what the two values happen to equal right now.
      agentMismatches.push(
        `capabilityRegistry.ts's '${entry.capabilityId}' entry has a hardcoded enabled:${entry.enabled} literal that never reads this agent's real AiAgent.enabled (currently ${agent.enabled}) — disabling this agent here has no effect on ticketAgentDispatcher.ts's real dispatch decisions for it`,
      );
    }
  }

  const enabledRows = await resolveEnabledRows(agent);
  const disagreeingSiblings = enabledRows.filter((r) => r.role === 'sibling' && r.enabled !== agent.enabled);
  if (disagreeingSiblings.length > 0) {
    agentMismatches.push(
      `${disagreeingSiblings.length} of this agent's cron-registered sibling rows (${disagreeingSiblings
        .map((r) => `${r.agentName}: enabled=${r.enabled}`)
        .join(', ')}) disagree with the main row's enabled=${agent.enabled} — disabling "${agent.agent_name}" in Admin > Agents does not cascade to these`,
    );
  }

  return {
    agentId: agent.id,
    agentName: agent.agent_name,
    permissionTier,
    autonomyLevel: agent.autonomy_level,
    autonomyProvenance: computeAutonomyProvenance(agent),
    abacMode: effectiveMode,
    enabledRows,
    tools,
    charterNote: CHARTER_NOTE,
    mismatches: agentMismatches,
  };
}

/** One real drift finding — a disagreement or gap this resolver's own
 * sources (or this phase's own prior discovery) found between what's
 * declared and what's real. */
export interface DriftFinding {
  agentName: string;
  /** Null for the hand-curated execution-gating findings below when the
   * named agent can't be resolved against the real fleet at report-build
   * time (shouldn't happen in practice, but never guessed) — the UI's deep
   * link degrades honestly rather than pointing at a wrong agent. */
  agentId: string | null;
  description: string;
}

export interface InventoryDriftReport {
  generatedAt: string;
  findings: DriftFinding[];
}

/** Real, execution-TIME gating gaps this phase's own discovery confirmed —
 * NOT derivable from the 10 "grant" sources `resolveEffectiveAccess()` reads
 * above (those answer "is this tool declared/granted," never "does the real
 * call site actually invoke the authorization chokepoint before it runs").
 * A small, hand-curated list, the same honest pattern `TOOL_CAPABILITIES`
 * and `AGENT_PERMISSIONS` already use elsewhere in this codebase — grounded
 * in this phase's own confirmed findings, not guessed, and deliberately NOT
 * claiming to be exhaustive across every one of the ~15 real call sites this
 * phase's discovery mapped (see execution-contract.md for the full map).
 * Every entry here is a finding this Phase 3 slice deliberately did NOT
 * close (see execution-contract.md's "Explicitly out of scope" / STOP AND
 * ASK) — if a future phase closes one, remove it here too, or this report
 * starts lying by omission in the other direction. */
const KNOWN_EXECUTION_GATING_GAPS: Array<Omit<DriftFinding, 'agentId'>> = [
  {
    agentName: 'Dara',
    description:
      "escalate_to_human (daraTools.ts's escalateToHumanTool — a real side-effecting handoff-ticket creation) has zero authorization or kill-switch check before it executes. Not closed this phase: fixing it means adding Reese-style blocking enforcement to Dara for the first time, a real governance decision flagged for Ali, not an implementation default.",
  },
  {
    agentName: 'Dara',
    description:
      "Dara's reply path (daraReplyService.ts's maybeTriggerDaraReply) has zero authorization call AND zero kill-switch check of any kind — no isDaraEnabled() function exists anywhere in this codebase. Same STOP-AND-ASK as escalate_to_human above.",
  },
  ...Array.from(PROOFDESK_AGENT_NAMES).map((agentName) => ({
    agentName,
    description:
      "ticketAgentDispatcher.ts's authorizeTicketDispatchSafe() computes a real authorization verdict but discards it before dispatchTicketToAgent() runs the real mapping.execute() — the central task runner's enforcement is dead code, platform-wide (every dispatched/retried ticket for every agent routed through it, not only this one). Not closed this phase — a production-infrastructure-scale change flagged for Ali, not an implementation default.",
  })),
];

/** Aggregates every real mismatch this resolver's own sources find, across
 * every registered agent, plus the hand-curated execution-gating gaps above
 * — the full A09 drift report. Admin-diagnostic surface, not a hot path:
 * calls `resolveEffectiveAccess()` once per real agent (each does its own
 * `AiAgent.findByPk`, a small, accepted redundancy against the single
 * `findAll()` below, traded for reusing one well-tested code path rather
 * than a second, parallel aggregation implementation that could drift from
 * it). */
export async function buildInventoryDriftReport(): Promise<InventoryDriftReport> {
  const agents = await AiAgent.findAll();
  const findings: DriftFinding[] = [];

  for (const agent of agents) {
    const report = await resolveEffectiveAccess(agent.id);
    if (!report) continue;

    for (const mismatch of report.mismatches) {
      findings.push({ agentName: report.agentName, agentId: report.agentId, description: mismatch });
    }
    for (const tool of report.tools) {
      for (const mismatch of tool.mismatches) {
        findings.push({ agentName: report.agentName, agentId: report.agentId, description: `${tool.toolName}: ${mismatch}` });
      }
    }
  }

  // Curated findings only name an agent by string — resolve each against
  // the SAME real fleet list already fetched above, rather than a second
  // query. Honestly null (never guessed) when no live match is found.
  for (const gap of KNOWN_EXECUTION_GATING_GAPS) {
    const matched = agents.find((a) => a.agent_name === gap.agentName);
    findings.push({ ...gap, agentId: matched?.id ?? null });
  }

  return { generatedAt: new Date().toISOString(), findings };
}

/** One tool's fleet-wide view — T10's own spec ("search/filter by tool...
 * assigned agents... versions, usage/failures") needs a TOOL-centric catalog,
 * not just the agent-centric drift report above. Added after writing the
 * route layer surfaced that `buildInventoryDriftReport()` alone doesn't
 * satisfy T10's literal ask — caught and fixed before shipping, not a silent
 * gap. */
export interface ToolCatalogEntry {
  toolName: string;
  reads: string[];
  produces: string[];
  documented: boolean;
  assignedAgents: Array<{
    agentId: string;
    agentName: string;
    registered: boolean;
    grantedVia: string[];
    usable: boolean;
  }>;
}

export interface ToolCatalog {
  generatedAt: string;
  tools: ToolCatalogEntry[];
}

/** Same admin-diagnostic-surface tradeoff as `buildInventoryDriftReport()`
 * above (its own doc comment explains the accepted per-agent
 * `resolveEffectiveAccess()` redundancy) — a second, separate fleet-wide
 * pass rather than merging into that function, so each stays single-
 * responsibility and the already-tested drift report's own shape doesn't
 * have to change to carry tool-catalog data it was never scoped to hold. */
export async function buildToolCatalog(): Promise<ToolCatalog> {
  const agents = await AiAgent.findAll();
  const toolMap = new Map<string, ToolCatalogEntry>();

  for (const agent of agents) {
    const report = await resolveEffectiveAccess(agent.id);
    if (!report) continue;

    for (const tool of report.tools) {
      let entry = toolMap.get(tool.toolName);
      if (!entry) {
        entry = { toolName: tool.toolName, reads: tool.reads, produces: tool.produces, documented: tool.documented, assignedAgents: [] };
        toolMap.set(tool.toolName, entry);
      }
      entry.assignedAgents.push({
        agentId: report.agentId,
        agentName: report.agentName,
        registered: tool.registered,
        grantedVia: tool.grantedVia,
        usable: tool.usable,
      });
    }
  }

  const tools = Array.from(toolMap.values()).sort((a, b) => a.toolName.localeCompare(b.toolName));
  return { generatedAt: new Date().toISOString(), tools };
}
