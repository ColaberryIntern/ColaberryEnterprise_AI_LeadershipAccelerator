/**
 * caseStudyReadinessService — unit tests. T010 AC1-AC4, plus the "advisory, not
 * authorising" guard the task added.
 *
 * NO DATABASE, NO NETWORK, NO WALL CLOCK. Every fixture is built in this file
 * from `types/caseStudy` shapes, so the suite passes with `DATABASE_URL` unset.
 *
 * THE FIXTURE IS THE POINT OF AC3. `perfectContent()` is a Case Study whose only
 * proof point is `class: verified, method: repo` on a PERFORMANCE metric. It
 * carries no business ROI number, no cost saving, no revenue figure and no
 * client quote — and it scores a full 100. That is spec §13's explicit
 * allowance, and it is what stops spec §22's "never manufacture a number just to
 * make cards visually uniform" from being in tension with the rubric.
 */
import * as readinessModule from '../caseStudyReadinessService';
import {
  CASE_STUDY_READINESS_ADVISORY,
  CASE_STUDY_READINESS_BAND_FLOORS,
  CASE_STUDY_READINESS_CATEGORIES,
  CASE_STUDY_READINESS_CHECK_POINTS,
  CASE_STUDY_READINESS_MAX_SCORE,
  CASE_STUDY_READINESS_WEIGHTS,
  CaseStudyReadinessError,
  formatCaseStudyReadinessGap,
  isCaseStudyReadinessError,
  scoreCaseStudyReadiness,
} from '../caseStudyReadinessService';
import type {
  CaseStudyReadinessCategory,
  CaseStudyReadinessInput,
  CaseStudyReadinessReport,
} from '../caseStudyReadinessService';
import type {
  CaseStudyMetricEntry,
  CaseStudyMetricType,
  CaseStudySnapshotContent,
  CaseStudyVerification,
} from '../../../types/caseStudy';
import * as fs from 'fs';
import * as path from 'path';

/* ───────────────────────────────────────────────────────────── fixtures ──── */

const SHA = 'a'.repeat(40);
const repoVerified = (evidenceId?: string): CaseStudyVerification => ({
  class: 'verified', method: 'repo', verifiedAt: '2026-08-01T00:00:00.000Z', evidenceId,
});

/** A performance metric proven by a commit. NOT a business outcome. */
const PROOF_POINT: CaseStudyMetricEntry = {
  key: 'reconciliation_runtime',
  label: 'Nightly reconciliation runtime',
  valueDisplay: '18 minutes, down from just over four hours',
  numericValue: 18,
  unit: 'minutes',
  metricType: 'performance',
  verification: repoVerified('ev-runtime-1'),
  isHeadline: true,
  publishable: true,
  measurement: {
    baseline: '4h 02m median across the fourteen runs before the change',
    sample: 'thirty consecutive nightly runs',
    measured: 'wall-clock duration recorded by the job itself',
    methodology: 'median run duration, read from the workflow run log',
    limitations: ['one environment only; no financial figure was measured'],
  },
};

function perfectContent(): CaseStudySnapshotContent {
  return {
    identity: {
      slug: 'nightly-reconciliation-rebuild',
      title: 'Rebuilding a nightly reconciliation job',
      standfirst: 'A four-hour nightly job, rewritten until it finished before the analysts arrived.',
      summary: 'A batch reconciliation pipeline was rebuilt around incremental reads and a '
        + 'deterministic ordering, and the runtime is now pinned by the repository history.',
      organizationIdentityMode: 'anonymized',
      organizationNamingConsent: false,
      builderIdentityMode: 'role_only',
      builderNamingConsent: false,
      builtByType: 'colaberry_team',
      programLabel: 'Enterprise AI Accelerator',
      productionStatus: { status: 'shipped', verification: repoVerified('ev-runtime-1') },
    },
    heroMetrics: [PROOF_POINT],
    situation: {
      narrative: [
        'The reconciliation job ran overnight and regularly overran the analysts arriving.',
        'Nobody could say which step was slow, because the job logged only its own start and end.',
      ],
      verification: { class: 'verified', method: 'internal' },
    },
    buildTimeline: [
      { date: '2026-03-02', label: 'Instrumented each stage', source: 'commit', verification: repoVerified() },
      { date: '2026-03-19', label: 'Replaced the full reload with an incremental read', source: 'pull_request', verification: repoVerified() },
      { date: '2026-04-08', label: 'Cut over in production', source: 'release', verification: repoVerified() },
    ],
    architecture: {
      narrative: ['A scheduled worker reads a change feed, reconciles in batches and writes an audit row per run.'],
      stack: ['TypeScript', 'Node.js', 'PostgreSQL'],
      capabilities: ['batch reconciliation', 'anomaly flagging'],
    },
    measurement: {
      narrative: ['Runtime is measured by the job, not by the operator, so the figure survives a rerun.'],
      metrics: [PROOF_POINT],
    },
    roadmap: [
      { label: 'Hourly incremental runs', status: 'in_progress', verification: { class: 'pending', method: 'internal' } },
    ],
    contributors: [{ displayMode: 'role_only', role: 'Data engineer', kind: 'colaberry_team' }],
    // Both carry a `publicUrl`, because `artifacts.two_images` counts only an
    // image a reader can actually see: `projectArtifacts` drops a public
    // artifact with no http(s) address, so an approved row without one is a
    // blank space on the page. A fixture that claimed to be complete while
    // showing nothing would make that rule agree with an empty page.
    artifacts: [
      { id: 'a1', artifactType: 'screenshot', title: 'Run duration dashboard', sourceType: 'repo', visibility: 'public', status: 'approved', publicUrl: 'https://media.example.org/run-duration.png' },
      { id: 'a2', artifactType: 'architecture', title: 'Pipeline architecture', sourceType: 'repo', visibility: 'public', status: 'approved', publicUrl: 'https://media.example.org/pipeline.png' },
    ],
    repositories: [{
      repoOwner: 'colaberry', repoName: 'reconciliation',
      repoUrl: 'https://github.com/colaberry/reconciliation',
      role: 'primary', visibility: 'public', accessStatus: 'connected',
      allowPublicRepoLink: true, defaultBranch: 'main', lastSeenSha: SHA,
    }],
    taxonomy: {
      industry: 'manufacturing',
      primaryCapability: 'data-engineering',
      capabilities: ['batch-reconciliation', 'anomaly-flagging'],
      stack: ['typescript', 'node', 'postgresql'],
      deliverables: ['pipeline'],
      projectStatus: 'shipped',
    },
  };
}

const perfectInput = (): CaseStudyReadinessInput => ({
  content: perfectContent(),
  status: 'approved',
  snapshotStatus: 'approved',
  publication: { surfaceKey: 'enterprise' },
});

/** The other end of the scale: a brand-new candidate with nothing filled in. */
const emptyInput = (): CaseStudyReadinessInput => ({
  content: {
    identity: {
      slug: '', title: '',
      organizationIdentityMode: 'hidden', organizationNamingConsent: false,
      builderIdentityMode: 'anonymous', builderNamingConsent: false,
    },
    heroMetrics: [],
    taxonomy: { capabilities: [], stack: [], deliverables: [] },
  },
  status: 'draft',
});

const categoryScore = (r: CaseStudyReadinessReport, c: CaseStudyReadinessCategory): number =>
  r.categories.find((x) => x.category === c)?.awarded ?? -1;

const SERVICE_DIR = path.join(__dirname, '..');
const readSource = (f: string) => fs.readFileSync(path.join(SERVICE_DIR, f), 'utf8');

/* ── AC1 — the weights sum to exactly 100, computed from the table ────────── */

describe('AC1 — weights sum to exactly 100', () => {
  it('sums the exported weight table to 100 (never a hardcoded literal)', () => {
    const sum = CASE_STUDY_READINESS_CATEGORIES
      .reduce((total, key) => total + CASE_STUDY_READINESS_WEIGHTS[key], 0);
    expect(sum).toBe(100);
    // Object.values as a second path, so a category present in the table but
    // missing from the ordered list cannot hide behind the reduce above.
    expect(Object.values(CASE_STUDY_READINESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('exports a MAX_SCORE derived from that same sum', () => {
    expect(CASE_STUDY_READINESS_MAX_SCORE).toBe(
      Object.values(CASE_STUDY_READINESS_WEIGHTS).reduce((a, b) => a + b, 0),
    );
  });

  it('the ordered category list and the weight table describe the same set', () => {
    expect([...CASE_STUDY_READINESS_CATEGORIES].sort())
      .toEqual(Object.keys(CASE_STUDY_READINESS_WEIGHTS).sort());
  });

  it('matches spec 13 category for category', () => {
    expect(CASE_STUDY_READINESS_WEIGHTS).toEqual({
      identity: 10, technical: 15, story: 15, artifacts: 10,
      evidence: 20, outcome: 15, consent: 10, publication: 5,
    });
  });

  it('every category-s checks award exactly its weight, and no orphan checks exist', () => {
    const perCategory = new Map<string, number>();
    for (const check of CASE_STUDY_READINESS_CHECK_POINTS) {
      expect(CASE_STUDY_READINESS_CATEGORIES).toContain(check.category);
      perCategory.set(check.category, (perCategory.get(check.category) ?? 0) + check.points);
    }
    for (const category of CASE_STUDY_READINESS_CATEGORIES) {
      expect(perCategory.get(category)).toBe(CASE_STUDY_READINESS_WEIGHTS[category]);
    }
  });

  it('the top of the scale is reachable — a complete record scores the full 100', () => {
    const report = scoreCaseStudyReadiness(perfectInput());
    expect(report.score).toBe(CASE_STUDY_READINESS_MAX_SCORE);
    expect(report.gaps).toEqual([]);
  });
});

/* ── AC2 — pure and deterministic ─────────────────────────────────────────── */

describe('AC2 — pure and deterministic', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('the same input scores identically twice, field for field', () => {
    const input = perfectInput();
    expect(JSON.stringify(scoreCaseStudyReadiness(input)))
      .toBe(JSON.stringify(scoreCaseStudyReadiness(input)));
  });

  it('two runs at DIFFERENT mocked clock values agree exactly', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2001-01-01T00:00:00.000Z'));
    const early = scoreCaseStudyReadiness(perfectInput());
    jest.setSystemTime(new Date('2031-12-31T23:59:59.000Z'));
    const late = scoreCaseStudyReadiness(perfectInput());
    expect(JSON.stringify(late)).toBe(JSON.stringify(early));
  });

  it('reads neither the clock nor the random source', () => {
    const now = jest.spyOn(Date, 'now');
    const random = jest.spyOn(Math, 'random');
    scoreCaseStudyReadiness(perfectInput());
    scoreCaseStudyReadiness(emptyInput());
    expect(now).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
  });

  it('and could not, because neither source file contains a volatile call', () => {
    for (const file of ['caseStudyReadinessService.ts', 'caseStudyReadinessRubric.ts']) {
      const src = readSource(file);
      expect(src).not.toMatch(/Date\.now|new Date\(|Math\.random|process\.env|require\(/);
    }
  });

  it('does not mutate its input', () => {
    const input = perfectInput();
    const before = JSON.stringify(input);
    scoreCaseStudyReadiness(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('returns a frozen report, so a caller cannot edit a score after the fact', () => {
    const report = scoreCaseStudyReadiness(emptyInput());
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.gaps)).toBe(true);
  });
});

/* ── AC3 — repo-verified proof point, no business ROI, still scores well ──── */

describe('AC3 — a repo-verified record with no business ROI reaches full readiness', () => {
  it('the fixture genuinely contains no business outcome and no money language', () => {
    const content = perfectContent();
    const metrics = [...content.heroMetrics, ...(content.measurement?.metrics ?? [])];
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.some((m) => m.metricType === 'business_outcome')).toBe(false);
    expect(JSON.stringify(content)).not.toMatch(/\broi\b|revenue|profit|\bcost\b|\$/i);
    // Its single proof point is exactly spec 14-s "class: verified / method: repo".
    expect(metrics[0].verification.class).toBe('verified');
    expect(metrics[0].verification.method).toBe('repo');
  });

  it('and it scores the full 100 with no gaps at all', () => {
    const report = scoreCaseStudyReadiness(perfectInput());
    expect(report.score).toBe(100);
    expect(report.band).toBe('substantial');
    expect(report.gaps).toEqual([]);
    expect(categoryScore(report, 'outcome')).toBe(CASE_STUDY_READINESS_WEIGHTS.outcome);
    expect(categoryScore(report, 'evidence')).toBe(CASE_STUDY_READINESS_WEIGHTS.evidence);
  });

  const ALL_METRIC_TYPES: readonly CaseStudyMetricType[] = [
    'business_outcome', 'delivery', 'performance', 'scale', 'quality', 'adoption', 'technical',
  ];

  it.each(ALL_METRIC_TYPES)('scores identically when the proof point is typed %s', (metricType) => {
    const content = perfectContent();
    const retyped = { ...PROOF_POINT, metricType };
    const report = scoreCaseStudyReadiness({
      ...perfectInput(),
      content: { ...content, heroMetrics: [retyped], measurement: { ...content.measurement, metrics: [retyped] } },
    });
    expect(report.score).toBe(100);
  });

  it('falsifiable: strip the verification and the outcome category collapses', () => {
    const content = perfectContent();
    const unverified: CaseStudyMetricEntry = {
      ...PROOF_POINT,
      verification: { class: 'pending', method: 'self' },
    };
    const report = scoreCaseStudyReadiness({
      ...perfectInput(),
      content: { ...content, heroMetrics: [unverified], measurement: { ...content.measurement, metrics: [unverified] } },
    });
    // 15 -> 3: the proof point (9) and its display (3) are gone. The surviving 3
    // is `what_happened_next`, which productionStatus still answers — the rubric
    // grades each fact separately rather than zeroing a whole category.
    expect(categoryScore(report, 'outcome')).toBe(3);
    expect(categoryScore(report, 'evidence')).toBe(3);
    expect(report.gaps.map((g) => g.checkKey))
      .toEqual(expect.arrayContaining(['outcome.proof_point', 'outcome.expressed', 'evidence.verified_claim']));
    expect(report.score).toBeLessThan(CASE_STUDY_READINESS_MAX_SCORE);
  });
});

/* ── AC4 — actionable named gaps, not just a number ───────────────────────── */

describe('AC4 — gaps are named and actionable', () => {
  const report = scoreCaseStudyReadiness(emptyInput());

  it('an empty candidate produces many gaps, not one number', () => {
    expect(report.score).toBeLessThan(CASE_STUDY_READINESS_MAX_SCORE);
    expect(report.gaps.length).toBeGreaterThan(10);
  });

  it('every gap names its category, its cost, and what would close it', () => {
    for (const gap of report.gaps) {
      expect(CASE_STUDY_READINESS_CATEGORIES).toContain(gap.category);
      expect(gap.categoryLabel.length).toBeGreaterThan(0);
      expect(gap.checkKey).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(gap.pointsLost).toBeGreaterThan(0);
      expect(gap.pointsLost).toBeLessThanOrEqual(gap.pointsPossible);
      expect(gap.detail.trim().length).toBeGreaterThan(10);
      expect(gap.remedy.trim().length).toBeGreaterThan(10);
    }
  });

  it('the points lost account for exactly the points not scored', () => {
    const lost = report.gaps.reduce((total, g) => total + g.pointsLost, 0);
    expect(lost).toBe(CASE_STUDY_READINESS_MAX_SCORE - report.score);
  });

  it('carries the spec-13 example gap verbatim: Evidence 0/20, headline claim unevidenced', () => {
    const evidence = report.categories.find((c) => c.category === 'evidence');
    expect(evidence?.summary).toBe('Evidence: 0/20');
    const headline = report.gaps.find((g) => g.checkKey === 'evidence.headline_linked');
    expect(headline).toBeDefined();
    expect(headline?.pointsLost).toBe(8);
    expect(headline?.detail).toBe('no verified evidence is linked to the headline claim');
    expect(formatCaseStudyReadinessGap(headline!))
      .toBe('Evidence: -8 of 8 — no verified evidence is linked to the headline claim. '
        + 'To close: link a case_study_evidence row to every headline metric (verification.evidenceId)');
  });

  it('partial credit is explained rather than silently applied', () => {
    const content = perfectContent();
    const report2 = scoreCaseStudyReadiness({
      ...perfectInput(),
      content: { ...content, situation: { ...content.situation!, narrative: ['only one paragraph'] } },
    });
    const gap = report2.gaps.find((g) => g.checkKey === 'story.situation');
    expect(gap?.pointsLost).toBe(2);
    expect(gap?.pointsPossible).toBe(5);
    expect(categoryScore(report2, 'story')).toBe(13);
  });

  it('gaps arrive in rubric order, so the panel is stable between renders', () => {
    const order = report.gaps.map((g) => CASE_STUDY_READINESS_CATEGORIES.indexOf(g.category));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

/* ── Advisory, not authorising ────────────────────────────────────────────── */

describe('the module authorises nothing', () => {
  it('exports nothing that reads as a publish decision', () => {
    const names = Object.keys(readinessModule)
      .filter((n) => n !== '__esModule' && n !== 'default');
    for (const name of names) {
      expect(name).not.toMatch(/publish|approv|authori|permit|eligib|verdict|deny|blocked/i);
    }
    // Exact surface: a NEW export cannot appear without a human updating this
    // list, which is the moment to ask whether it is a second publish gate.
    expect(names.sort()).toEqual([
      'CASE_STUDY_READINESS_ADVISORY',
      'CASE_STUDY_READINESS_BAND_FLOORS',
      'CASE_STUDY_READINESS_CATEGORIES',
      'CASE_STUDY_READINESS_CATEGORY_LABELS',
      'CASE_STUDY_READINESS_CHECK_POINTS',
      'CASE_STUDY_READINESS_MAX_SCORE',
      'CASE_STUDY_READINESS_WEIGHTS',
      'CaseStudyReadinessError',
      'formatCaseStudyReadinessGap',
      'isCaseStudyReadinessError',
      'scoreCaseStudyReadiness',
    ].sort());
  });

  it('the report carries no boolean anywhere — there is no verdict to read', () => {
    const walk = (value: unknown): void => {
      expect(typeof value).not.toBe('boolean');
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(scoreCaseStudyReadiness(perfectInput()));
    walk(scoreCaseStudyReadiness(emptyInput()));
  });

  it('no band is named for permission, and the payload says so out loud', () => {
    expect(Object.keys(CASE_STUDY_READINESS_BAND_FLOORS).sort()).toEqual(['developing', 'substantial']);
    const report = scoreCaseStudyReadiness(perfectInput());
    expect(report.band).toBe('substantial');
    expect(report.advisory).toBe(CASE_STUDY_READINESS_ADVISORY);
    expect(report.advisory).toMatch(/does not .*authorise publication/i);
    expect(report.advisory).toMatch(/publish gate is the only authority/i);
  });

  it('and the module header states it, where the next reader will look', () => {
    const src = readSource('caseStudyReadinessService.ts');
    expect(src).toMatch(/ADVISORY, NOT AUTHORISING/);
    expect(src).toMatch(/only\s+\*?\s*authority on whether a Case Study may be published/);
  });
});

/* ── Consent scoring reflects the real gate (spec 16) ─────────────────────── */

describe('consent scoring follows identity mode plus the matching consent flag', () => {
  const withIdentity = (patch: Partial<CaseStudySnapshotContent['identity']>) => {
    const content = perfectContent();
    return scoreCaseStudyReadiness({
      ...perfectInput(),
      content: { ...content, identity: { ...content.identity, ...patch } },
    });
  };

  it('a settled hidden/anonymous record is fully consented — the DDL default is safe', () => {
    expect(categoryScore(scoreCaseStudyReadiness(emptyInput()), 'consent'))
      .toBe(CASE_STUDY_READINESS_WEIGHTS.consent);
  });

  it('named organization WITH consent and a display name scores its 4', () => {
    const report = withIdentity({
      organizationIdentityMode: 'named',
      organizationNamingConsent: true,
      organizationDisplayName: 'Northwind Bottling',
    });
    expect(categoryScore(report, 'consent')).toBe(10);
  });

  it('named organization WITHOUT consent loses those 4 and says why', () => {
    const report = withIdentity({
      organizationIdentityMode: 'named',
      organizationNamingConsent: false,
      organizationDisplayName: 'Northwind Bottling',
    });
    expect(categoryScore(report, 'consent')).toBe(6);
    const gap = report.gaps.find((g) => g.checkKey === 'consent.organization');
    expect(gap?.remedy).toMatch(/naming consent/);
  });

  it('named organization WITH consent but no display name still loses them', () => {
    const report = withIdentity({ organizationIdentityMode: 'named', organizationNamingConsent: true });
    expect(categoryScore(report, 'consent')).toBe(6);
  });

  it('named builder without builder naming consent loses its 3', () => {
    const report = withIdentity({ builderIdentityMode: 'named', builderNamingConsent: false });
    expect(categoryScore(report, 'consent')).toBe(7);
    expect(report.gaps.map((g) => g.checkKey)).toContain('consent.builder');
  });

  it('a named contributor under a role_only builder mode is incoherent and scores 0', () => {
    const content = perfectContent();
    const report = scoreCaseStudyReadiness({
      ...perfectInput(),
      content: {
        ...content,
        contributors: [{
          displayMode: 'named', displayName: 'A Person', role: 'Engineer',
          kind: 'colaberry_team', consentRecordedAt: '2026-05-01T00:00:00.000Z',
        }],
      },
    });
    expect(categoryScore(report, 'consent')).toBe(8);
    expect(report.gaps.map((g) => g.checkKey)).toContain('consent.contributors');
  });

  it('a private repo flagged for a public link loses the repo-link point', () => {
    const content = perfectContent();
    const report = scoreCaseStudyReadiness({
      ...perfectInput(),
      content: {
        ...content,
        repositories: [{ ...content.repositories![0], visibility: 'private', allowPublicRepoLink: true }],
      },
    });
    expect(categoryScore(report, 'consent')).toBe(9);
    expect(report.gaps.map((g) => g.checkKey)).toContain('consent.repo_links');
  });
});

/* ── Failure path and boundaries ──────────────────────────────────────────── */

describe('failure path and boundaries', () => {
  it('throws a classified ValidationError when content is absent', () => {
    const call = () => scoreCaseStudyReadiness({ status: 'draft' } as unknown as CaseStudyReadinessInput);
    expect(call).toThrow(CaseStudyReadinessError);
    try { call(); } catch (err) {
      expect(isCaseStudyReadinessError(err)).toBe(true);
      expect((err as CaseStudyReadinessError).error_class).toBe('ValidationError');
      expect((err as CaseStudyReadinessError).http_status).toBe(400);
    }
  });

  it('throws on a null input rather than scoring nothing as something', () => {
    expect(() => scoreCaseStudyReadiness(null as unknown as CaseStudyReadinessInput))
      .toThrow(CaseStudyReadinessError);
  });

  it('but never throws on an INCOMPLETE record — that is its subject matter', () => {
    const ragged = {
      content: {
        identity: {} as CaseStudySnapshotContent['identity'],
        heroMetrics: [null, undefined] as unknown as CaseStudySnapshotContent['heroMetrics'],
        taxonomy: undefined as unknown as CaseStudySnapshotContent['taxonomy'],
        artifacts: [null] as unknown as CaseStudySnapshotContent['artifacts'],
        repositories: 'not-an-array' as unknown as CaseStudySnapshotContent['repositories'],
      },
      status: 'draft',
    } as CaseStudyReadinessInput;
    const report = scoreCaseStudyReadiness(ragged);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(CASE_STUDY_READINESS_MAX_SCORE);
    expect(report.band).toBe('thin');
  });

  it('the score is bounded by the rubric in both directions', () => {
    for (const input of [perfectInput(), emptyInput()]) {
      const report = scoreCaseStudyReadiness(input);
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(CASE_STUDY_READINESS_MAX_SCORE);
      for (const category of report.categories) {
        expect(category.awarded).toBeGreaterThanOrEqual(0);
        expect(category.awarded).toBeLessThanOrEqual(category.weight);
      }
    }
  });

  it('bands follow their floors', () => {
    expect(scoreCaseStudyReadiness(emptyInput()).band).toBe('thin');
    expect(scoreCaseStudyReadiness(perfectInput()).band).toBe('substantial');
    expect(CASE_STUDY_READINESS_BAND_FLOORS.developing)
      .toBeLessThan(CASE_STUDY_READINESS_BAND_FLOORS.substantial);
  });
});
