/**
 * Operational Leverage Sprint, 2026-05-15.
 *
 * Covers the pure leverage reasoning layer:
 *   computeSystemLeverage / leverageHeadline / forwardLookingNote /
 *   downstreamSupportLine / homeLeverageLine / buildLeverageSummary
 *
 * Per the project test contract, each unit has happy / failure / boundary
 * coverage. Critically, this suite also asserts the anti-prescription
 * guardrails — no imperatives, no certainty words, conditional framing
 * only — so the line that separates "illumination" from "recommendation"
 * cannot drift in a future edit without a red test.
 */
import type { DomainBucket, DomainKey, LifecycleState, DomainRelationship } from '../utils/bpDomainClassifier';
import { getDomainProfile } from '../utils/bpDomainClassifier';
import {
  computeSystemLeverage,
  leverageHeadline,
  forwardLookingNote,
  downstreamSupportLine,
  homeLeverageLine,
  buildLeverageSummary,
} from '../utils/operationalLeverage';

// --- builders --------------------------------------------------------------

function bucket(over: Partial<DomainBucket> & {
  key: DomainKey;
  label: string;
  lifecycleState: LifecycleState;
  downstreamCount?: number;
  relationships?: DomainRelationship[];
}): DomainBucket {
  // Destructure the required fields out so the final spread carries only
  // the optional overrides — avoids TS2783 "specified more than once".
  const { key, label, lifecycleState, ...rest } = over;
  return {
    key, label, lifecycleState,
    icon: 'bi-x',
    orderIndex: 1,
    processes: [],
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
  /\byou\s+have\s+to\b/i,
  /\bfix\b/i,
  /\baddress\b/i,
  /\bdo\s+this\b/i,
];

const FORBIDDEN_CERTAINTY = [
  /\bguarantee/i,
  /\boptimal\b/i,
  /\bperfect\b/i,
  /\bdefinitely\b/i,
  /\bbest\s+practice\b/i,
];

function assertCalm(text: string | null | undefined) {
  if (!text) return;
  for (const re of FORBIDDEN_IMPERATIVES) {
    expect(text).not.toMatch(re);
  }
  for (const re of FORBIDDEN_CERTAINTY) {
    expect(text).not.toMatch(re);
  }
  expect(text).not.toMatch(/!/); // calm — never exclamatory
}

// ---------------------------------------------------------------------------
describe('computeSystemLeverage', () => {
  test('empty buckets → all null', () => {
    const sys = computeSystemLeverage([]);
    expect(sys.highest).toBeNull();
    expect(sys.limitingFactors).toEqual([]);
    expect(sys.systemEvolution).toBeNull();
  });

  test('foundational domain with 3 downstream → high leverage, constrained_downstream', () => {
    // Foundational headroom = 5 - 0 = 5; score = 3 * 5 = 15
    const b = bucket({ key: 'intake', label: 'Intake & Registration', lifecycleState: 'Foundational', downstreamCount: 3 });
    const sys = computeSystemLeverage([b]);
    expect(sys.highest?.bucket.key).toBe('intake');
    expect(sys.highest?.score).toBe(15);
    expect(sys.highest?.reason).toBe('constrained_downstream');
  });

  test('stabilized anchor with downstream → mature_anchor reason, but score 0 → not surfaced as highest', () => {
    const b = bucket({ key: 'lead_intelligence', label: 'Lead Intelligence', lifecycleState: 'Stabilizing', downstreamCount: 3 });
    const sys = computeSystemLeverage([b]);
    // Headroom 0 × 3 = 0; below MIN_LEVERAGE_SCORE → no highest surfaced
    expect(sys.highest).toBeNull();
  });

  test('mixed buckets → picks highest score', () => {
    const intake = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Emerging', downstreamCount: 2, orderIndex: 2 });        // 4 * 2 = 8
    const exec   = bucket({ key: 'execution', label: 'Execution', lifecycleState: 'Foundational', downstreamCount: 1, orderIndex: 5 }); // 5 * 1 = 5
    const lead   = bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Coordinated', downstreamCount: 3, orderIndex: 3 }); // 3 * 3 = 9
    const sys = computeSystemLeverage([intake, exec, lead]);
    expect(sys.highest?.bucket.key).toBe('lead_intelligence');
    expect(sys.highest?.score).toBe(9);
  });

  test('tie-break by orderIndex (earlier in the flow wins)', () => {
    const a = bucket({ key: 'intake', label: 'A', lifecycleState: 'Emerging', downstreamCount: 2, orderIndex: 2 });   // 4 * 2 = 8
    const b = bucket({ key: 'marketing', label: 'B', lifecycleState: 'Emerging', downstreamCount: 2, orderIndex: 4 }); // 4 * 2 = 8
    const sys = computeSystemLeverage([a, b]);
    expect(sys.highest?.bucket.key).toBe('intake');
  });

  test('limitingFactors derived from existing pressureNote signals', () => {
    const constrained = bucket({
      key: 'reporting', label: 'Reporting & Analytics', lifecycleState: 'Operational', downstreamCount: 0,
      pressureNote: 'Constrained by early-stage Intake upstream — strengthening that area unblocks this one.',
    });
    const sys = computeSystemLeverage([constrained]);
    expect(sys.limitingFactors).toHaveLength(1);
    expect(sys.limitingFactors[0].bucket.key).toBe('reporting');
    expect(sys.limitingFactors[0].upstreamLabel).toBe('Intake');
  });

  test('limitingFactors ignores foundational/emerging buckets (not "mature-but-constrained")', () => {
    const earlyConstrained = bucket({
      key: 'reporting', label: 'Reporting', lifecycleState: 'Emerging', downstreamCount: 0,
      pressureNote: 'Constrained by early-stage Intake upstream — strengthening that area unblocks this one.',
    });
    const sys = computeSystemLeverage([earlyConstrained]);
    expect(sys.limitingFactors).toHaveLength(0);
  });

  test('systemEvolution: null when fewer than 3 buckets, otherwise descriptive', () => {
    expect(computeSystemLeverage([
      bucket({ key: 'intake', label: 'A', lifecycleState: 'Operational' }),
      bucket({ key: 'marketing', label: 'B', lifecycleState: 'Operational' }),
    ]).systemEvolution).toBeNull();

    const sys = computeSystemLeverage([
      bucket({ key: 'intake', label: 'A', lifecycleState: 'Foundational' }),
      bucket({ key: 'marketing', label: 'B', lifecycleState: 'Foundational' }),
      bucket({ key: 'execution', label: 'C', lifecycleState: 'Emerging' }),
    ]);
    expect(sys.systemEvolution).toMatch(/still being scaffolded|early coordination/);
  });
});

// ---------------------------------------------------------------------------
describe('leverageHeadline', () => {
  test('null highest → null', () => {
    expect(leverageHeadline({ highest: null, limitingFactors: [], systemEvolution: null })).toBeNull();
  });

  test('constrained_downstream: contains "Highest operational leverage" and "would"', () => {
    const b = bucket({
      key: 'intake', label: 'Intake', lifecycleState: 'Foundational', downstreamCount: 2,
      relationships: [
        { verb: 'feeds', targetKey: 'lead_intelligence', targetLabel: 'Lead Intelligence' },
        { verb: 'supports', targetKey: 'reporting', targetLabel: 'Reporting' },
      ],
    });
    const out = leverageHeadline(computeSystemLeverage([b]))!;
    expect(out).toMatch(/^Highest operational leverage currently sits in Intake/);
    expect(out).toContain('would unblock 2 downstream areas');
    assertCalm(out);
  });

  test('broadest_surface: many downstream, modest headroom → "supports the broadest operational surface"', () => {
    const b = bucket({
      key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Scaling', downstreamCount: 3, // headroom 1, score 3
      relationships: [
        { verb: 'feeds', targetKey: 'marketing', targetLabel: 'Marketing' },
        { verb: 'feeds', targetKey: 'execution', targetLabel: 'Execution' },
        { verb: 'supports', targetKey: 'reporting', targetLabel: 'Reporting' },
      ],
    });
    const out = leverageHeadline(computeSystemLeverage([b]))!;
    expect(out).toContain('broadest operational surface');
    expect(out).toContain('would ripple through');
    assertCalm(out);
  });

  test('calm guardrail: never imperative or certain', () => {
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', downstreamCount: 3 });
    assertCalm(leverageHeadline(computeSystemLeverage([b])));
  });
});

// ---------------------------------------------------------------------------
describe('forwardLookingNote', () => {
  test('downstreamCount 0 → null', () => {
    expect(forwardLookingNote(bucket({ key: 'reporting', label: 'R', lifecycleState: 'Operational', downstreamCount: 0 }))).toBeNull();
  });

  test('boundary: Stabilizing has no headroom → null', () => {
    expect(forwardLookingNote(bucket({ key: 'intake', label: 'I', lifecycleState: 'Stabilizing', downstreamCount: 3 }))).toBeNull();
  });

  test('low-maturity → "Strengthening this would stabilize …"', () => {
    const out = forwardLookingNote(bucket({ key: 'intake', label: 'I', lifecycleState: 'Foundational', downstreamCount: 2 }))!;
    expect(out).toMatch(/^Strengthening this would stabilize the 2 downstream areas/);
    assertCalm(out);
  });

  test('mid-maturity → "Continued maturation here would reinforce …"', () => {
    const out = forwardLookingNote(bucket({ key: 'execution', label: 'E', lifecycleState: 'Operational', downstreamCount: 1 }))!;
    expect(out).toContain('Continued maturation');
    expect(out).toContain('1 downstream area');
    assertCalm(out);
  });

  test('high-maturity (Scaling) → softer "Further refinement here may …"', () => {
    const out = forwardLookingNote(bucket({ key: 'lead_intelligence', label: 'L', lifecycleState: 'Scaling', downstreamCount: 2 }))!;
    expect(out).toContain('Further refinement');
    expect(out).toContain('may');
    assertCalm(out);
  });
});

// ---------------------------------------------------------------------------
describe('downstreamSupportLine', () => {
  test('domain with no downstream → null (reporting consolidates from others)', () => {
    const profile = getDomainProfile('reporting')!;
    expect(downstreamSupportLine(profile)).toBeNull();
  });

  test('domain with single downstream → singular line', () => {
    // intake feeds into lead_intelligence only
    const profile = getDomainProfile('intake')!;
    expect(profile.downstreamCount).toBe(1);
    expect(downstreamSupportLine(profile)).toBe('This area supports 1 downstream area.');
  });

  test('domain with multiple downstream → plural numeric line', () => {
    // lead_intelligence feeds marketing + execution and supports reporting → 3
    const profile = getDomainProfile('lead_intelligence')!;
    const out = downstreamSupportLine(profile)!;
    expect(out).toBe('This area supports 3 downstream areas.');
    assertCalm(out);
  });
});

// ---------------------------------------------------------------------------
describe('homeLeverageLine + buildLeverageSummary', () => {
  const NOW = new Date('2026-05-15T12:00:00Z').getTime();
  const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

  test('undefined summary → null', () => {
    expect(homeLeverageLine(undefined, NOW)).toBeNull();
  });

  test('fresh summary → returns calm one-liner', () => {
    const out = homeLeverageLine({ highestLeverageLabel: 'Intake', reason: 'constrained_downstream', evolutionPhrase: null, at: hoursAgo(2) }, NOW)!;
    expect(out).toBe('Highest operational leverage in your system currently sits in Intake.');
    assertCalm(out);
  });

  test('boundary: stale summary (>72h) → null', () => {
    expect(homeLeverageLine({ highestLeverageLabel: 'Intake', reason: 'constrained_downstream', evolutionPhrase: null, at: hoursAgo(73) }, NOW)).toBeNull();
  });

  test('buildLeverageSummary: null when no highest', () => {
    expect(buildLeverageSummary({ highest: null, limitingFactors: [], systemEvolution: null }, NOW)).toBeNull();
  });

  test('buildLeverageSummary: captures label, reason, evolution', () => {
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', downstreamCount: 3 });
    const summary = buildLeverageSummary(computeSystemLeverage([b]), NOW)!;
    expect(summary.highestLeverageLabel).toBe('Intake');
    expect(summary.reason).toBe('constrained_downstream');
    expect(new Date(summary.at).getTime()).toBe(NOW);
  });
});
