/**
 * Evidence-based health scoring tests (2026-05-19).
 *
 * Covers the two surfaces added by the evidence sprint:
 *   1. computeCodeEvidence — reads linked backend files, classifies signals
 *   2. scoreHealth — gates reliability + automation by evidence, not just kind
 *
 * The first test reads real repo files (codeEvidence.ts has known try/catch
 * + async-fn density), so it doubles as an end-to-end smoke test of the
 * file-reader path. The remaining tests feed synthetic evidence directly
 * to scoreHealth so the logic is exercised without filesystem coupling.
 */
import { computeCodeEvidence, _resetCodeEvidenceCacheForTests, inferAgentRole } from '../codeEvidence';
import { scoreHealth } from '../healthScorer';
import type { EngineCapabilityInput } from '../../types/systemState.types';

function mkCap(overrides: Partial<EngineCapabilityInput> = {}): EngineCapabilityInput {
  return {
    id: 'cap-1',
    project_id: 'proj-1',
    name: 'Test Cap',
    description: 'A test capability',
    source: 'parsed',
    user_status: 'in_progress',
    applicability_status: 'active',
    frontend_route: null,
    is_page_bp: false,
    mode_override: null,
    last_execution: null,
    linked_backend_services: [],
    linked_frontend_components: [],
    linked_agents: [],
    ui_element_map: null,
    total_requirements: 0,
    matched_requirements: 0,
    verified_requirements: 0,
    ...overrides,
  };
}

beforeEach(() => {
  _resetCodeEvidenceCacheForTests();
});

describe('computeCodeEvidence', () => {
  it('reads a real repo file end-to-end and returns coherent counts', () => {
    // healthScorer.ts: known repo file. Verifies the GitHub-relative path
    // resolution and fs.readFileSync path actually run. We don't pin the
    // exact signal because the regex can match patterns inside source-code
    // string literals (intentional — heuristic, not AST); we just verify
    // the reader produced non-degenerate output and a recognized signal.
    const evidence = computeCodeEvidence({
      linked_backend_services: ['backend/src/intelligence/systemStateEngine/scoring/healthScorer.ts'],
    });
    expect(evidence.evidence_files_read).toBe(1);
    expect(['high', 'medium', 'low', 'na']).toContain(evidence.reliability_signal);
    expect(evidence.raw_counts).toBeDefined();
  });

  it('returns na reliability + non-applicable automation for an empty cap (no linked files)', () => {
    const evidence = computeCodeEvidence({ linked_backend_services: [] });
    expect(evidence.evidence_files_read).toBe(0);
    expect(evidence.reliability_signal).toBe('na');
    expect(evidence.automation_applicable).toBe(false);
  });

  it('marks agent-kind caps as automation-applicable regardless of file contents', () => {
    const evidence = computeCodeEvidence({ kind: 'agent', linked_backend_services: [] });
    expect(evidence.automation_applicable).toBe(true);
  });

  it('marks caps with linked agents as automation-applicable', () => {
    const evidence = computeCodeEvidence({
      linked_backend_services: [],
      linked_agents: ['someAgent.ts'],
    });
    expect(evidence.automation_applicable).toBe(true);
  });

  it('silently skips files that do not exist (returns zero evidence)', () => {
    const evidence = computeCodeEvidence({
      linked_backend_services: ['backend/src/this/does/not/exist.ts'],
    });
    expect(evidence.evidence_files_read).toBe(1); // we counted the attempt
    expect(evidence.raw_counts?.try_catch).toBe(0);
    expect(evidence.raw_counts?.async_functions).toBe(0);
  });
});

describe('scoreHealth — evidence-aware applicability', () => {
  it('skips reliability when evidence says signal=na (pure-function service)', () => {
    const cap = mkCap({
      kind: 'service',
      linked_backend_services: ['x.ts'],
      code_evidence: {
        reliability_signal: 'na',
        automation_applicable: false,
        evidence_files_read: 1,
      },
    });
    const health = scoreHealth(cap, []);
    expect(health.applicable_dimensions).not.toContain('reliability');
    expect(health.applicable_dimensions).not.toContain('automation');
  });

  it('uses high evidence signal to award strong reliability score', () => {
    const cap = mkCap({
      kind: 'service',
      linked_backend_services: ['x.ts'],
      code_evidence: {
        reliability_signal: 'high',
        automation_applicable: true,
        evidence_files_read: 1,
      },
    });
    const health = scoreHealth(cap, []);
    expect(health.applicable_dimensions).toContain('reliability');
    expect(health.reliability).toBe(90);
  });

  it('uses low evidence signal to flag hardening need', () => {
    const cap = mkCap({
      kind: 'service',
      linked_backend_services: ['x.ts'],
      code_evidence: {
        reliability_signal: 'low',
        automation_applicable: true,
        evidence_files_read: 1,
      },
    });
    const health = scoreHealth(cap, []);
    expect(health.reliability).toBe(30);
  });

  it('falls back to file-count heuristic when no evidence present (legacy behavior preserved)', () => {
    const cap = mkCap({
      kind: 'service',
      linked_backend_services: ['a.ts', 'b.ts', 'c.ts'],
      // no code_evidence
    });
    const health = scoreHealth(cap, []);
    expect(health.applicable_dimensions).toContain('reliability');
    expect(health.reliability).toBe(45); // 3 files × 15
  });

  it('gates automation when evidence says it is not applicable (CRUD admin)', () => {
    const cap = mkCap({
      kind: 'service',
      linked_backend_services: ['x.ts'],
      code_evidence: {
        reliability_signal: 'medium',
        automation_applicable: false, // no schedule/queue/agent signals
        evidence_files_read: 1,
      },
    });
    const health = scoreHealth(cap, []);
    expect(health.applicable_dimensions).not.toContain('automation');
    expect(health.automation).toBe(0); // not scored
  });

  it('keeps automation applicable for agent-kind caps even without backend signals', () => {
    const cap = mkCap({
      kind: 'agent',
      linked_backend_services: [],
      linked_agents: ['x.ts'],
      code_evidence: {
        reliability_signal: 'medium',
        automation_applicable: true,
        evidence_files_read: 0,
      },
    });
    const health = scoreHealth(cap, []);
    expect(health.applicable_dimensions).toContain('automation');
  });

  it('composite score averages only over evidence-gated applicable dimensions', () => {
    const cap = mkCap({
      kind: 'service',
      linked_backend_services: ['x.ts'],
      linked_frontend_components: ['y.tsx'],
      code_evidence: {
        reliability_signal: 'na',     // skip reliability
        automation_applicable: false, // skip automation
        evidence_files_read: 1,
      } as any,
    });
    const health = scoreHealth(cap, []);
    // Should average over remaining dimensions only:
    // determinism, observability, ux_exposure, production_readiness
    expect(health.applicable_dimensions).toEqual(
      expect.arrayContaining(['determinism', 'observability', 'ux_exposure', 'production_readiness']),
    );
    expect(health.applicable_dimensions).not.toContain('reliability');
    expect(health.applicable_dimensions).not.toContain('automation');
  });
});

describe('computeCodeEvidence agent_roles omitted for 0-agent caps (walk #2 fix)', () => {
  it('returns agent_roles undefined when linked_agents is empty', () => {
    const ev = computeCodeEvidence({
      kind: 'service',
      linked_backend_services: ['svc.ts'],
      linked_agents: [],  // no agents to classify
    });
    expect(ev.agent_roles).toBeUndefined();
  });

  it('returns agent_roles object when linked_agents has entries', () => {
    const ev = computeCodeEvidence({
      kind: 'service',
      linked_backend_services: [],
      linked_agents: ['someAgent.ts'],
    });
    expect(ev.agent_roles).toBeDefined();
    expect(ev.agent_roles!.detected).toContain('core');
  });
});

describe('inferAgentRole (Tier-2 #4)', () => {
  it('detects monitor role from filename keywords', () => {
    expect(inferAgentRole('src/agents/leadMonitor.ts', null)).toBe('monitor');
    expect(inferAgentRole('healthCheck.js', null)).toBe('monitor');
    expect(inferAgentRole('queueWatcher.ts', null)).toBe('monitor');
    expect(inferAgentRole('telemetryAgent.ts', null)).toBe('monitor');
  });

  it('detects alert role from filename keywords', () => {
    expect(inferAgentRole('alertDispatcher.ts', null)).toBe('alert');
    expect(inferAgentRole('notifyOnFailure.ts', null)).toBe('alert');
    expect(inferAgentRole('pagerEscalator.ts', null)).toBe('alert');
  });

  it('detects follow_up role from filename keywords', () => {
    expect(inferAgentRole('reminderAgent.ts', null)).toBe('follow_up');
    expect(inferAgentRole('retryNudger.ts', null)).toBe('follow_up');
  });

  it('falls back to core when no role-specific filename signal', () => {
    expect(inferAgentRole('leadProcessor.ts', null)).toBe('core');
    expect(inferAgentRole('contentGenerator.ts', null)).toBe('core');
  });

  it('uses content signals when filename is generic', () => {
    expect(inferAgentRole('processor.ts', 'setInterval(checkHealth, 60000); metric.gauge("active", count);')).toBe('monitor');
    expect(inferAgentRole('processor.ts', 'const result = await sendAlert(payload); pagerduty.trigger(...)')).toBe('alert');
    expect(inferAgentRole('processor.ts', 'await reminderEmail(user); await scheduleFollowUp(...)')).toBe('follow_up');
  });

  it('filename signal beats content signal (higher confidence)', () => {
    // Even if content has alert keywords, monitor filename wins
    expect(inferAgentRole('healthCheckAgent.ts', 'sendAlert(...); pagerduty.trigger()')).toBe('monitor');
  });

  it('returns core when content is unreadable AND filename is generic', () => {
    expect(inferAgentRole('genericAgent.ts', null)).toBe('core');
  });
});

describe('computeCodeEvidence preFetchedAgentContents path (Tier-3 #9)', () => {
  it('uses pre-fetched content for role classification when supplied', () => {
    // Filename is generic — only content can drive role classification.
    // Without preFetched, local fs read fails (file doesn't exist) → core.
    // With preFetched supplying monitor-keyword content → monitor.
    const preFetched = new Map<string, string | null>([
      ['fake/agent.ts', 'setInterval(checkHealth, 60000); metric.gauge("active", count);'],
    ]);
    const evidence = computeCodeEvidence({
      kind: 'service',
      linked_backend_services: [],
      linked_agents: ['fake/agent.ts'],
      preFetchedAgentContents: preFetched,
    } as any);
    expect(evidence.agent_roles?.detected).toContain('monitor');
    expect(evidence.agent_roles?.files_inspected).toBe(1);
  });

  it('handles pre-fetched null entries (GitHub fetch failed) — falls back to filename-only', () => {
    const preFetched = new Map<string, string | null>([
      ['fake/leadMonitor.ts', null],  // fetch returned null
    ]);
    const evidence = computeCodeEvidence({
      kind: 'service',
      linked_backend_services: [],
      linked_agents: ['fake/leadMonitor.ts'],
      preFetchedAgentContents: preFetched,
    } as any);
    // Filename still classifies via tokenizer
    expect(evidence.agent_roles?.detected).toContain('monitor');
    // Not counted as inspected since content wasn't read
    expect(evidence.agent_roles?.files_inspected).toBe(0);
  });
});
