import fs from 'fs';
import path from 'path';
import {
  parseTicketCondition,
  classifyCoryEngineTicket,
  ERROR_SPIKE_RELIABLE_CHECK,
} from '../coryEngineTicketResolutionRules';

// The three verbatim problem.description templates, byte-for-byte from
// ProblemDiscoveryAgent.ts (detectAgentFailures/detectConversionDrops/detectErrorSpikes).
const AGENT_FAILURE_DESC = 'Agent "SomeAgent" is in error state: connection timeout';
const CONVERSION_DROP_DESC = 'Lead generation dropped 65% in last 48h (2 vs expected 6)';
const ERROR_SPIKE_DESC = 'Error spike: 42 errors in last hour (avg: 5/hr)';

/** The REAL composite markdown block autonomousEngine.ts:207-217 actually writes to
 * tickets.description — not the bare problem.description alone. Fixtures below use
 * this shape by default per plan-audit cycle 1's finding. */
function realTicketDescription(problemDescription: string, rootCause = 'Investigation found no clear pattern.'): string {
  return [
    `**Problem:** ${problemDescription}`,
    `**Root Cause:** ${rootCause}`,
    `**Recommended Action:** Investigate and remediate`,
    `**Expected Impact:** Restore normal operation`,
    `**Risk Score:** 40/100 (medium)`,
    `**Confidence:** 70%`,
  ].join('\n');
}

describe('parseTicketCondition — real composite ticket description shape', () => {
  it('parses agent_failure from the real composite block, not the bare template', () => {
    const result = parseTicketCondition(realTicketDescription(AGENT_FAILURE_DESC));
    expect(result.conditionType).toBe('agent_failure');
    expect(result.agentName).toBe('SomeAgent');
  });

  it('parses conversion_drop from the real composite block', () => {
    const result = parseTicketCondition(realTicketDescription(CONVERSION_DROP_DESC));
    expect(result.conditionType).toBe('conversion_drop');
  });

  it('parses error_spike from the real composite block', () => {
    const result = parseTicketCondition(realTicketDescription(ERROR_SPIKE_DESC));
    expect(result.conditionType).toBe('error_spike');
  });

  it('a bare (unwrapped, no **Problem:** prefix) description is unclassified, not matched — deliberate: real cory-engine tickets are NEVER written bare (autonomousEngine.ts always wraps in the composite block), so treating a bare string as a match would only exist to serve a scenario that does not occur in production, while reopening exactly the anchoring risk plan-audit cycle 1 flagged (an unanchored match could be fooled by lookalike text elsewhere in a description). Confirmed by direct production read: 0 of 6,843 open tickets have an unwrapped description.', () => {
    expect(parseTicketCondition(AGENT_FAILURE_DESC).conditionType).toBe('unclassified');
    expect(parseTicketCondition(CONVERSION_DROP_DESC).conditionType).toBe('unclassified');
    expect(parseTicketCondition(ERROR_SPIKE_DESC).conditionType).toBe('unclassified');
  });

  it('malformed/empty/unrecognized description -> unclassified, never throws', () => {
    expect(parseTicketCondition('').conditionType).toBe('unclassified');
    expect(parseTicketCondition(null).conditionType).toBe('unclassified');
    expect(parseTicketCondition(undefined).conditionType).toBe('unclassified');
    expect(parseTicketCondition('**Problem:** something totally unrelated').conditionType).toBe('unclassified');
  });
});

describe('parseTicketCondition — adversarial: lookalike text in free-text fields', () => {
  it('agent_failure: a lookalike phrase inside **Root Cause** free text does not get mistaken for the real **Problem:** match', () => {
    const description = realTicketDescription(
      'Agent "RealAgent" is in error state: timeout',
      'Similar to a past incident where Agent "DecoyAgent" is in error state and recovered on its own.',
    );
    const result = parseTicketCondition(description);
    expect(result.conditionType).toBe('agent_failure');
    expect(result.agentName).toBe('RealAgent'); // NOT "DecoyAgent" from the root-cause echo
  });

  it('conversion_drop: a lookalike phrase in root cause does not produce a double-match or throw', () => {
    const description = realTicketDescription(
      CONVERSION_DROP_DESC,
      'Lead generation dropped before in a similar pattern last quarter.',
    );
    expect(parseTicketCondition(description).conditionType).toBe('conversion_drop');
  });

  it('error_spike: a lookalike phrase in root cause does not produce a double-match or throw', () => {
    const description = realTicketDescription(
      ERROR_SPIKE_DESC,
      'Error spike: seen previously in last hour during a deploy window.',
    );
    expect(parseTicketCondition(description).conditionType).toBe('error_spike');
  });
});

describe('classifyCoryEngineTicket — agent_failure', () => {
  it('agent name still in the live failing set -> agent_still_failing, shouldClose false', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(AGENT_FAILURE_DESC) },
      { failingAgentNames: new Set(['SomeAgent']), conversionDropStillActive: false },
    );
    expect(result.outcome).toBe('agent_still_failing');
    expect(result.shouldClose).toBe(false);
  });

  it('agent name absent from the live failing set -> agent_recovered, shouldClose true', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(AGENT_FAILURE_DESC) },
      { failingAgentNames: new Set(['OtherAgent']), conversionDropStillActive: false },
    );
    expect(result.outcome).toBe('agent_recovered');
    expect(result.shouldClose).toBe(true);
    expect(result.evidenceNote).toContain('SomeAgent');
  });

  it('agent_recovered evidence note includes the real current live status when provided', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(AGENT_FAILURE_DESC) },
      {
        failingAgentNames: new Set(),
        conversionDropStillActive: false,
        agentLiveStatuses: new Map([['SomeAgent', { status: 'idle', enabled: true }]]),
      },
    );
    expect(result.evidenceNote).toContain("status='idle'");
    expect(result.evidenceNote).toContain('enabled=true');
  });

  it('agent_recovered evidence note degrades gracefully (no throw) when no live status map is provided', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(AGENT_FAILURE_DESC) },
      { failingAgentNames: new Set(), conversionDropStillActive: false },
    );
    expect(result.shouldClose).toBe(true);
    expect(result.evidenceNote).toContain('no matching ai_agents row found live');
  });
});

describe('classifyCoryEngineTicket — conversion_drop (shared/aggregate condition)', () => {
  it('conversionDropStillActive true -> stays open for every ticket', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(CONVERSION_DROP_DESC) },
      { failingAgentNames: new Set(), conversionDropStillActive: true },
    );
    expect(result.outcome).toBe('conversion_drop_still_active');
    expect(result.shouldClose).toBe(false);
  });

  it('conversionDropStillActive false -> closes', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(CONVERSION_DROP_DESC) },
      { failingAgentNames: new Set(), conversionDropStillActive: false },
    );
    expect(result.outcome).toBe('conversion_drop_cleared');
    expect(result.shouldClose).toBe(true);
  });

  it('conversion_drop_cleared evidence note carries the CURRENT recent/expected numbers when provided, not just "no longer reports a drop"', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(CONVERSION_DROP_DESC) },
      {
        failingAgentNames: new Set(),
        conversionDropStillActive: false,
        conversionMetrics: { recent: 5, dailyAvg: 3, expected48h: 6 },
      },
    );
    expect(result.evidenceNote).toContain('5 leads in the last 48h');
    expect(result.evidenceNote).toContain('expected 6');
    expect(result.evidenceNote).toContain('3/day');
  });

  it('conversion_drop_cleared evidence note degrades gracefully (no throw, still closes) when current metrics are unavailable', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(CONVERSION_DROP_DESC) },
      { failingAgentNames: new Set(), conversionDropStillActive: false, conversionMetrics: null },
    );
    expect(result.shouldClose).toBe(true);
    expect(result.evidenceNote).toContain('unavailable');
  });
});

describe('classifyCoryEngineTicket — error_spike: never auto-closes, regardless of context', () => {
  it('ALWAYS shouldClose:false even when a caller (incorrectly) passes context implying the condition cleared', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: realTicketDescription(ERROR_SPIKE_DESC) },
      { failingAgentNames: new Set(), conversionDropStillActive: false }, // "everything looks fine" context
    );
    expect(result.outcome).toBe('error_spike_no_reliable_check');
    expect(result.shouldClose).toBe(false);
  });

  it('ERROR_SPIKE_RELIABLE_CHECK constant is false, documenting why', () => {
    expect(ERROR_SPIKE_RELIABLE_CHECK).toBe(false);
  });
});

describe('classifyCoryEngineTicket — unclassified safety net', () => {
  it('never throws, never closes', () => {
    const result = classifyCoryEngineTicket(
      { id: 't1', description: 'totally unrelated text' },
      { failingAgentNames: new Set(), conversionDropStillActive: false },
    );
    expect(result.outcome).toBe('unclassified');
    expect(result.shouldClose).toBe(false);
  });
});

describe('NO time-based fallback closure — regression guard', () => {
  it('this file\'s own source contains none of the tokens a time-based close gate would use', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../coryEngineTicketResolutionRules.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/getTime\(\)/);
    expect(source).not.toMatch(/daysSince/i);
    expect(source).not.toMatch(/ageInDays/i);
    expect(source).not.toMatch(/created_at\s*[<>]/);
    expect(source).not.toMatch(/createdAt\s*[<>]/);
  });
});
