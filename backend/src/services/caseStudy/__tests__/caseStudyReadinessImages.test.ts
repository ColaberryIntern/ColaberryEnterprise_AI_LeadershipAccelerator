import {
  CASE_STUDY_READINESS_CHECK_POINTS,
  CASE_STUDY_READINESS_WEIGHTS,
  scoreCaseStudyReadiness,
} from '../caseStudyReadinessService';
import type {
  CaseStudyReadinessInput,
  CaseStudyReadinessReport,
} from '../caseStudyReadinessService';
import type {
  CaseStudyArtifactRef,
  CaseStudySnapshotContent,
} from '../../../types/caseStudy';

/**
 * The two-image standard, as a rubric rule rather than a habit.
 *
 * WHY IT IS A RULE AT ALL. A detail page with one image is a hero and then a
 * wall of text: the carousel has nothing to carousel and the story has nothing
 * to look at inside it. That standard was previously a thing someone had to
 * remember while reviewing. `artifacts.two_images` makes forgetting cost points
 * and produces a named, actionable gap saying what is missing.
 *
 * WHAT COUNTS, AND WHY THE URL IS PART OF IT. `projectArtifacts` drops a public
 * artifact whose `publicUrl` is absent or is not http(s) — the row exists and
 * the page shows nothing. A rule that counted such a row would agree with a
 * blank page, which is precisely the state it exists to catch. So all four of
 * approved / public / image-typed / addressable are required, and each one is
 * pinned below by removing it on its own.
 *
 * PURE. No database, no clock. Separate from `caseStudyReadinessService.test.ts`
 * because that file is at 554 lines and owns AC1-AC4; this one owns the image
 * rule and nothing else.
 */

/* ───────────────────────────────────────────────────────────── fixtures ──── */

const image = (over: Partial<CaseStudyArtifactRef> = {}): CaseStudyArtifactRef => ({
  id: 'a-0',
  artifactType: 'screenshot',
  title: 'Run duration dashboard',
  sourceType: 'repo',
  visibility: 'public',
  status: 'approved',
  publicUrl: 'https://media.example.org/run-duration.png',
  ...over,
} as CaseStudyArtifactRef);

const contentWith = (artifacts: readonly CaseStudyArtifactRef[]): CaseStudySnapshotContent => ({
  identity: {
    slug: 'a-record', title: 'A record',
    organizationIdentityMode: 'hidden', organizationNamingConsent: false,
    builderIdentityMode: 'anonymous', builderNamingConsent: false,
  },
  heroMetrics: [],
  artifacts,
  taxonomy: { capabilities: [], stack: [], deliverables: [] },
});

const inputWith = (artifacts: readonly CaseStudyArtifactRef[]): CaseStudyReadinessInput => ({
  content: contentWith(artifacts),
  status: 'draft',
});

const CHECK = 'artifacts.two_images';

const awarded = (report: CaseStudyReadinessReport): number => {
  const gap = report.gaps.find((g) => g.checkKey === CHECK);
  const possible = CASE_STUDY_READINESS_CHECK_POINTS.find((c) => c.key === CHECK)?.points ?? 0;
  return possible - (gap?.pointsLost ?? 0);
};

const TWO = [
  image({ id: 'a1' }),
  image({ id: 'a2', artifactType: 'architecture', title: 'Pipeline architecture', publicUrl: 'https://media.example.org/pipeline.png' }),
];

/* ────────────────────────────────────────────────────── the rule itself ──── */

describe('the rubric scores a record down for having fewer than two images', () => {
  it('is worth three points, and the artifacts category still sums to its weight', () => {
    // Non-vacuity for everything below: if the check did not exist, `awarded`
    // would read a possible of 0 and every comparison would trivially hold.
    const points = CASE_STUDY_READINESS_CHECK_POINTS.filter((c) => c.key === CHECK);
    expect(points).toHaveLength(1);
    expect(points[0].points).toBe(3);
    expect(points[0].category).toBe('artifacts');

    const total = CASE_STUDY_READINESS_CHECK_POINTS
      .filter((c) => c.category === 'artifacts')
      .reduce((sum, c) => sum + c.points, 0);
    expect(total).toBe(CASE_STUDY_READINESS_WEIGHTS.artifacts);
  });

  it('awards all three to a record with two publicly viewable images', () => {
    const report = scoreCaseStudyReadiness(inputWith(TWO));
    expect(awarded(report)).toBe(3);
    expect(report.gaps.map((g) => g.checkKey)).not.toContain(CHECK);
  });

  it('scores a ONE-image record down, and says so by name', () => {
    const report = scoreCaseStudyReadiness(inputWith([TWO[0]]));
    expect(awarded(report)).toBe(1);
    const gap = report.gaps.find((g) => g.checkKey === CHECK);
    expect(gap).toBeDefined();
    expect(gap?.pointsLost).toBe(2);
    expect(gap?.pointsPossible).toBe(3);
    expect(gap?.detail).toBe('fewer than two approved images are publicly viewable');
    expect(gap?.remedy).toMatch(/at least two images/);
  });

  it('scores a no-image record down further still', () => {
    const report = scoreCaseStudyReadiness(inputWith([]));
    expect(awarded(report)).toBe(0);
    expect(report.gaps.find((g) => g.checkKey === CHECK)?.pointsLost).toBe(3);
  });

  it('scores a two-image record strictly better than a one-image one', () => {
    // The gradient, asserted end to end rather than per-check, because the score
    // is the number a reviewer actually looks at.
    const one = scoreCaseStudyReadiness(inputWith([TWO[0]])).score;
    const two = scoreCaseStudyReadiness(inputWith(TWO)).score;
    expect(two).toBeGreaterThan(one);
  });
});

/* ────────────────────────── what does not count, one condition at a time ─── */

describe('an image only counts when a reader can actually see it', () => {
  it('does not count one with no public URL — the page would show a blank space', () => {
    const report = scoreCaseStudyReadiness(inputWith([
      TWO[0],
      image({ id: 'a2', artifactType: 'architecture', publicUrl: undefined }),
    ]));
    expect(awarded(report)).toBe(1);
  });

  it('does not count one whose URL is not http(s)', () => {
    const report = scoreCaseStudyReadiness(inputWith([
      TWO[0],
      image({ id: 'a2', artifactType: 'architecture', publicUrl: 'javascript:alert(1)' }),
    ]));
    expect(awarded(report)).toBe(1);
  });

  it('does not count an unapproved one', () => {
    const report = scoreCaseStudyReadiness(inputWith([
      TWO[0], image({ id: 'a2', artifactType: 'architecture', status: 'candidate' }),
    ]));
    expect(awarded(report)).toBe(1);
  });

  it('does not count a request-only or private one', () => {
    expect(awarded(scoreCaseStudyReadiness(inputWith([
      TWO[0], image({ id: 'a2', artifactType: 'architecture', visibility: 'request_only' }),
    ])))).toBe(1);
    expect(awarded(scoreCaseStudyReadiness(inputWith([
      TWO[0], image({ id: 'a2', artifactType: 'architecture', visibility: 'private' }),
    ])))).toBe(1);
  });

  it('does not count a demo, which is a video and not an image', () => {
    const report = scoreCaseStudyReadiness(inputWith([
      TWO[0], image({ id: 'a2', artifactType: 'demo', title: 'Recorded walkthrough' }),
    ]));
    expect(awarded(report)).toBe(1);
  });

  it('DOES count a photograph, because the standard is about the page not being text', () => {
    // Atmosphere counts toward "there is something to look at" and toward
    // nothing else: no check in the evidence or outcome categories reads the
    // image list. Without this case the rule would silently be "two pieces of
    // evidence", which is a different and much stronger demand.
    const report = scoreCaseStudyReadiness(inputWith([
      TWO[0],
      image({ id: 'a2', artifactType: 'photo', title: 'The Dallas studio', publicUrl: 'https://media.example.org/studio.jpg' }),
    ]));
    expect(awarded(report)).toBe(3);
  });

  it('leaves the evidence and outcome categories untouched by images', () => {
    const withImages = scoreCaseStudyReadiness(inputWith(TWO));
    const without = scoreCaseStudyReadiness(inputWith([]));
    const at = (r: CaseStudyReadinessReport, c: string): number =>
      r.categories.find((x) => x.category === c)?.awarded ?? -1;
    expect(at(withImages, 'evidence')).toBe(at(without, 'evidence'));
    expect(at(withImages, 'outcome')).toBe(at(without, 'outcome'));
  });
});
