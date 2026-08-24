import { computeReadiness, DEFAULT_POLICY, type PortfolioReadinessPolicy } from '../careerReadiness';
import type {
  CareerIdentity, CareerCapability, CareerArtifact, CareerProject, CareerGithub,
} from '../careerEvidenceAdapters';

/**
 * careerReadiness is pure — no mocks needed, which is the point: a readiness
 * number a student sees must be reproducible from its inputs, never something a
 * model produced.
 */

const identity = (over: Partial<CareerIdentity> = {}): CareerIdentity => ({
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  title: 'AI Systems Architect',
  company: 'Acme',
  linkedin_url: 'https://linkedin.com/in/janedoe',
  avatar_data_url: null,
  cohort_name: 'Fall 2026',
  member_since: '2026-01-01T00:00:00.000Z',
  resume: { file_name: 'jane.pdf', uploaded_at: '2026-02-01T00:00:00.000Z' },
  ...over,
});

const cap = (over: Partial<CareerCapability> = {}): CareerCapability => ({
  skill_id: 'agents_mcp',
  name: 'Agent Architecture',
  evidence_level: 'colaberry_verified',
  proficiency: 60,
  confidence: 0.7,
  bands: { claim: 0, knowledge: 20, application: 30, judgment: 10 },
  evidence_count: 4,
  last_demonstrated_at: '2026-08-20T00:00:00.000Z',
  source_breakdown: { timeline: 4 },
  ...over,
});

const artifact = (i: number): CareerArtifact => ({
  id: `a${i}`, kind: 'case_study', title: `Artifact ${i}`, summary: null,
  competencies: [], created_at: '2026-08-20T00:00:00.000Z',
});

const project = (i: number): CareerProject => ({
  id: `p${i}`, name: `Project ${i}`, organization_name: null, industry: null,
  business_problem: null, stage: null, github_repo_url: null, maturity_score: null,
  created_at: '2026-05-01T00:00:00.000Z',
});

const github = (repoCount = 1): CareerGithub => ({
  repos: Array.from({ length: repoCount }, (_, i) => ({
    repo_url: `https://github.com/jane/repo${i}`, repo_owner: 'jane', repo_name: `repo${i}`,
    language: 'TypeScript', file_count: 40, last_sync_at: null,
  })),
  activity: null,
});

const full = () => ({
  identity: identity(),
  capabilities: [cap({ skill_id: 'a' }), cap({ skill_id: 'b' }), cap({ skill_id: 'c' })],
  artifacts: [artifact(1), artifact(2), artifact(3)],
  projects: [project(1)],
  github: github(1),
});

const empty = () => ({
  identity: identity({ title: null, linkedin_url: null, resume: null }),
  capabilities: [] as CareerCapability[],
  artifacts: [] as CareerArtifact[],
  projects: [] as CareerProject[],
  github: { repos: [], activity: null } as CareerGithub,
});

describe('computeReadiness', () => {
  it('scores a complete portfolio at 100 and clears the policy', () => {
    const r = computeReadiness(full());
    expect(r.score).toBe(100);
    expect(r.blocking).toEqual([]);
    expect(r.meets_policy).toBe(true);
    expect(r.met_count).toBe(r.total_count);
  });

  it('blocks on every required item for an empty portfolio', () => {
    const r = computeReadiness(empty());
    expect(r.blocking).toEqual(
      expect.arrayContaining(['resume_uploaded', 'verified_capabilities', 'artifacts']),
    );
    expect(r.meets_policy).toBe(false);
    expect(r.score).toBeLessThan(DEFAULT_POLICY.publish_threshold);
  });

  it('never counts resume-level capabilities toward the verified requirement', () => {
    // The whole point of the three-level model: a resume claim is not proof.
    const r = computeReadiness({
      ...full(),
      capabilities: [
        cap({ skill_id: 'a', evidence_level: 'resume', bands: { claim: 40, knowledge: 0, application: 0, judgment: 0 } }),
        cap({ skill_id: 'b', evidence_level: 'resume', bands: { claim: 40, knowledge: 0, application: 0, judgment: 0 } }),
        cap({ skill_id: 'c', evidence_level: 'resume', bands: { claim: 40, knowledge: 0, application: 0, judgment: 0 } }),
      ],
    });
    expect(r.blocking).toContain('verified_capabilities');
    expect(r.meets_policy).toBe(false);
  });

  it('counts delivery-verified capabilities toward the verified requirement', () => {
    const r = computeReadiness({
      ...full(),
      capabilities: [
        cap({ skill_id: 'a', evidence_level: 'delivery_verified' }),
        cap({ skill_id: 'b', evidence_level: 'delivery_verified' }),
        cap({ skill_id: 'c', evidence_level: 'delivery_verified' }),
      ],
    });
    expect(r.blocking).not.toContain('verified_capabilities');
  });

  describe('boundaries', () => {
    it('is met exactly at the threshold and unmet one below', () => {
      const atMin = computeReadiness({
        ...full(),
        artifacts: [artifact(1), artifact(2), artifact(3)], // exactly min_artifacts = 3
      });
      expect(atMin.blocking).not.toContain('artifacts');

      const belowMin = computeReadiness({
        ...full(),
        artifacts: [artifact(1), artifact(2)], // one short
      });
      expect(belowMin.blocking).toContain('artifacts');
    });

    it('treats a whitespace-only name as missing', () => {
      const r = computeReadiness({ ...full(), identity: identity({ full_name: '   ' }) });
      expect(r.blocking).toContain('identity_name');
    });
  });

  it('honours a custom policy rather than a hardcoded threshold', () => {
    const strict: PortfolioReadinessPolicy = {
      min_verified_capabilities: 10,
      min_artifacts: 10,
      min_projects: 5,
      publish_threshold: 95,
    };
    const r = computeReadiness(full(), strict);
    expect(r.meets_policy).toBe(false);
    expect(r.blocking).toEqual(expect.arrayContaining(['verified_capabilities', 'artifacts']));
    // The label reflects the policy, so the UI can never show a stale bar.
    expect(r.requirements.find((x) => x.key === 'artifacts')!.label).toContain('10');
  });

  it('reports observed values in `detail`, never targets', () => {
    const r = computeReadiness({ ...full(), projects: [project(1), project(2)] });
    expect(r.requirements.find((x) => x.key === 'projects')!.detail).toBe('2 projects');
  });

  it('is deterministic — identical input yields an identical result', () => {
    const input = full();
    expect(computeReadiness(input)).toEqual(computeReadiness(input));
  });
});

describe('iso timestamp normalisation (careerEvidenceAdapters)', () => {
  // Guards the lexicographic comparison in computeRecentActivity: every
  // timestamp the adapters emit must be one canonical ISO-8601 UTC format,
  // whatever shape the driver handed back.
  const { __isoForTest } = jest.requireActual('../careerEvidenceAdapters');

  it('normalises a Postgres-style timestamp string to ISO-8601 UTC', () => {
    expect(__isoForTest('2026-08-20 12:00:00+00')).toBe('2026-08-20T12:00:00.000Z');
  });

  it('passes a Date through as ISO-8601 UTC', () => {
    expect(__isoForTest(new Date('2026-08-20T12:00:00.000Z'))).toBe('2026-08-20T12:00:00.000Z');
  });

  it('returns null for unparseable or absent values rather than throwing', () => {
    expect(__isoForTest('not a date')).toBeNull();
    expect(__isoForTest(new Date('nonsense'))).toBeNull();
    expect(__isoForTest(null)).toBeNull();
    expect(__isoForTest(undefined)).toBeNull();
    expect(__isoForTest(12345)).toBeNull();
  });

  it('orders normalised mixed-format timestamps correctly under string compare', () => {
    const a = __isoForTest('2026-08-20 12:00:00+00')!;
    const b = __isoForTest(new Date('2026-08-21T00:00:00.000Z'))!;
    expect(a < b).toBe(true);
  });
});
