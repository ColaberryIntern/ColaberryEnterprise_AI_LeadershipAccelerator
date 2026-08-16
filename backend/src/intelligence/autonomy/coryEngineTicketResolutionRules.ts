/**
 * Cory-Engine Ticket Resolution — pure classification rules
 *
 * `autonomousEngine.ts`'s `runAutonomousCycle()` (via `ProblemDiscoveryAgent.ts`'s
 * `discoverProblems()`) opens a ticket for every problem it detects, but nothing before
 * this run ever re-checked an already-open one — 6,843 of cory-engine's 9,624 tickets
 * sit in `todo` forever, even after the condition that opened them has genuinely
 * cleared (see this run's execution-contract.md for the full DISCOVER trail, including
 * direct production verification of these numbers).
 *
 * Unlike `workforceTicketAutoResolver.ts`'s single uniform threshold,
 * `discoverProblems()` runs exactly 3 independent detectors
 * (`detectAgentFailures`/`detectConversionDrops`/`detectErrorSpikes`), each with its own
 * shape of "is this still true right now." This module is the pure decision logic (no
 * I/O, no DB) that classifies one cory-engine ticket into exactly one outcome, given the
 * live re-check context the caller already fetched by calling the SAME exported
 * detector functions `autonomousEngine.ts` itself calls every cycle (T001 exported
 * them specifically so there is only one copy of this logic, not two that can drift).
 *
 * IMPORTANT — what `description` actually looks like: `autonomousEngine.ts:207-217`
 * does NOT write `problem.description` bare into `tickets.description`. It wraps it in
 * a composite markdown block:
 *   `**Problem:** <problem.description>\n**Root Cause:** <...>\n**Recommended Action:**
 *   <...>\n**Expected Impact:** <...>\n**Risk Score:** <...>\n**Confidence:**
 *   <...>\n**Metric:** <...>` (the last line only when `impact.metric` is set)
 * so every regex below is a SUBSTRING search inside that block, anchored to the
 * `**Problem:**` line specifically (not "first match anywhere in the description") so a
 * lookalike phrase inside the LLM-authored `**Root Cause:**` free text can never be
 * mistaken for the real signal.
 *
 * No time-based fallback of any kind lives in this file: no wall-clock-vs-stored-timestamp
 * delta, no ticket-age comparison, no "close after N days untouched" heuristic anywhere
 * — that pattern was deliberately removed from `ticketManagementAgent.ts`'s old 7-day
 * auto-close during the original ProofDesk build for being dishonest, and this run does
 * not reintroduce it under a different name. A dedicated test in this file's `__tests__`
 * greps this file's own source for the literal tokens such a gate would require and
 * asserts zero matches (deliberately not spelled out verbatim in this comment, so the
 * grep's own target strings don't accidentally appear in the file it's scanning).
 */

export type CoryEngineConditionType = 'agent_failure' | 'conversion_drop' | 'error_spike' | 'unclassified';

/**
 * `error_spike`'s detector (`detectErrorSpikes()` in ProblemDiscoveryAgent.ts) queries
 * `system_processes.updated_at`, a column that does not exist in production (confirmed
 * live via `information_schema.columns` — the table has `created_at` only). The
 * detector's own try/catch swallows the resulting SQL error and returns `[]` on every
 * cycle, forever — which is why zero `error_spike` tickets exist today, not because
 * there have been no spikes. Because the live check can never distinguish "genuinely no
 * spike" from "the query threw," this condition-type has NO reliable re-runnable check
 * available. Tickets of this type are still classified (so a human/report can see the
 * count) but are NEVER auto-closed while this constant is `false`. Fixing the
 * underlying SQL is out of scope for this run (a detection-logic fix, not a
 * ticket-resolution fix) — flip this constant only after that fix lands and is verified
 * live.
 */
export const ERROR_SPIKE_RELIABLE_CHECK = false as const;

const AGENT_FAILURE_RE = /\*\*Problem:\*\*\s*Agent "([^"]+)" is in error state/;
const CONVERSION_DROP_RE = /\*\*Problem:\*\*\s*Lead generation dropped \d+% in last 48h/;
const ERROR_SPIKE_RE = /\*\*Problem:\*\*\s*Error spike: \d+ errors in last hour/;

/**
 * `detectAgentFailures()`'s own DetectedProblem.description is the BARE
 * `Agent "<name>" is in error state: <last_error>` string (it is `autonomousEngine.ts`
 * that wraps it in the `**Problem:**` composite block at ticket-creation time, not the
 * detector itself). The resolver re-runs the live detector directly (not by re-reading
 * a ticket), so it needs to pull the agent name back out of that bare shape — this is
 * the same pattern, without the composite-block prefix requirement.
 */
const BARE_AGENT_FAILURE_RE = /^Agent "([^"]+)" is in error state/;

/** Pulls the agent name out of a LIVE detectAgentFailures() result's bare description
 * (not a ticket's stored description — see BARE_AGENT_FAILURE_RE above). Total, never throws. */
export function parseAgentNameFromLiveFailureDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(BARE_AGENT_FAILURE_RE);
  return match ? match[1] : null;
}

export interface ParsedTicketCondition {
  conditionType: CoryEngineConditionType;
  agentName: string | null;
}

/**
 * Parses a cory-engine ticket's `description` into its originating condition-type.
 * Total function — never throws, always returns exactly one outcome. Matches against
 * the real composite markdown block (see file header), not a bare template.
 */
export function parseTicketCondition(description: string | null | undefined): ParsedTicketCondition {
  if (!description) return { conditionType: 'unclassified', agentName: null };

  const agentMatch = description.match(AGENT_FAILURE_RE);
  if (agentMatch) return { conditionType: 'agent_failure', agentName: agentMatch[1] };

  if (CONVERSION_DROP_RE.test(description)) return { conditionType: 'conversion_drop', agentName: null };

  if (ERROR_SPIKE_RE.test(description)) return { conditionType: 'error_spike', agentName: null };

  return { conditionType: 'unclassified', agentName: null };
}

export type CoryEngineResolutionOutcome =
  | 'agent_recovered'
  | 'agent_still_failing'
  | 'conversion_drop_cleared'
  | 'conversion_drop_still_active'
  | 'error_spike_no_reliable_check'
  | 'unclassified';

export interface AgentLiveStatus {
  status: string;
  enabled: boolean;
}

export interface ConversionMetrics {
  recent: number;
  dailyAvg: number;
  expected48h: number;
}

export interface ClassificationContext {
  /** Agent names currently matching detectAgentFailures()'s live condition (status='error', enabled=true). */
  failingAgentNames: Set<string>;
  /** Whether detectConversionDrops() currently returns a problem (the shared, system-wide signal). */
  conversionDropStillActive: boolean;
  /** Evidence-only enrichment (not part of the close decision) — the agent's current
   * `ai_agents.status`/`enabled` at classification time, so a closed ticket's comment
   * states the real current status rather than just "no longer failing." Optional so
   * pure unit tests of the failing/recovered branch don't need to fabricate it. */
  agentLiveStatuses?: Map<string, AgentLiveStatus>;
  /** Evidence-only enrichment (not part of the close decision — conversionDropStillActive
   * above does that) — the CURRENT recent/daily-avg/expected48h numbers, so a closed
   * conversion_drop ticket's comment states fresh current figures rather than only "no
   * longer reports a drop." Optional so pure unit tests don't need to fabricate it. */
  conversionMetrics?: ConversionMetrics | null;
}

export interface CoryEngineTicketClassification {
  outcome: CoryEngineResolutionOutcome;
  shouldClose: boolean;
  evidenceNote: string;
}

/**
 * Classifies one cory-engine ticket given the live re-check context the caller already
 * fetched (by calling the real, exported detector functions once per resolver pass —
 * not once per ticket). Pure, total, never throws. `shouldClose` is `true` only for
 * `agent_recovered` and `conversion_drop_cleared` — every other outcome leaves the
 * ticket untouched.
 */
export function classifyCoryEngineTicket(
  ticket: { id: string; description: string | null | undefined },
  ctx: ClassificationContext,
): CoryEngineTicketClassification {
  const parsed = parseTicketCondition(ticket.description);

  if (parsed.conditionType === 'agent_failure') {
    const agentName = parsed.agentName!;
    const stillFailing = ctx.failingAgentNames.has(agentName);
    if (stillFailing) {
      return {
        outcome: 'agent_still_failing',
        shouldClose: false,
        evidenceNote: `Agent "${agentName}" is still in the live failing set (status='error', enabled=true) — condition has not cleared, left open.`,
      };
    }
    const liveStatus = ctx.agentLiveStatuses?.get(agentName);
    const liveStatusText = liveStatus
      ? `ai_agents.status='${liveStatus.status}', enabled=${liveStatus.enabled}`
      : 'no matching ai_agents row found live';
    return {
      outcome: 'agent_recovered',
      shouldClose: true,
      evidenceNote:
        `Agent "${agentName}" is no longer in the live failing set (re-checked against ` +
        `the same detectAgentFailures() condition this ticket was opened under: ` +
        `status='error' AND enabled=true). Current live status: ${liveStatusText}. This ` +
        `reflects the agent's most recent run, not a verified root-cause fix — no human ` +
        `confirmed why it recovered. A new ticket will be filed automatically if the ` +
        `agent fails again.`,
    };
  }

  if (parsed.conditionType === 'conversion_drop') {
    if (ctx.conversionDropStillActive) {
      return {
        outcome: 'conversion_drop_still_active',
        shouldClose: false,
        evidenceNote: 'detectConversionDrops() still reports a live drop right now — condition has not cleared, left open.',
      };
    }
    const m = ctx.conversionMetrics;
    const metricsText = m
      ? `Current numbers: ${m.recent} leads in the last 48h vs expected ${m.expected48h} (daily avg ${m.dailyAvg}/day).`
      : 'Current numbers unavailable at classification time (evidence-only read failed; the close decision itself does not depend on this figure).';
    return {
      outcome: 'conversion_drop_cleared',
      shouldClose: true,
      evidenceNote:
        'Re-ran detectConversionDrops() (the same 48h-vs-7-day-average check this ticket ' +
        `was opened under) against current leads data and it no longer reports a drop. ${metricsText} ` +
        'This is a moving, noisy signal over a low-volume metric — "not triggering this ' +
        'instant" is a faithful re-derivation of the same check the detector itself uses, ' +
        'not a smoothed or hardened version of it. A new ticket will be filed ' +
        'automatically if the drop resumes.',
    };
  }

  if (parsed.conditionType === 'error_spike') {
    return {
      outcome: 'error_spike_no_reliable_check',
      shouldClose: false,
      evidenceNote:
        "detectErrorSpikes()'s SQL references system_processes.updated_at, a column " +
        'that does not exist in production — the detector always throws internally and ' +
        "its own try/catch returns [] every cycle, so a live re-check can never tell " +
        '"genuinely no spike" apart from "the query threw." Left untouched by design, ' +
        'not force-closed with a fake heuristic (see ERROR_SPIKE_RELIABLE_CHECK).',
    };
  }

  return {
    outcome: 'unclassified',
    shouldClose: false,
    evidenceNote: 'Ticket description does not match any recognized cory-engine condition-type template — left untouched, ambiguous.',
  };
}
