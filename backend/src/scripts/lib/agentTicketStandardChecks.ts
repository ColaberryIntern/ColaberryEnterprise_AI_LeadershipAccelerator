/**
 * Pure, no-I/O checks backing the Agent Ticket Standard
 * (directives/register-ticket-creating-agent.md).
 *
 * This module has zero DB/network/filesystem access on purpose - every function
 * here takes plain data in and returns a plain result, so it can be unit tested
 * without a database and reused by both `validateAgentTicketStandard.ts` (the
 * read-only CLI) and any future caller (e.g. a future admin-UI "audit this
 * agent" button) without duplicating logic.
 *
 * `AGENT_TICKET_RESOLVER_REGISTRY` is the one hardcoded, reviewable mapping from
 * each of the 6 real ticket-creator agents to its recurring resolver (if any) -
 * grounded directly against `backend/src/services/agentRegistrySeed.ts`'s real
 * entries as of 2026-08-17 (PRs #1531, #1537, #1541, #1545, #1547, plus the
 * pre-existing #1482 workforce resolver). Deliberately hardcoded rather than
 * parsed at runtime from the 2900-line seed file - same tradeoff
 * `ticketAutoCheckService.ts`'s own `OWNERSHIP_RULES` already made. A future
 * agent not yet in this map is reported as "not mapped," never silently skipped.
 */

// ---------------------------------------------------------------------------
// tools_granted check
// ---------------------------------------------------------------------------

export interface ToolsGrantedResult {
  pass: boolean;
  reason: string;
}

/**
 * `AiAgent.tools_granted` must be a non-empty array of non-empty strings.
 * This only checks shape (per directives/register-ticket-creating-agent.md
 * Step 4) - whether each string actually maps to real behavior is a code-review
 * judgment call this function cannot make.
 */
export function evaluateToolsGranted(toolsGranted: unknown): ToolsGrantedResult {
  if (!Array.isArray(toolsGranted)) {
    return { pass: false, reason: 'tools_granted is not an array (missing or wrong type).' };
  }
  if (toolsGranted.length === 0) {
    return { pass: false, reason: 'tools_granted is an empty array - no capabilities declared.' };
  }
  const badEntry = toolsGranted.find((t) => typeof t !== 'string' || t.trim().length === 0);
  if (badEntry !== undefined) {
    return { pass: false, reason: 'tools_granted contains a non-string or empty-string entry.' };
  }
  return {
    pass: true,
    reason: `${toolsGranted.length} tool(s) declared: ${(toolsGranted as string[]).join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Display identity check
// ---------------------------------------------------------------------------

/**
 * Display names that represent a COLLAPSED/generic fallback rather than a real,
 * distinguishing identity - the exact class of bug PR #1559 fixed (cory-engine
 * and CoryBrain both rendering as the literal string "Cory"). Matched against
 * the resolved name AFTER trimming, case-sensitive (these are the real literal
 * strings `humanizeActorType()`/the old `source.startsWith('cory')` heuristic
 * could produce, not a style guess).
 */
export const KNOWN_GENERIC_COLLAPSE_LABELS: readonly string[] = [
  'Cory',
  'Agent',
  'System',
  'Human',
  'Ai Staff',
  'On Demand',
];

/** True if `displayName` is null/empty/whitespace-only, or one of the known
 * generic collapse labels - i.e. NOT a real, distinguishing identity. */
export function isGenericFallbackLabel(displayName: string | null | undefined): boolean {
  if (!displayName || displayName.trim().length === 0) return true;
  return KNOWN_GENERIC_COLLAPSE_LABELS.includes(displayName.trim());
}

// ---------------------------------------------------------------------------
// Time-based-closure anti-pattern scan
// ---------------------------------------------------------------------------

/**
 * Strips `/* ... *\/` and `// ...` comments before scanning. Mirrors exactly
 * the comment-stripping this week's own regression guards use
 * (`reeseStudentSupportSupersessionRules.test.ts`) - a resolver's header
 * comment is allowed to explain, by name, the pattern it forbids ("no
 * Date.now() anywhere in this file") without tripping the scan on its own
 * prose.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

export interface AntiPatternMatch {
  /** Human-readable name of the anti-pattern matched. */
  pattern: string;
  /** 1-based line number within the comment-stripped source. */
  line: number;
  /** The offending line, trimmed and truncated for a readable report. */
  snippet: string;
}

/**
 * The exact token set proven this week (not invented) to be the recurring
 * time-based-fallback-closure anti-pattern shape, taken verbatim from
 * `coryEngineTicketResolutionRules.test.ts`'s and
 * `reeseStudentSupportSupersessionRules.test.ts`'s own regression guards.
 *
 * Deliberately does NOT include a bare `getTime()` token: Reese's real,
 * legitimate resolver (`reeseStudentSupportSupersessionRules.ts`) compares two
 * PERSISTED `createdAt.getTime()` values to each other to determine sibling
 * ORDER, which is allowed and expected - only a comparison against the CURRENT
 * wall clock (`Date.now()`, bare `new Date()`) turns "a real fact" into the
 * forbidden "close after N time elapsed" fallback. See
 * directives/register-ticket-creating-agent.md Step 3 for the full precedent.
 */
const TIME_BASED_CLOSURE_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'Date.now() referenced in code', regex: /Date\.now\(\)/ },
  { name: 'new Date() constructed with no arguments (reads current wall clock)', regex: /new Date\(\)/ },
  { name: '"daysSince"-style token', regex: /daysSince/i },
  { name: '"ageInDays"-style token', regex: /ageInDays/i },
  { name: 'created_at compared with < or >', regex: /created_at\s*[<>]/ },
  { name: 'createdAt compared with < or >', regex: /createdAt\s*[<>]/ },
];

/**
 * Scans resolver source code (already read from disk by the caller) for the
 * known time-based-closure anti-pattern tokens, comments stripped first. Pure,
 * total, never throws. An empty result means clean - no known anti-pattern
 * token found. This does NOT prove the resolver is honest (a novel disguised
 * variant could still slip through) - it proves the SPECIFIC, already-recurring
 * anti-pattern shape from this week's real fixes is absent, which is what
 * directives/register-ticket-creating-agent.md Step 3's Verification asks for.
 */
export function scanForTimeBasedClosurePatterns(source: string): AntiPatternMatch[] {
  const code = stripComments(source);
  const lines = code.split('\n');
  const matches: AntiPatternMatch[] = [];
  for (const { name, regex } of TIME_BASED_CLOSURE_PATTERNS) {
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        matches.push({ pattern: name, line: idx + 1, snippet: line.trim().slice(0, 120) });
      }
    });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Creator -> resolver registry (the checkable subset of Step 6)
// ---------------------------------------------------------------------------

export interface ResolverMapping {
  /** The real `created_by_id`/`AiAgent.agent_name` string for the ticket-creator. */
  creatorAgentName: string;
  /** The resolver's real `AiAgent.agent_name`, or null if none is expected. */
  resolverAgentName: string | null;
  /**
   * Pure classifier file, relative to `backend/src/` (e.g.
   * `intelligence/autonomy/coryEngineTicketResolutionRules.ts`). Null when no
   * separate rules file exists and the classification logic lives inline in
   * `resolverIoFile` instead (true today only for `workforce_intelligence_engine`,
   * whose resolver predates the pure-rules-file split - PR #1482).
   */
  resolverRulesFile: string | null;
  /** The I/O resolver file, relative to `backend/src/`. */
  resolverIoFile: string | null;
  /**
   * The dry-run/undo-log module (`--plan`/`--apply`/`--revert` artifacts),
   * relative to `backend/src/` - the structural proxy for "idempotency was
   * designed in" per directive Step 7 / this run's Assumption 5. Null when no
   * such module exists (true today only for `workforce_intelligence_engine`,
   * whose resolver predates this week's `--plan/--apply/--revert` convention).
   */
  artifactsFile: string | null;
  /**
   * A disclosed, intentional coverage gap for this agent (per
   * directives/register-ticket-creating-agent.md's Edge Cases section) - set
   * when a real ticket type this agent creates is NOT covered by
   * `resolverAgentName`, so the validator reports it as an honest, named gap
   * instead of a silent pass or a fresh-looking failure.
   */
  knownGap?: string;
}

export const AGENT_TICKET_RESOLVER_REGISTRY: readonly ResolverMapping[] = [
  {
    creatorAgentName: 'cory-engine',
    resolverAgentName: 'CoryEngineTicketAutoResolver',
    resolverRulesFile: 'intelligence/autonomy/coryEngineTicketResolutionRules.ts',
    resolverIoFile: 'intelligence/autonomy/coryEngineTicketAutoResolver.ts',
    artifactsFile: 'scripts/lib/coryEngineTicketResolutionArtifacts.ts',
  },
  {
    creatorAgentName: 'CoryBrain',
    resolverAgentName: 'CoryBrainInitiativeTicketAutoResolver',
    resolverRulesFile: 'intelligence/autonomy/corybrainInitiativeTicketResolutionRules.ts',
    resolverIoFile: 'intelligence/autonomy/corybrainInitiativeTicketAutoResolver.ts',
    artifactsFile: 'scripts/lib/corybrainInitiativeTicketResolutionArtifacts.ts',
  },
  {
    creatorAgentName: 'InboxCaseEngine',
    resolverAgentName: 'InboxCaseSourceCompletionResolver',
    resolverRulesFile: 'intelligence/autonomy/inboxCaseSourceCompletionRules.ts',
    resolverIoFile: 'intelligence/autonomy/inboxCaseSourceCompletionResolver.ts',
    artifactsFile: 'scripts/lib/inboxCaseSourceCompletionArtifacts.ts',
  },
  {
    creatorAgentName: 'workforce_intelligence_engine',
    resolverAgentName: 'WorkforceTicketAutoResolver',
    // Predates the pure-rules-file split (PR #1482, before this week's pattern
    // was established) - classification logic lives inline in the resolver
    // file itself, confirmed by directory listing (no sibling *Rules.ts file,
    // no sibling artifacts module either).
    resolverRulesFile: null,
    resolverIoFile: 'services/company/workforceTicketAutoResolver.ts',
    artifactsFile: null,
  },
  {
    creatorAgentName: 'bpos_orchestrator',
    resolverAgentName: 'BposCapabilityTicketAutoResolver',
    resolverRulesFile: 'services/company/bposCapabilityTicketResolutionRules.ts',
    resolverIoFile: 'services/company/bposCapabilityTicketAutoResolver.ts',
    artifactsFile: 'scripts/lib/bposCapabilityTicketArtifacts.ts',
  },
  {
    creatorAgentName: 'Reese',
    resolverAgentName: 'ReeseStudentSupportSupersessionResolver',
    resolverRulesFile: 'intelligence/autonomy/reeseStudentSupportSupersessionRules.ts',
    resolverIoFile: 'intelligence/autonomy/reeseStudentSupportSupersessionResolver.ts',
    artifactsFile: 'scripts/lib/reeseStudentSupportSupersessionArtifacts.ts',
    knownGap:
      "Covers only 'student_support' tickets. 'reese_autonomous_outreach' tickets " +
      '(9 open as of PR #1559) are re-checked by a real, separate, older cron ' +
      "(ReeseOutreachFollowUps, registered directly in schedulerService.ts via a " +
      "cron.schedule() call, NOT through aiOpsScheduler.ts's SCHEDULE_REGISTRY or " +
      "ticketAutoCheckService.ts's OWNERSHIP_RULES). PR #1559 disclosed this as an " +
      'intentional scope-discipline decision ("5 of 6 registered agents" framing, ' +
      'avoiding scope creep past the request as given), not a bug. This validator ' +
      'reports it as a named, documented gap - never a silent pass, never treated ' +
      "as a fresh defect. ReeseOutreachFollowUps' own health is out of scope for " +
      'this check.',
  },
];

/** Looks up the resolver mapping for a creator agent name, or undefined if the
 * agent isn't yet mapped (a genuinely new agent, not one of the 6). */
export function findResolverMapping(creatorAgentName: string): ResolverMapping | undefined {
  return AGENT_TICKET_RESOLVER_REGISTRY.find((m) => m.creatorAgentName === creatorAgentName);
}
