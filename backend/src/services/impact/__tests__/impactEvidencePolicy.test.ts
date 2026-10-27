import {
  EVIDENCE_CLASSES,
  assertImpactPolicyHolds,
  evidenceClassFor,
  readAssessment,
  readBaseline,
  readMovement,
  resolveCommitEvidence,
  scaleBandOf,
  scalesAreComparable,
} from '../impactEvidencePolicy';

/**
 * C8.12 policy rules.
 *
 * THE ASSERTIONS THAT MATTER are the ones about what the report must NOT say. Each of
 * these failures produces a document that looks correct: the arithmetic completes, the
 * sentence parses, and a sponsor reads a number nobody measured. The tests are therefore
 * written against the fabrications rather than against the happy path.
 */

const SHA = 'abc1234567890abcdef1234567890abcdef12345';

describe('readBaseline', () => {
  it('REFUSES placement_score at every value, including the fourteen non-zero rows', () => {
    // The non-zero ones are the dangerous inputs: they are the only values that could
    // make the report print a movement sentence, and placement is recomputed from the
    // CURRENT resume on every recompute, so it is not a record of the past.
    for (const v of [0, 0.01, 8.64, 16.2, 100]) {
      const r = readBaseline({ source: 'placement_score', value: v });
      expect(r).toMatchObject({ state: 'not_measured', value: null, isMeasurement: false });
    }
    expect(readBaseline({ source: 'placement_score', value: 8.64 }).because)
      .toContain('diagnostic_attempts');
  });

  it('treats a zero claim as an absent claim, not a claim of zero', () => {
    const r = readBaseline({ source: 'intake_resume_claim', value: 0 });
    expect(r.state).toBe('not_measured');
    // The null is the load-bearing part. A caller that gets 0 back will subtract it.
    expect(r.value).toBeNull();
  });

  it('treats null and undefined as absent', () => {
    expect(readBaseline({ source: 'intake_resume_claim', value: null }).state).toBe('not_measured');
    expect(readBaseline({ source: 'intake_resume_claim', value: undefined }).state)
      .toBe('not_measured');
  });

  it('keeps a real intake claim, and never calls it a measurement', () => {
    const r = readBaseline({ source: 'intake_resume_claim', value: 8.64 });
    expect(r).toMatchObject({ state: 'claimed', value: 8.64, isMeasurement: false });
  });

  it('keeps a small non-zero claim rather than rounding it away', () => {
    expect(readBaseline({ source: 'intake_resume_claim', value: 0.01 }))
      .toMatchObject({ state: 'claimed', value: 0.01 });
  });
});

describe('readMovement', () => {
  const claimed = readBaseline({ source: 'intake_resume_claim', value: 8.64 });

  it('reports claim-to-evidence, never measured movement, from a resume claim', () => {
    const m = readMovement({ baseline: claimed, latest: 20, distinctObservationDays: 4 });
    expect(m).toMatchObject({
      state: 'claim_to_evidence', from: 8.64, to: 20, observationDays: 4, isLikeForLike: false,
    });
  });

  it('reserves measured for a real instrument baseline', () => {
    // Constructed by hand because nothing in the platform can currently produce one.
    const instrument = { state: 'measured' as const, value: 10, isMeasurement: true, because: 'x' };
    const m = readMovement({ baseline: instrument, latest: 20, distinctObservationDays: 3 });
    expect(m).toMatchObject({ state: 'measured', isLikeForLike: true });
  });

  it('refuses movement from one observation day', () => {
    expect(readMovement({ baseline: claimed, latest: 20, distinctObservationDays: 1 }).state)
      .toBe('single_observation');
  });

  it('refuses movement with no baseline, however many observations there are', () => {
    const m = readMovement({
      baseline: readBaseline({ source: 'placement_score', value: 60 }),
      latest: 60,
      distinctObservationDays: 42,
    });
    expect(m.state).toBe('no_baseline');
    // `from` must stay null: a value here is the fabricated improvement.
    expect(m.from).toBeNull();
  });

  it('boundary: exactly two observation days is enough, zero is not', () => {
    expect(readMovement({ baseline: claimed, latest: 9, distinctObservationDays: 2 }).state)
      .toBe('claim_to_evidence');
    expect(readMovement({ baseline: claimed, latest: 9, distinctObservationDays: 0 }).state)
      .toBe('single_observation');
  });

  it('carries a null latest through rather than inventing one', () => {
    expect(readMovement({ baseline: claimed, latest: null, distinctObservationDays: 3 }).to)
      .toBeNull();
  });

  it('never reports isLikeForLike true unless the baseline was measured', () => {
    for (const days of [0, 1, 2, 50]) {
      const m = readMovement({ baseline: claimed, latest: 5, distinctObservationDays: days });
      expect(m.isLikeForLike).toBe(false);
    }
  });
});

describe('readAssessment', () => {
  it('calls an attempt with no threshold ungraded, not failed', () => {
    // Production: 230 quiz attempts, every pass_threshold null, mean score 0.835.
    const r = readAssessment({ score: 0.835, passThreshold: null, passedFlag: false });
    expect(r.state).toBe('not_graded');
    expect(r.score).toBe(0.835);
  });

  it('still reports a genuine failure as a failure', () => {
    expect(readAssessment({ score: 0.5, passThreshold: 0.7 }).state).toBe('not_passed');
  });

  it('reports a pass', () => {
    expect(readAssessment({ score: 0.9, passThreshold: 0.7 }).state).toBe('passed');
  });

  it('boundary: a score exactly at the threshold passes', () => {
    expect(readAssessment({ score: 0.7, passThreshold: 0.7 }).state).toBe('passed');
  });

  it('a missing score is ungraded even when a threshold exists', () => {
    expect(readAssessment({ score: null, passThreshold: 0.7 }).state).toBe('not_graded');
  });

  it('ignores the stored passed flag entirely', () => {
    // The flag is the thing that is wrong in production, so it must not be an input to
    // the verdict. A true flag with no threshold is still ungraded.
    expect(readAssessment({ score: 0.9, passThreshold: null, passedFlag: true }).state)
      .toBe('not_graded');
  });
});

describe('proficiency scales', () => {
  it('bands the three scales production actually holds', () => {
    expect(scaleBandOf(0.5)).toBe('unit');
    expect(scaleBandOf(6)).toBe('ten');
    expect(scaleBandOf(60)).toBe('wide');
  });

  it('boundaries sit where the bands say they do', () => {
    expect(scaleBandOf(1)).toBe('unit');
    expect(scaleBandOf(1.01)).toBe('ten');
    expect(scaleBandOf(10)).toBe('ten');
    expect(scaleBandOf(10.01)).toBe('wide');
  });

  it('refuses to call two scales comparable', () => {
    expect(scalesAreComparable([0.5, 60])).toBe(false);
    expect(scalesAreComparable([2.5, 6])).toBe(true);
  });

  it('ignores zeros, which are absence rather than a scale', () => {
    expect(scalesAreComparable([0, 0, 6])).toBe(true);
    expect(scalesAreComparable([])).toBe(true);
  });
});

describe('resolveCommitEvidence', () => {
  it('resolves a commit through the project repository', () => {
    const r = resolveCommitEvidence({
      sourceRef: `STORY-001@${SHA}`,
      repoUrl: 'https://github.com/acme/widget',
    });
    expect(r).toMatchObject({
      sha: SHA,
      storyKey: 'STORY-001',
      url: `https://github.com/acme/widget/commit/${SHA}`,
    });
  });

  it('keeps the sha but refuses a url when no repository was recorded', () => {
    // This is the production case for 382 of 383 rows: the verdict survived, the
    // locator did not.
    const r = resolveCommitEvidence({ sourceRef: `STORY-001@${SHA}`, repoUrl: null });
    expect(r.sha).toBe(SHA);
    expect(r.url).toBeNull();
    expect(r.because).toContain('no repository');
  });

  it('tolerates a trailing slash and a .git suffix', () => {
    for (const repo of ['https://github.com/acme/widget/', 'https://github.com/acme/widget.git']) {
      expect(resolveCommitEvidence({ sourceRef: `S@${SHA}`, repoUrl: repo }).url)
        .toBe(`https://github.com/acme/widget/commit/${SHA}`);
    }
  });

  it('refuses a repository that is not an https GitHub repo url', () => {
    for (const bad of ['git@github.com:acme/widget', 'https://evil.example/acme/widget',
      'https://github.com/acme', 'https://github.com/acme/widget/tree/main']) {
      expect(resolveCommitEvidence({ sourceRef: `S@${SHA}`, repoUrl: bad }).url).toBeNull();
    }
  });

  it('rejects a ref that is not <key>@<40-hex>', () => {
    for (const bad of ['', 'STORY-001', SHA, `STORY-001@${SHA.slice(0, 39)}`, 'STORY-001@zzzz']) {
      expect(resolveCommitEvidence({ sourceRef: bad, repoUrl: 'https://github.com/a/b' }).url)
        .toBeNull();
    }
  });

  it('is deterministic: the same inputs give the same output', () => {
    const a = resolveCommitEvidence({ sourceRef: `S@${SHA}`, repoUrl: 'https://github.com/a/b' });
    const b = resolveCommitEvidence({ sourceRef: `S@${SHA}`, repoUrl: 'https://github.com/a/b' });
    expect(a).toEqual(b);
  });
});

describe('evidence classes', () => {
  it('names a source type for every class and looks them up', () => {
    for (const c of EVIDENCE_CLASSES) {
      expect(evidenceClassFor(c.sourceType)).toBe(c);
      expect(c.proves.length).toBeGreaterThan(10);
      expect(c.openabilityNote.length).toBeGreaterThan(10);
    }
  });

  it('returns null for an unknown source type rather than guessing', () => {
    expect(evidenceClassFor('self_reported')).toBeNull();
  });

  it('marks the internal-uuid sources as not independently openable', () => {
    for (const t of ['deliverable', 'implementation', 'prompt_lab', 'instructor_review']) {
      expect(evidenceClassFor(t)?.independentlyOpenable).toBe(false);
    }
  });
});

describe('the guards actually guard', () => {
  it('passes against the real implementation', () => {
    expect(() => assertImpactPolicyHolds()).not.toThrow();
  });
});
