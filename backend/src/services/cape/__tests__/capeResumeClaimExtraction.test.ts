import {
  sanitizeEvidenceText, validateSkillClaims, scoreClaim, mergeClaims, RawSkillClaim,
} from '../capeResumeClaimExtraction';

function claim(overrides: Partial<RawSkillClaim> = {}): RawSkillClaim {
  return {
    skill_id: 'agents_mcp',
    subskills: ['tool_use'],
    evidence_text: 'Built an automated workflow using LLM tools',
    evidence_kind: 'built_owned',
    recency_years: 0,
    ownership: 'built',
    scope: 'team',
    confidence: 0.8,
    ...overrides,
  } as RawSkillClaim;
}

describe('sanitizeEvidenceText', () => {
  it('happy path: passes through clean text, truncated to 300 chars', () => {
    expect(sanitizeEvidenceText('Built a RAG pipeline for support tickets')).toBe('Built a RAG pipeline for support tickets');
    expect(sanitizeEvidenceText('x'.repeat(400))?.length).toBe(300);
  });

  it('failure path: strips email and phone-like patterns (§15 untrusted input / PII)', () => {
    const out = sanitizeEvidenceText('Contact jane.doe@example.com or 555-123-4567 for details');
    expect(out).not.toMatch(/jane\.doe@example\.com/);
    expect(out).not.toMatch(/555-123-4567/);
    expect(out).toContain('[redacted]');
  });

  it('boundary: null/undefined/empty input returns null', () => {
    expect(sanitizeEvidenceText(null)).toBeNull();
    expect(sanitizeEvidenceText(undefined)).toBeNull();
    expect(sanitizeEvidenceText('')).toBeNull();
  });
});

describe('validateSkillClaims', () => {
  it('happy path: keeps a well-formed claim', () => {
    const out = validateSkillClaims([claim()]);
    expect(out).toHaveLength(1);
  });

  it('failure path: drops a claim with an invalid skill_id instead of throwing', () => {
    const out = validateSkillClaims([claim({ skill_id: 'not_a_real_skill' as any }), claim()]);
    expect(out).toHaveLength(1);
    expect(out[0].skill_id).toBe('agents_mcp');
  });

  it('boundary: non-array input returns an empty array without throwing', () => {
    expect(validateSkillClaims(null)).toEqual([]);
    expect(validateSkillClaims(undefined)).toEqual([]);
    expect(validateSkillClaims('not an array')).toEqual([]);
  });

  it('boundary: confidence outside [0,1] is rejected', () => {
    const out = validateSkillClaims([claim({ confidence: 1.5 as any })]);
    expect(out).toHaveLength(0);
  });
});

describe('scoreClaim — §5 6-tier evidence ladder, ascending', () => {
  const tiers: Array<[string, number]> = [
    ['keyword_list', 1], ['job_bullet', 2], ['built_owned', 3],
    ['measurable_outcome', 4], ['production', 5], ['led_architecture_decisions', 6],
  ];

  it('happy path: each tier scores strictly higher than the previous, at equal confidence/recency', () => {
    const scores = tiers.map(([kind]) => scoreClaim(claim({ evidence_kind: kind as any, confidence: 1, recency_years: 0 })));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });

  it('boundary: confidence 0 yields a score of 0 regardless of tier', () => {
    expect(scoreClaim(claim({ evidence_kind: 'led_architecture_decisions', confidence: 0 }))).toBe(0);
  });

  it('boundary: confidence 1 on the strongest tier yields the max base credit for that tier', () => {
    expect(scoreClaim(claim({ evidence_kind: 'led_architecture_decisions', confidence: 1, recency_years: 0 }))).toBe(60);
  });

  it('recency decay: older evidence scores lower than identical recent evidence', () => {
    const recent = scoreClaim(claim({ recency_years: 0 }));
    const mid = scoreClaim(claim({ recency_years: 4 }));
    const old = scoreClaim(claim({ recency_years: 10 }));
    expect(recent).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(old);
  });
});

describe('mergeClaims', () => {
  it('happy path: one claim per skill_id, unrelated skills stay separate', () => {
    const merged = mergeClaims([
      claim({ skill_id: 'agents_mcp' }),
      claim({ skill_id: 'rag', evidence_kind: 'job_bullet' }),
    ]);
    expect(merged.size).toBe(2);
    expect(merged.get('agents_mcp')?.source_count).toBe(1);
    expect(merged.get('rag')?.source_count).toBe(1);
  });

  it('repetition bonus: multiple claims for the same skill score higher than the strongest single claim alone, capped', () => {
    const single = mergeClaims([claim({ skill_id: 'governance', evidence_kind: 'job_bullet', confidence: 0.5 })]).get('governance')!;
    const repeated = mergeClaims([
      claim({ skill_id: 'governance', evidence_kind: 'job_bullet', confidence: 0.5 }),
      claim({ skill_id: 'governance', evidence_kind: 'job_bullet', confidence: 0.5 }),
      claim({ skill_id: 'governance', evidence_kind: 'job_bullet', confidence: 0.5 }),
    ]).get('governance')!;
    expect(repeated.credit_weight).toBeGreaterThan(single.credit_weight);
    expect(repeated.source_count).toBe(3);
    // cap: 20 extra repeated claims should not blow past CREDIT_CAP(100) or an unbounded bonus
    const many = mergeClaims(Array.from({ length: 20 }, () => claim({ skill_id: 'governance', evidence_kind: 'led_architecture_decisions', confidence: 1 }))).get('governance')!;
    expect(many.credit_weight).toBeLessThanOrEqual(100);
  });

  it('evidence_text is sanitized in the merged output', () => {
    const merged = mergeClaims([claim({ evidence_text: 'reach me at test@example.com' })]);
    expect(merged.get('agents_mcp')?.evidence_text).not.toMatch(/test@example\.com/);
  });

  it('idempotency: merging the same input twice produces identical output', () => {
    const input = [claim({ skill_id: 'rag' }), claim({ skill_id: 'rag', evidence_kind: 'production' })];
    const first = mergeClaims(input);
    const second = mergeClaims(input);
    expect(first.get('rag')).toEqual(second.get('rag'));
  });

  it('boundary: empty input returns an empty map', () => {
    expect(mergeClaims([]).size).toBe(0);
  });
});
