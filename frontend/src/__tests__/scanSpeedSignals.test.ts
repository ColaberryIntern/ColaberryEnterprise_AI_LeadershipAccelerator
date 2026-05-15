/**
 * Executive Signal Layering Sprint, 2026-05-15.
 *
 * Covers the scan-speed metadata builders. Same calm/anti-vocabulary
 * guardrails as the leverage + confidence layers — no KPI words, no
 * imperatives, no exclamations.
 */
import type { DomainBucket, DomainKey, LifecycleState } from '../utils/bpDomainClassifier';
import {
  completionLabel,
  downstreamLabel,
  metadataItems,
} from '../utils/scanSpeedSignals';

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

const FORBIDDEN_KPI = [
  /\bscore\b/i,
  /\bKPI\b/i,
  /\brating\b/i,
  /\bmetric\b/i,
  /\btelemetry\b/i,
  /\bhealth\s+score\b/i,
];

function assertCalm(s: string | null) {
  if (!s) return;
  for (const re of FORBIDDEN_KPI) expect(s).not.toMatch(re);
  expect(s).not.toMatch(/!/);
  expect(s).not.toMatch(/\bshould\b|\bmust\b/i);
}

// ---------------------------------------------------------------------------
describe('completionLabel', () => {
  test('no requirements extracted → null (boundary, honest silence)', () => {
    expect(completionLabel(bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', totalRequirements: 0 }))).toBeNull();
  });

  test('renders the % completion when totalRequirements > 0', () => {
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Operational', totalRequirements: 12, matchedRequirements: 6, completionPercent: 50 });
    expect(completionLabel(b)).toBe('50% complete');
  });

  test('renders 100% completion as a regular sentence (no celebration)', () => {
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Stabilizing', totalRequirements: 10, matchedRequirements: 10, completionPercent: 100 });
    const out = completionLabel(b)!;
    expect(out).toBe('100% complete');
    assertCalm(out);
  });

  test('renders 0% as a real signal, not as "not yet"', () => {
    // distinct from the no-requirements case — here requirements exist but none match yet
    const b = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', totalRequirements: 5, matchedRequirements: 0, completionPercent: 0 });
    expect(completionLabel(b)).toBe('0% complete');
  });
});

// ---------------------------------------------------------------------------
describe('downstreamLabel', () => {
  test('zero downstream → null', () => {
    expect(downstreamLabel(bucket({ key: 'reporting', label: 'R', lifecycleState: 'Operational', downstreamCount: 0 }))).toBeNull();
  });

  test('singular when downstreamCount === 1', () => {
    expect(downstreamLabel(bucket({ key: 'intake', label: 'I', lifecycleState: 'Foundational', downstreamCount: 1 }))).toBe('supports 1 downstream area');
  });

  test('plural when downstreamCount > 1', () => {
    const out = downstreamLabel(bucket({ key: 'lead_intelligence', label: 'L', lifecycleState: 'Emerging', downstreamCount: 3 }))!;
    expect(out).toBe('supports 3 downstream areas');
    assertCalm(out);
  });
});

// ---------------------------------------------------------------------------
describe('metadataItems', () => {
  test('empty bucket (no requirements, no downstream) → empty array', () => {
    expect(metadataItems(bucket({ key: 'other', label: 'O', lifecycleState: 'Foundational' }))).toEqual([]);
  });

  test('completion only → one-item array', () => {
    const b = bucket({ key: 'reporting', label: 'R', lifecycleState: 'Coordinated', totalRequirements: 8, matchedRequirements: 6, completionPercent: 75 });
    expect(metadataItems(b)).toEqual(['75% complete']);
  });

  test('downstream only → one-item array', () => {
    const b = bucket({ key: 'intake', label: 'I', lifecycleState: 'Foundational', downstreamCount: 2 });
    expect(metadataItems(b)).toEqual(['supports 2 downstream areas']);
  });

  test('both → completion first, downstream second (priority order)', () => {
    const b = bucket({ key: 'lead_intelligence', label: 'L', lifecycleState: 'Coordinated', totalRequirements: 10, matchedRequirements: 4, completionPercent: 40, downstreamCount: 3 });
    expect(metadataItems(b)).toEqual(['40% complete', 'supports 3 downstream areas']);
  });

  test('cap at 2 items — never grows into a dashboard row', () => {
    const b = bucket({ key: 'lead_intelligence', label: 'L', lifecycleState: 'Operational', totalRequirements: 10, matchedRequirements: 5, completionPercent: 50, downstreamCount: 4 });
    expect(metadataItems(b).length).toBeLessThanOrEqual(2);
  });

  test('every produced item passes the calm guardrails', () => {
    const b = bucket({ key: 'lead_intelligence', label: 'L', lifecycleState: 'Operational', totalRequirements: 10, matchedRequirements: 5, completionPercent: 50, downstreamCount: 3 });
    for (const item of metadataItems(b)) assertCalm(item);
  });
});
