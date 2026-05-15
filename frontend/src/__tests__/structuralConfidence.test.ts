/**
 * Structural Confidence Sprint, 2026-05-15.
 *
 * Covers the pure structural-confidence language layer:
 *   trustLabel / confidenceLine / systemResilienceSentence
 *
 * Same calm + anti-prescription guardrails as operationalLeverage —
 * the line between "observation" and "verdict" cannot drift without a
 * red test.
 */
import type { DomainBucket, DomainKey, LifecycleState } from '../utils/bpDomainClassifier';
import {
  trustLabel,
  confidenceLine,
  systemResilienceSentence,
} from '../utils/structuralConfidence';

// --- builders --------------------------------------------------------------

function bucket(over: Partial<DomainBucket> & {
  key: DomainKey;
  label: string;
  lifecycleState: LifecycleState;
}): DomainBucket {
  const { key, label, lifecycleState, ...rest } = over;
  return {
    key, label, lifecycleState,
    icon: 'bi-x',
    orderIndex: 1,
    processes: [{ id: 'p1', name: 'placeholder' }],
    totalRequirements: 0,
    matchedRequirements: 0,
    completionPercent: 0,
    usableCount: 0,
    narrative: '',
    entryRole: '',
    feedsInto: [],
    receivesFrom: [],
    supports: [],
    relationships: [],
    downstreamCount: 0,
    pressureNote: null,
    ...rest,
  };
}

const FORBIDDEN_IMPERATIVES = [
  /\byou\s+should\b/i,
  /\byou\s+must\b/i,
  /\byou\s+need\s+to\b/i,
  /\bfix\b/i,
  /\baddress\b/i,
];

const FORBIDDEN_CERTAINTY = [
  /\bguarantee/i,
  /\boptimal\b/i,
  /\bperfect\b/i,
  /\bdefinitely\b/i,
];

function assertCalm(text: string | null | undefined) {
  if (!text) return;
  for (const re of FORBIDDEN_IMPERATIVES) expect(text).not.toMatch(re);
  for (const re of FORBIDDEN_CERTAINTY) expect(text).not.toMatch(re);
  expect(text).not.toMatch(/!/);
}

// ---------------------------------------------------------------------------
describe('trustLabel', () => {
  test('softens technical states into operator-facing words', () => {
    expect(trustLabel('Foundational')).toBe('Still forming');
    expect(trustLabel('Emerging')).toBe('Coordinating');
    expect(trustLabel('Scaling')).toBe('Dependable');
    expect(trustLabel('Stabilizing')).toBe('Trusted');
  });

  test('leaves already-clear states unchanged', () => {
    expect(trustLabel('Coordinated')).toBe('Coordinated');
    expect(trustLabel('Operational')).toBe('Operational');
  });

  test('returns a non-empty string for every lifecycle state (no gaps)', () => {
    const states: LifecycleState[] = ['Foundational', 'Emerging', 'Coordinated', 'Operational', 'Scaling', 'Stabilizing'];
    for (const s of states) {
      const label = trustLabel(s);
      expect(label).toBeTruthy();
      assertCalm(label);
    }
  });
});

// ---------------------------------------------------------------------------
describe('confidenceLine', () => {
  test('bucket with no processes → null (boundary)', () => {
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Operational', processes: [] });
    expect(confidenceLine(b)).toBeNull();
  });

  test('the catch-all "other" bucket → null (no editorial signal)', () => {
    const b = bucket({ key: 'other', label: 'Other Operations', lifecycleState: 'Operational' });
    expect(confidenceLine(b)).toBeNull();
  });

  test('Foundational with downstream → "structure exists, but downstream confidence remains limited"', () => {
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', downstreamCount: 2 });
    const out = confidenceLine(b)!;
    expect(out).toBe('The structure exists, but downstream confidence remains limited.');
    assertCalm(out);
  });

  test('Foundational with no downstream → "still depends heavily on manual structure"', () => {
    const b = bucket({ key: 'reporting', label: 'Reporting', lifecycleState: 'Foundational', downstreamCount: 0 });
    expect(confidenceLine(b)).toBe('Reporting still depends heavily on manual structure.');
  });

  test('Emerging → "is gaining consistency"', () => {
    const b = bucket({ key: 'lead_intelligence', label: 'Lead Intelligence', lifecycleState: 'Emerging' });
    expect(confidenceLine(b)).toBe('Lead Intelligence is gaining consistency.');
  });

  test('Coordinated → "is beginning to coordinate reliably"', () => {
    const b = bucket({ key: 'execution', label: 'Execution', lifecycleState: 'Coordinated' });
    expect(confidenceLine(b)).toBe('Execution is beginning to coordinate reliably.');
  });

  test('Operational → "operationally dependable"', () => {
    const b = bucket({ key: 'marketing', label: 'Marketing', lifecycleState: 'Operational' });
    expect(confidenceLine(b)).toBe('Marketing is operationally dependable.');
  });

  test('Scaling with downstream → "supports downstream reliability"', () => {
    const b = bucket({ key: 'lead_intelligence', label: 'Lead Intelligence', lifecycleState: 'Scaling', downstreamCount: 3 });
    expect(confidenceLine(b)).toBe('Lead Intelligence now supports downstream reliability.');
  });

  test('Scaling with no downstream → "broadening with confidence" (no false claim about downstream)', () => {
    const b = bucket({ key: 'reporting', label: 'Reporting', lifecycleState: 'Scaling', downstreamCount: 0 });
    expect(confidenceLine(b)).toBe('Reporting is broadening with confidence.');
  });

  test('Stabilizing → "feels increasingly stable"', () => {
    const b = bucket({ key: 'ai_intelligence', label: 'AI & Intelligence', lifecycleState: 'Stabilizing' });
    expect(confidenceLine(b)).toBe('AI & Intelligence feels increasingly stable.');
  });

  test('every state path passes the calm guardrails', () => {
    const states: LifecycleState[] = ['Foundational', 'Emerging', 'Coordinated', 'Operational', 'Scaling', 'Stabilizing'];
    for (const s of states) {
      assertCalm(confidenceLine(bucket({ key: 'intake', label: 'Intake', lifecycleState: s, downstreamCount: 2 })));
      assertCalm(confidenceLine(bucket({ key: 'reporting', label: 'Reporting', lifecycleState: s, downstreamCount: 0 })));
    }
  });
});

// ---------------------------------------------------------------------------
describe('systemResilienceSentence', () => {
  test('fewer than 3 buckets → null (boundary — not enough signal)', () => {
    expect(systemResilienceSentence([
      bucket({ key: 'intake', label: 'I', lifecycleState: 'Foundational' }),
      bucket({ key: 'marketing', label: 'M', lifecycleState: 'Operational' }),
    ])).toBeNull();
  });

  test('mostly foundational → "structure is still forming"', () => {
    const out = systemResilienceSentence([
      bucket({ key: 'intake', label: 'I', lifecycleState: 'Foundational' }),
      bucket({ key: 'marketing', label: 'M', lifecycleState: 'Foundational' }),
      bucket({ key: 'execution', label: 'E', lifecycleState: 'Emerging' }),
    ])!;
    expect(out).toMatch(/still forming|early scaffolding/);
    assertCalm(out);
  });

  test('mostly stabilized → "stable and trusted"', () => {
    const out = systemResilienceSentence([
      bucket({ key: 'intake', label: 'I', lifecycleState: 'Stabilizing' }),
      bucket({ key: 'marketing', label: 'M', lifecycleState: 'Stabilizing' }),
      bucket({ key: 'execution', label: 'E', lifecycleState: 'Stabilizing' }),
    ])!;
    expect(out).toMatch(/stable and trusted/);
    assertCalm(out);
  });

  test('mid-maturity → "broadly in place; reliability is the next frontier"', () => {
    const out = systemResilienceSentence([
      bucket({ key: 'intake', label: 'I', lifecycleState: 'Operational' }),
      bucket({ key: 'marketing', label: 'M', lifecycleState: 'Operational' }),
      bucket({ key: 'execution', label: 'E', lifecycleState: 'Operational' }),
    ])!;
    expect(out).toMatch(/broadly in place|reliability/);
    assertCalm(out);
  });
});
