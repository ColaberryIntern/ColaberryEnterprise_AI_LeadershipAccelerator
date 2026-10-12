/**
 * submissionPackage (PURE) — readiness is the finalization rail (ready only when every response is approved +
 * covered + nothing blocking); the manifest hashes each response + carries its commit-bound figures; the package
 * files are real downloadable files; the outcome candidates are born PRIVATE for BOTH won and lost, non-fabricating.
 */
import { evaluateSubmissionReadiness, buildSubmissionManifest, buildPackageFiles, buildOutcomeCandidates } from '../submissionPackage';

const slot = (id: string, status: any, content = 'x', figures: any[] = []) =>
  ({ requirementId: id, statement: `stmt ${id}`, sourceRef: null, status, content, figures });

describe('evaluateSubmissionReadiness', () => {
  it('is ready only when there is ≥1 slot, ALL approved, coverage sufficient, and nothing blocking', () => {
    expect(evaluateSubmissionReadiness([slot('R1', 'approved'), slot('R2', 'approved')], true, true)).toEqual({ ready: true, blocking: [] });
  });

  it('blocks when a response is not approved, NAMING the requirement', () => {
    const r = evaluateSubmissionReadiness([slot('R1', 'approved'), slot('R2', 'draft')], true, true);
    expect(r.ready).toBe(false);
    expect(r.blocking.some((b) => b.startsWith('responses_not_approved') && b.includes('R2'))).toBe(true);
  });

  it('blocks on insufficient coverage, on a blocking requirement, and on no slots', () => {
    expect(evaluateSubmissionReadiness([slot('R1', 'approved')], false, true).blocking).toContain('coverage_insufficient');
    expect(evaluateSubmissionReadiness([slot('R1', 'approved')], true, false).blocking).toContain('requirements_blocking');
    expect(evaluateSubmissionReadiness([], true, true).blocking).toContain('no_response_slots');
  });

  it('is total on garbage', () => {
    expect(evaluateSubmissionReadiness(undefined as any, true, true).ready).toBe(false);
  });
});

describe('buildSubmissionManifest + buildPackageFiles', () => {
  it('manifest hashes each response content (sha256) and carries its commit-bound figures', () => {
    const m = buildSubmissionManifest('TxDOT', [slot('R1', 'approved', 'hello', [{ commit: 'abc1234', ref: 'docs/x.png', caption: 'c' }])], '2026-10-08T00:00:00Z');
    expect(m.responseCount).toBe(1);
    expect(m.items[0].contentSha256).toHaveLength(64);
    expect(m.items[0].figures).toEqual([{ commit: 'abc1234', ref: 'docs/x.png' }]);
  });

  it('package files are real files: manifest.json, README.md, and one markdown per response', () => {
    const slots = [slot('R1', 'approved', 'We comply with SAM.')];
    const m = buildSubmissionManifest('TxDOT', slots, '2026-10-08T00:00:00Z');
    const entries = buildPackageFiles(m, slots);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('manifest.json');
    expect(paths).toContain('README.md');
    expect(paths.some((p) => p.startsWith('responses/RESPONSE-R1'))).toBe(true);
    expect(entries.find((e) => e.path.startsWith('responses/'))!.content).toContain('We comply with SAM.');
    expect(entries.find((e) => e.path === 'README.md')!.content).toContain('ASSEMBLED, not submitted'); // exported ≠ submitted
  });
});

describe('buildOutcomeCandidates — born PRIVATE, for won AND lost, non-fabricating', () => {
  it('won produces a private case-study candidate (published:false) + a suggested service capability, counting only approved', () => {
    const c = buildOutcomeCandidates('TxDOT', 'won', 'good debrief', [slot('R1', 'approved'), slot('R2', 'draft')], '2026-10-08T00:00:00Z');
    expect(c.caseStudyCandidate.status).toBe('candidate');
    expect(c.caseStudyCandidate.visibility).toBe('private');
    expect(c.caseStudyCandidate.published).toBe(false);
    expect(c.caseStudyCandidate.approvedResponseCount).toBe(1); // only R1 — the count is real, not fabricated
    expect(c.caseStudyCandidate.requirementCount).toBe(2);
    expect(c.serviceCapabilityCandidate.state).toBe('suggested');
  });

  it('lost ALSO produces candidates (a lost bid still built a reusable solution)', () => {
    const c = buildOutcomeCandidates('TxDOT', 'lost', null, [slot('R1', 'approved')], '2026-10-08T00:00:00Z');
    expect(c.caseStudyCandidate.outcome).toBe('lost');
    expect(c.caseStudyCandidate.published).toBe(false);
    expect(c.serviceCapabilityCandidate.fromOutcome).toBe('lost');
  });
});
