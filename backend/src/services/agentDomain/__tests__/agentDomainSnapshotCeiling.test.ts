import { buildAgentDomainSnapshot } from '../agentDomainSnapshot';
import type { DomainCapabilityMatrix } from '../capabilityRecord';

/**
 * AF12.3 — the autonomy CEILING reaches the snapshot.
 *
 * Sarbjit Kaur, 3 Nov 2026, while building her Command Center:
 *
 *   "The current snapshot provides each capability's effective authority, but it does not expose
 *    `max_permitted_autonomy` or the associated reason for each capability. We need this to
 *    display the maximum permitted autonomy ceiling alongside the effective authority."
 *
 * She was right. The ceiling was fed INTO `effectiveAuthorityForDomain` and thrown away, because
 * `EffectiveAuthority` is `{ capability_id, effective_autonomy, reasons }` and nothing else. Her
 * story's third criterion asks for "each capability's ceiling marked against the rung it stops
 * at", which that shape cannot express.
 *
 * Nothing here grants or widens anything: the same two values the ladder already read are now
 * reported instead of discarded.
 */

function matrix(caps: Array<Partial<Record<string, unknown>>>): DomainCapabilityMatrix {
  return {
    domain_key: 'marketing',
    accountable_human: 'Sohail Syed',
    manager_identity_id: 'om-1',
    researched_at: '2026-10-21',
    capabilities: caps.map((c) => ({
      capability_id: 'marketing.a',
      name: 'A capability',
      business_outcome: 'x',
      intended_users: [],
      classification: 'agent_task',
      source: 'research',
      supporting_evidence: [],
      implementation_state: 'absent',
      requirement_validation_state: 'draft',
      validation_dependency: '',
      inputs: [],
      outputs: [],
      workflow: [],
      exceptions: [],
      dependencies: [],
      application_pages: [],
      apis: [],
      source_modules: [],
      required_tools: [],
      human_decision: false,
      starting_autonomy: 'autonomy:R0',
      max_permitted_autonomy: 'autonomy:R4',
      blocked_by: [],
      release_behaviour: [],
      ...c,
    })),
    legacy_dispositions: [],
  } as unknown as DomainCapabilityMatrix;
}

const build = (caps: Array<Partial<Record<string, unknown>>>) => buildAgentDomainSnapshot({
  domain_key: 'marketing',
  agent: null,
  matrix: matrix(caps),
  governance: [],
}) as unknown as {
  authority: Array<{
    capability_id: string;
    effective_autonomy: string | null;
    reasons: string[];
    approved_autonomy: string | null;
    approved_autonomy_note: string | null;
    max_permitted_autonomy: string | null;
    max_permitted_autonomy_note: string | null;
  }>;
};

describe('the ceiling is reported, not just consumed', () => {
  it('exposes max_permitted_autonomy for each capability', () => {
    const s = build([{ capability_id: 'marketing.a', max_permitted_autonomy: 'autonomy:R4' }]);
    expect(s.authority[0].max_permitted_autonomy).toBe('autonomy:R4');
  });

  it('exposes the approved level too, so the ceiling can be drawn against something', () => {
    // "Marked against the rung it stops at" needs all three: asked for, allowed, and applied.
    const s = build([{
      capability_id: 'marketing.a',
      starting_autonomy: 'autonomy:R2',
      max_permitted_autonomy: 'autonomy:R4',
    }]);
    expect(s.authority[0].approved_autonomy).toBe('autonomy:R2');
    expect(s.authority[0].max_permitted_autonomy).toBe('autonomy:R4');
    expect(s.authority[0].effective_autonomy).toBe('autonomy:R2');
  });

  it('still reports the reason, which was already there and is the other half of her ask', () => {
    // A ceiling BELOW the approved level is the case where the reason earns its keep.
    const s = build([{
      capability_id: 'marketing.a',
      starting_autonomy: 'autonomy:R5',
      max_permitted_autonomy: 'autonomy:R1',
    }]);
    expect(s.authority[0].effective_autonomy).toBe('autonomy:R1');
    expect(s.authority[0].reasons).toContain('capped_by_max_permitted');
    expect(s.authority[0].max_permitted_autonomy).toBe('autonomy:R1');
    expect(s.authority[0].approved_autonomy).toBe('autonomy:R5');
  });
});

describe('a record that does not hold a real rung says why, rather than rendering a blank', () => {
  it('reports null plus a note when the ceiling is not one of the ten rungs', () => {
    const s = build([{ capability_id: 'marketing.a', max_permitted_autonomy: 'whatever' }]);
    expect(s.authority[0].max_permitted_autonomy).toBeNull();
    expect(s.authority[0].max_permitted_autonomy_note).toContain('whatever');
  });

  it('never returns both a rung and a note for the same field', () => {
    // The pair is exclusive by construction; a page that saw both would not know which to show.
    const s = build([
      { capability_id: 'marketing.a', max_permitted_autonomy: 'autonomy:R4' },
      { capability_id: 'marketing.b', max_permitted_autonomy: 'nonsense' },
    ]);
    for (const row of s.authority) {
      const bothSet = row.max_permitted_autonomy !== null && row.max_permitted_autonomy_note !== null;
      expect(bothSet).toBe(false);
    }
  });
});

describe('what must not change', () => {
  it('keeps capability_id, effective_autonomy and reasons exactly as before', () => {
    const s = build([{ capability_id: 'marketing.a' }]);
    expect(s.authority[0].capability_id).toBe('marketing.a');
    expect(s.authority[0]).toHaveProperty('effective_autonomy');
    expect(Array.isArray(s.authority[0].reasons)).toBe(true);
  });

  it('adds no clock FIELD, because this file still cannot carry one', () => {
    // Asserted on KEYS, not on the serialised text. `staleness_note` mentions `generated_at` in
    // prose, on purpose, to tell the page where the real clock lives — and the snapshot's own
    // comment says it is named that way so a test can check for a clock-derived FIELD "without
    // tripping over the field that explains why". The first version of this test tripped over it.
    for (const row of build([{ capability_id: 'marketing.a' }]).authority) {
      for (const key of Object.keys(row)) expect(key).not.toMatch(/_at$/);
    }
  });

  it('stays sorted by capability id, so the file is byte-stable across syncs', () => {
    const a = JSON.stringify(build([
      { capability_id: 'marketing.b' }, { capability_id: 'marketing.a' },
    ]).authority);
    const b = JSON.stringify(build([
      { capability_id: 'marketing.a' }, { capability_id: 'marketing.b' },
    ]).authority);
    expect(a).toBe(b);
  });

  it('GRANTS NOTHING: the two new fields are read back from the capability record', () => {
    // The whole safety claim of this change. A ceiling is a limit; reporting it cannot raise
    // anything, and `effective_autonomy` must be unmoved by the change that exposes it.
    const withCeiling = build([{
      capability_id: 'marketing.a', starting_autonomy: 'autonomy:R0', max_permitted_autonomy: 'autonomy:R9',
    }]);
    expect(withCeiling.authority[0].effective_autonomy).toBe('autonomy:R0');
    expect(withCeiling.authority[0].max_permitted_autonomy).toBe('autonomy:R9');
  });
});
