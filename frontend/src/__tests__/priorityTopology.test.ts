/**
 * Operational Priority Topology Sprint, 2026-05-15.
 *
 * Covers the two pure priority-topology utils:
 *   - coryPriorityMatcher (matchCoryPriorityDomain, whyThisMattersSentence)
 *   - domainPrioritySorter (sortByOperationalPriority, downstreamKeysOf)
 */
import type { DomainBucket, DomainKey, LifecycleState, DomainRelationship, BPLike } from '../utils/bpDomainClassifier';
import { matchCoryPriorityDomain, whyThisMattersSentence } from '../utils/coryPriorityMatcher';
import { sortByOperationalPriority, downstreamKeysOf } from '../utils/domainPrioritySorter';
import { inheritedDomainContextSentence } from '../utils/bpInheritedContext';

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

const bp = (id: string, name: string): BPLike => ({ id, name });

// ---------------------------------------------------------------------------
describe('matchCoryPriorityDomain', () => {
  test('no next action → null', () => {
    expect(matchCoryPriorityDomain(null, [])).toBeNull();
    expect(matchCoryPriorityDomain(undefined, [])).toBeNull();
  });

  test('no buckets → null', () => {
    expect(matchCoryPriorityDomain({ title: 'anything' }, [])).toBeNull();
  });

  test('metadata.bp_id match wins (best signal)', () => {
    const buckets = [
      bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', processes: [bp('bp-1', 'Intake Form')] }),
      bucket({ key: 'lead_intelligence', label: 'Lead Intelligence', lifecycleState: 'Operational', processes: [bp('bp-2', 'Lead Scoring')] }),
    ];
    const action = { title: 'unrelated', metadata: { bp_id: 'bp-2' } };
    expect(matchCoryPriorityDomain(action, buckets)).toBe('lead_intelligence');
  });

  test('keyword match on action title against BP names', () => {
    const buckets = [
      bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', processes: [bp('p1', 'Course Enrollment Form')] }),
      bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Operational', processes: [bp('p2', 'Lead Scoring Service')] }),
    ];
    const action = { title: 'Create artifact for: lead scoring service overhaul' };
    expect(matchCoryPriorityDomain(action, buckets)).toBe('lead_intelligence');
  });

  test('boundary: very short BP names (<6 chars) don\'t match to avoid spurious hits', () => {
    const buckets = [
      bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', processes: [bp('p1', 'Form')] }), // 4 chars, ignored
      bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Operational', processes: [bp('p2', 'Lead Scoring')] }),
    ];
    // 'form' is in lead_intelligence text indirectly via 'inform', but no exact match
    // 'page' would hit public_pages keywords. Just verify no false match on Intake.
    const action = { title: 'Add zzzzzz validation to the abcxyz' };
    expect(matchCoryPriorityDomain(action, buckets)).toBeNull();
  });

  test('fallback: action_type metadata classifies to a domain via classifier keywords', () => {
    // Reproduces the real production case: next_action title doesn't
    // overlap with any BP name, but metadata.action_type = "create_artifact"
    // and AI & Intelligence's keywords include "artifact".
    const buckets = [
      bucket({ key: 'ai_intelligence', label: 'AI & Intelligence', lifecycleState: 'Foundational' }),
      bucket({ key: 'lead_intelligence', label: 'Lead Intelligence', lifecycleState: 'Operational' }),
      bucket({ key: 'reporting', label: 'Reporting', lifecycleState: 'Operational' }),
    ];
    const action = {
      title: 'Create artifact for: `GET /api/courses` to retrieve available courses.',
      reason: 'Requirement REQ-027 has no linked artifact. An artifact must be created.',
      metadata: { action_type: 'create_artifact', requirement_key: 'REQ-027' },
    };
    expect(matchCoryPriorityDomain(action, buckets)).toBe('ai_intelligence');
  });

  test('fallback: classified domain that is NOT in this project\'s bucket set is rejected', () => {
    // The classifier could classify text to "marketing" but if marketing
    // isn't a present bucket in this project, the matcher should NOT
    // point at a non-existent domain.
    const buckets = [
      bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Operational' }),
    ];
    const action = { title: 'Launch new marketing campaign for outreach' };
    expect(matchCoryPriorityDomain(action, buckets)).toBeNull();
  });

  test('fallback: title keywords match domain even without action_type metadata', () => {
    const buckets = [
      bucket({ key: 'ai_intelligence', label: 'AI', lifecycleState: 'Foundational' }),
      bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Operational' }),
    ];
    const action = { title: 'Refine the lead scoring discovery pipeline' };
    // 'lead' (4) is in lead_intelligence keywords, 'discovery' (9) is in ai_intelligence keywords
    // Longer keyword wins → ai_intelligence
    expect(matchCoryPriorityDomain(action, buckets)).toBe('ai_intelligence');
  });

  test('failure path: malformed inputs do not throw', () => {
    expect(() => matchCoryPriorityDomain({ title: null, metadata: null } as any, [])).not.toThrow();
    expect(() => matchCoryPriorityDomain({} as any, [])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('whyThisMattersSentence', () => {
  test('null/undefined domain → null', () => {
    expect(whyThisMattersSentence(null)).toBeNull();
    expect(whyThisMattersSentence(undefined)).toBeNull();
  });

  test('domain with downstream → "strengthening it would influence …"', () => {
    const b = bucket({
      key: 'lead_intelligence', label: 'Lead Intelligence', lifecycleState: 'Operational',
      relationships: [
        { verb: 'feeds', targetKey: 'marketing', targetLabel: 'Marketing Operations' },
        { verb: 'feeds', targetKey: 'execution', targetLabel: 'Execution Systems' },
        { verb: 'supports', targetKey: 'reporting', targetLabel: 'Reporting & Analytics' },
      ],
    });
    const out = whyThisMattersSentence(b)!;
    expect(out).toMatch(/^Cory's current priority sits in Lead Intelligence/);
    expect(out).toContain('Marketing Operations');
    expect(out).toContain('Execution Systems');
    expect(out).toContain('Reporting & Analytics');
    expect(out).toContain('would influence');
  });

  test('domain with no downstream → shorter sentence (no false claim)', () => {
    const b = bucket({ key: 'reporting', label: 'Reporting & Analytics', lifecycleState: 'Operational', relationships: [] });
    expect(whyThisMattersSentence(b)).toBe(`Cory's current priority sits in Reporting & Analytics.`);
  });

  test('calm guardrail: no imperatives or certainty', () => {
    const b = bucket({
      key: 'intake', label: 'Intake', lifecycleState: 'Foundational',
      relationships: [{ verb: 'feeds', targetKey: 'lead_intelligence', targetLabel: 'Lead Intelligence' }],
    });
    const out = whyThisMattersSentence(b)!;
    expect(out).not.toMatch(/!/);
    expect(out.toLowerCase()).not.toMatch(/you should|must|fix|guaranteed|optimal/);
  });
});

// ---------------------------------------------------------------------------
describe('sortByOperationalPriority', () => {
  const intake = bucket({ key: 'intake', label: 'Intake', lifecycleState: 'Foundational', downstreamCount: 1, orderIndex: 2 });
  const lead = bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Operational', downstreamCount: 3, orderIndex: 3 });
  const marketing = bucket({ key: 'marketing', label: 'Marketing', lifecycleState: 'Coordinated', downstreamCount: 2, orderIndex: 4 });
  const reporting = bucket({ key: 'reporting', label: 'Reporting', lifecycleState: 'Operational', downstreamCount: 0, orderIndex: 6 });

  test('no priority/focus → falls back to leverage descending, then orderIndex', () => {
    const sorted = sortByOperationalPriority([reporting, marketing, intake, lead]);
    // Leverage scores: intake 1×5=5; lead 3×2=6; marketing 2×3=6; reporting 0×2=0
    // Tie between lead (6) and marketing (6) → orderIndex tiebreak (lead 3 < marketing 4) → lead first
    expect(sorted.map(b => b.key)).toEqual(['lead_intelligence', 'marketing', 'intake', 'reporting']);
  });

  test('Cory priority domain goes first regardless of leverage', () => {
    const sorted = sortByOperationalPriority([reporting, marketing, intake, lead], { coryPriorityDomain: 'reporting' });
    expect(sorted[0].key).toBe('reporting');
  });

  test('Focus domain goes second when distinct from Cory priority', () => {
    const sorted = sortByOperationalPriority([reporting, marketing, intake, lead], {
      coryPriorityDomain: 'intake',
      focusDomain: 'marketing',
    });
    expect(sorted[0].key).toBe('intake');
    expect(sorted[1].key).toBe('marketing');
  });

  test('Focus and Cory priority pointing to same domain → just one tier-0 slot', () => {
    const sorted = sortByOperationalPriority([reporting, marketing, intake, lead], {
      coryPriorityDomain: 'lead_intelligence',
      focusDomain: 'lead_intelligence',
    });
    expect(sorted[0].key).toBe('lead_intelligence');
    // Subsequent slots fall back to leverage ordering
    expect(sorted.slice(1).map(b => b.key)).toEqual(['marketing', 'intake', 'reporting']);
  });

  test('Pure function — same inputs always produce same output (determinism)', () => {
    const a = sortByOperationalPriority([reporting, marketing, intake, lead], { coryPriorityDomain: 'intake' });
    const b = sortByOperationalPriority([reporting, marketing, intake, lead], { coryPriorityDomain: 'intake' });
    expect(a.map(x => x.key)).toEqual(b.map(x => x.key));
  });

  test('boundary: empty buckets → empty array', () => {
    expect(sortByOperationalPriority([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('downstreamKeysOf', () => {
  const buckets = [
    bucket({
      key: 'intake', label: 'Intake', lifecycleState: 'Foundational',
      relationships: [
        { verb: 'feeds', targetKey: 'lead_intelligence', targetLabel: 'Lead Intelligence' },
        { verb: 'receives from', targetKey: 'public_pages', targetLabel: 'Public Pages' },
      ],
    }),
    bucket({ key: 'lead_intelligence', label: 'Lead', lifecycleState: 'Operational' }),
  ];

  test('null source → empty set', () => {
    expect(downstreamKeysOf(null, buckets).size).toBe(0);
  });

  test('returns feeds + supports targets only (not receives from / supported by)', () => {
    const keys = downstreamKeysOf('intake', buckets);
    expect(keys.has('lead_intelligence')).toBe(true);
    expect(keys.has('public_pages')).toBe(false); // receives from, not downstream
  });

  test('unknown source key → empty set (graceful, not throw)', () => {
    expect(downstreamKeysOf('nonexistent' as DomainKey, buckets).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('inheritedDomainContextSentence', () => {
  test('downstream > 0 → composed sentence with singular/plural agreement', () => {
    expect(inheritedDomainContextSentence('Lead Intelligence', 3))
      .toBe('In Lead Intelligence — supports 3 downstream areas.');
    expect(inheritedDomainContextSentence('Marketing Operations', 1))
      .toBe('In Marketing Operations — supports 1 downstream area.');
  });

  test('downstream === 0 → silent (returns null, no "supports 0" filler)', () => {
    expect(inheritedDomainContextSentence('Lead Intelligence', 0)).toBeNull();
  });

  test('negative downstream → silent (defensive against bad input)', () => {
    expect(inheritedDomainContextSentence('Lead Intelligence', -2)).toBeNull();
  });

  test('observational tone — no imperatives, no certainty words, no exclamations', () => {
    const s = inheritedDomainContextSentence('Lead Intelligence', 3);
    expect(s).not.toMatch(/\b(should|must|need|needs|fix|address|improve|optimize)\b/i);
    expect(s).not.toMatch(/\b(guaranteed|optimal|perfect|critical|urgent)\b/i);
    expect(s).not.toContain('!');
  });
});
