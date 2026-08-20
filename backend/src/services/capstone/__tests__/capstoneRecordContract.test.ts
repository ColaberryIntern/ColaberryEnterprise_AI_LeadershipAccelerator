/**
 * capstoneRecordContract — the shareability bar and the permalink rule.
 *
 * Both decide what a stranger sees. The gap check decides whether a student is
 * allowed to send someone a page with nine blank weeks on it; the permalink
 * rule decides whether the links on that page still work in two years.
 */
import {
  CapstoneRecord,
  RecordArtifact,
  artifactPermalink,
  isShareable,
  recordGaps,
} from '../capstoneRecordContract';

const artifact = (over: Partial<RecordArtifact> = {}): RecordArtifact => ({
  week: 4,
  title: 'Prompt Library',
  filename: 'prompts.md',
  path: 'artifacts/week-04/prompts.md',
  commit_sha: 'abc123def456',
  built_on: 'Meridian Intake Agent',
  is_sample: false,
  verification: 'verified',
  ...over,
});

const record = (over: Partial<CapstoneRecord> = {}): CapstoneRecord => ({
  schema_version: 1,
  identity: {
    full_name: 'Dana Okoye',
    headline: 'AI Systems Architect',
    cohort_name: 'Cohort - July 2026',
    repo_url: 'https://github.com/dana/architect-workspace',
    demo_url: 'https://youtu.be/abc',
    certification: null,
  },
  system: {
    project_name: 'Meridian Intake Agent',
    descriptor: 'A governed intake-to-invoice agent.',
    architecture_mermaid: null,
    hours_reclaimed: 12,
  },
  artifacts: [artifact({ week: 4 }), artifact({ week: 5 }), artifact({ week: 6 })],
  competencies: [],
  posts: [],
  bookend: { opening: null, closing: null },
  ...over,
});

describe('recordGaps', () => {
  it('reports no gaps for a record that is genuinely ready', () => {
    expect(recordGaps(record())).toEqual([]);
    expect(isShareable(record())).toBe(true);
  });

  it('blocks sharing when there is no system described', () => {
    const r = record({ system: { project_name: null, descriptor: null, architecture_mermaid: null, hours_reclaimed: null } });
    expect(recordGaps(r)).toContain('no_system');
    expect(isShareable(r)).toBe(false);
  });

  it('blocks sharing with no artifacts at all', () => {
    // A page with twelve blank weeks reads as abandonment, not as progress.
    expect(recordGaps(record({ artifacts: [] }))).toContain('no_artifacts');
  });

  it('blocks sharing when the work spans fewer than three weeks', () => {
    const r = record({ artifacts: [artifact({ week: 4 }), artifact({ week: 4 })] });
    expect(recordGaps(r)).toContain('too_few_weeks');
  });

  it('counts distinct weeks, not artifact count', () => {
    // Five artifacts in one week is not five weeks of evidence.
    const r = record({ artifacts: [1, 2, 3, 4, 5].map(() => artifact({ week: 4 })) });
    expect(recordGaps(r)).toContain('too_few_weeks');
  });

  it('does not report too_few_weeks when there is nothing at all — one gap, not two', () => {
    expect(recordGaps(record({ artifacts: [] }))).not.toContain('too_few_weeks');
  });

  it('blocks sharing without a demo — a portfolio nobody can watch is a document', () => {
    const r = record({ identity: { ...record().identity, demo_url: null } });
    expect(recordGaps(r)).toContain('no_demo');
  });

  it('reports every gap at once rather than stopping at the first', () => {
    const empty = record({
      identity: { ...record().identity, demo_url: null },
      system: { project_name: null, descriptor: null, architecture_mermaid: null, hours_reclaimed: null },
      artifacts: [],
    });
    expect(recordGaps(empty).sort()).toEqual(['no_artifacts', 'no_demo', 'no_system']);
  });
});

describe('artifactPermalink', () => {
  it('pins to the commit SHA, never to a branch', () => {
    expect(artifactPermalink('https://github.com/dana/workspace', artifact()))
      .toBe('https://github.com/dana/workspace/blob/abc123def456/artifacts/week-04/prompts.md');
  });

  it('returns null rather than falling back to a branch when the SHA is unknown', () => {
    // A link to `main` silently points at a moving target. Better to render
    // the row unlinked than to hand someone a claim whose evidence has changed.
    expect(artifactPermalink('https://github.com/dana/workspace', artifact({ commit_sha: null }))).toBeNull();
  });

  it('returns null when there is no repo', () => {
    expect(artifactPermalink(null, artifact())).toBeNull();
  });

  it('normalises a .git suffix and a trailing slash', () => {
    expect(artifactPermalink('https://github.com/dana/workspace.git', artifact()))
      .toContain('/dana/workspace/blob/');
    expect(artifactPermalink('https://github.com/dana/workspace/', artifact()))
      .toContain('/dana/workspace/blob/');
  });
});
