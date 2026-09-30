import {
  normalizeOpportunityType,
  deriveOpportunityDedupKey,
  toDedupKeyTag,
  hasDedupKeyTag,
  OPPORTUNITY_TYPES,
} from '../departmentInitiativeDedupKey';

describe('normalizeOpportunityType', () => {
  // Happy path — every real rule-based opportunity type round-trips unchanged.
  it.each(OPPORTUNITY_TYPES.filter((t) => t !== 'other'))('recognizes the real type "%s"', (type) => {
    expect(normalizeOpportunityType(type)).toBe(type);
  });

  it('is case- and whitespace-insensitive (LLM output is not guaranteed to match casing exactly)', () => {
    expect(normalizeOpportunityType('  Health_Gap  ')).toBe('health_gap');
    expect(normalizeOpportunityType('CROSS_DEPT')).toBe('cross_dept');
  });

  // Failure path — this is the actual bug this module exists to fix: an LLM emitting
  // never-the-same-twice free text must never be trusted as the key itself.
  it('falls back to "other" for unrecognized/novel LLM free text, never passing it through raw', () => {
    expect(normalizeOpportunityType('AI-Driven Predictive Analytics for Student Retention Enhancement')).toBe(
      'other',
    );
    expect(normalizeOpportunityType('AI-Driven Predictive Analytics for Student Retention Activation')).toBe(
      'other',
    );
  });

  // Boundary cases.
  it('falls back to "other" for empty string, null, undefined, and non-string input', () => {
    expect(normalizeOpportunityType('')).toBe('other');
    expect(normalizeOpportunityType(null)).toBe('other');
    expect(normalizeOpportunityType(undefined)).toBe('other');
    expect(normalizeOpportunityType(42)).toBe('other');
    expect(normalizeOpportunityType({ type: 'health_gap' })).toBe('other');
  });
});

describe('deriveOpportunityDedupKey', () => {
  it('happy path: same type, same department -> same key every time (the actual fix)', () => {
    const first = deriveOpportunityDedupKey('health_gap');
    const second = deriveOpportunityDedupKey('health_gap');
    expect(first).toBe(second);
    expect(first).toBe('opportunity_type:health_gap');
  });

  it('happy path: two different LLM paraphrases of the same finding collapse to the same key', () => {
    // This is the literal, live-confirmed production bug: exact-title dedup let these two
    // rows through as "different" tickets. The new key-based dedup must treat them as the
    // same finding once both are classified as the same opportunity type.
    const a = deriveOpportunityDedupKey('health_gap');
    const b = deriveOpportunityDedupKey('health_gap');
    expect(a).toBe(b);
  });

  it('unrecognized LLM type still dedups against itself (bounded "other" bucket, not unbounded)', () => {
    const a = deriveOpportunityDedupKey('Something Novel The LLM Invented This Cycle');
    const b = deriveOpportunityDedupKey('Something Else Entirely Different Next Cycle');
    expect(a).toBe(b);
    expect(a).toBe('opportunity_type:other');
  });

  it('cross_dept opportunities stay distinct per partner department (intentional, not a bug)', () => {
    const financePartner = deriveOpportunityDedupKey('cross_dept', 'dept-finance-uuid');
    const admissionsPartner = deriveOpportunityDedupKey('cross_dept', 'dept-admissions-uuid');
    expect(financePartner).not.toBe(admissionsPartner);
    expect(financePartner).toBe('opportunity_type:cross_dept:dept-finance-uuid');
  });

  it('cross_dept with the same partner dedups to the same key', () => {
    const a = deriveOpportunityDedupKey('cross_dept', 'dept-finance-uuid');
    const b = deriveOpportunityDedupKey('cross_dept', 'dept-finance-uuid');
    expect(a).toBe(b);
  });

  // Boundary: cross_dept with no partner id falls back to the generic (ungrouped) key
  // rather than throwing or producing an unstable/undefined-containing string.
  it('cross_dept with no partner id falls back to the generic cross_dept key', () => {
    expect(deriveOpportunityDedupKey('cross_dept')).toBe('opportunity_type:cross_dept');
    expect(deriveOpportunityDedupKey('cross_dept', null)).toBe('opportunity_type:cross_dept');
    expect(deriveOpportunityDedupKey('cross_dept', '')).toBe('opportunity_type:cross_dept');
  });
});

describe('toDedupKeyTag / hasDedupKeyTag', () => {
  it('round-trips a key into a tag and detects it in a tags array', () => {
    const key = deriveOpportunityDedupKey('stale_initiative');
    const tag = toDedupKeyTag(key);
    expect(hasDedupKeyTag([tag], key)).toBe(true);
  });

  it('boundary: empty/null/undefined tags array never matches, never throws', () => {
    const key = deriveOpportunityDedupKey('no_active_work');
    expect(hasDedupKeyTag([], key)).toBe(false);
    expect(hasDedupKeyTag(null, key)).toBe(false);
    expect(hasDedupKeyTag(undefined, key)).toBe(false);
  });

  it('does not false-positive on an unrelated tag that merely contains the key as a substring', () => {
    const key = deriveOpportunityDedupKey('innovation_gap');
    // A tag like 'not-dedup_key:opportunity_type:innovation_gap' must not match — exact
    // array membership only, never a substring/regex match.
    expect(hasDedupKeyTag([`not-${toDedupKeyTag(key)}`], key)).toBe(false);
  });
});
