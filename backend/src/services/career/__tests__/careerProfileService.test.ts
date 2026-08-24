import * as adapters from '../careerEvidenceAdapters';
import { getCareerProfile, composeNarrative, computeRecentActivity } from '../careerProfileService';
import type { CareerIdentity, CareerCapability, CareerArtifact } from '../careerEvidenceAdapters';

jest.mock('../careerEvidenceAdapters', () => {
  const actual = jest.requireActual('../careerEvidenceAdapters');
  return {
    __esModule: true,
    // deriveEvidenceLevel is pure and tested for real, not mocked.
    deriveEvidenceLevel: actual.deriveEvidenceLevel,
    identityAdapter: jest.fn(),
    skillAdapter: jest.fn(),
    artifactAdapter: jest.fn(),
    projectAdapter: jest.fn(),
    githubAdapter: jest.fn(),
    deliveryAdapter: jest.fn(),
  };
});

const identityAdapter = adapters.identityAdapter as unknown as jest.Mock;
const skillAdapter = adapters.skillAdapter as unknown as jest.Mock;
const artifactAdapter = adapters.artifactAdapter as unknown as jest.Mock;
const projectAdapter = adapters.projectAdapter as unknown as jest.Mock;
const githubAdapter = adapters.githubAdapter as unknown as jest.Mock;
const deliveryAdapter = adapters.deliveryAdapter as unknown as jest.Mock;

const IDENTITY: CareerIdentity = {
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  title: 'AI Systems Architect',
  company: 'Acme',
  linkedin_url: null,
  avatar_data_url: null,
  cohort_name: 'Fall 2026',
  member_since: '2026-01-01T00:00:00.000Z',
  resume: { file_name: 'jane.pdf', uploaded_at: '2026-02-01T00:00:00.000Z' },
};

const CAP: CareerCapability = {
  skill_id: 'agents_mcp',
  name: 'Agent Architecture',
  evidence_level: 'colaberry_verified',
  proficiency: 62,
  confidence: 0.6,
  bands: { claim: 0, knowledge: 20, application: 30, judgment: 12 },
  evidence_count: 3,
  last_demonstrated_at: '2026-08-20T00:00:00.000Z',
  source_breakdown: { timeline: 3 },
};

const ART: CareerArtifact = {
  id: 'a1', kind: 'case_study', title: 'Claims triage agent', summary: 'A summary',
  competencies: ['agents_mcp'], created_at: '2026-08-21T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  identityAdapter.mockResolvedValue(IDENTITY);
  skillAdapter.mockResolvedValue([CAP]);
  artifactAdapter.mockResolvedValue([ART]);
  projectAdapter.mockResolvedValue([]);
  githubAdapter.mockResolvedValue({ repos: [], activity: null });
  deliveryAdapter.mockResolvedValue([]);
});

describe('getCareerProfile — Gate 1 access state machine', () => {
  it('returns state "ready" with evidence when a resume is on file', async () => {
    const p = await getCareerProfile('e1');
    expect(p.state).toBe('ready');
    expect(p.capabilities).toHaveLength(1);
    expect(p.readiness).not.toBeNull();
    expect(p.visibility).toBe('private');
  });

  it('SECURITY: a paid learner without a resume gets NO career evidence at all', async () => {
    identityAdapter.mockResolvedValue({ ...IDENTITY, resume: null });

    const p = await getCareerProfile('e1');

    expect(p.state).toBe('needs_resume');
    expect(p.capabilities).toEqual([]);
    expect(p.artifacts).toEqual([]);
    expect(p.projects).toEqual([]);
    expect(p.github).toBeNull();
    expect(p.readiness).toBeNull();
    expect(p.narrative).toBeNull();

    // The prerequisite must be a real boundary, not a hidden UI section: the
    // evidence adapters are never even called.
    expect(skillAdapter).not.toHaveBeenCalled();
    expect(artifactAdapter).not.toHaveBeenCalled();
    expect(projectAdapter).not.toHaveBeenCalled();
    expect(githubAdapter).not.toHaveBeenCalled();
  });

  it('404s when the enrollment has no profile', async () => {
    identityAdapter.mockResolvedValue(null);
    await expect(getCareerProfile('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('never reports itself as published', async () => {
    const p = await getCareerProfile('e1');
    expect(p.publication.status).toBe('not_published');
  });

  it('never projects resume file CONTENT, only presence and filename', async () => {
    const p = await getCareerProfile('e1');
    expect(p.identity!.resume).toEqual({ file_name: 'jane.pdf', uploaded_at: expect.any(String) });
    expect(JSON.stringify(p)).not.toContain('resume_data');
  });
});

describe('getCareerProfile — failure-first', () => {
  it('degrades one failing section instead of failing the page', async () => {
    skillAdapter.mockRejectedValue(Object.assign(new Error('db down'), { name: 'SequelizeConnectionError' }));

    const p = await getCareerProfile('e1');

    expect(p.state).toBe('ready');
    expect(p.capabilities).toEqual([]);
    expect(p.degraded).toContain('capabilities');
    // The rest of the page still rendered.
    expect(p.artifacts).toHaveLength(1);
  });

  it('surfaces every failing section, and none when healthy', async () => {
    githubAdapter.mockRejectedValue(new Error('gh down'));
    projectAdapter.mockRejectedValue(new Error('proj down'));

    const bad = await getCareerProfile('e1');
    expect(bad.degraded.sort()).toEqual(['github', 'projects']);

    jest.clearAllMocks();
    identityAdapter.mockResolvedValue(IDENTITY);
    skillAdapter.mockResolvedValue([CAP]);
    artifactAdapter.mockResolvedValue([ART]);
    projectAdapter.mockResolvedValue([]);
    githubAdapter.mockResolvedValue({ repos: [], activity: null });
    deliveryAdapter.mockResolvedValue([]);

    const good = await getCareerProfile('e1');
    expect(good.degraded).toEqual([]);
  });
});

describe('composeNarrative — AI claim safety (plan §57)', () => {
  it('uses the learner\'s own title and marks its source', () => {
    const n = composeNarrative(IDENTITY, [CAP], [ART], []);
    expect(n.headline).toBe('AI Systems Architect');
    expect(n.headline_source).toBe('profile_title');
  });

  it('does NOT invent a headline when no title is set', () => {
    const n = composeNarrative({ ...IDENTITY, title: null }, [CAP], [ART], []);
    expect(n.headline).toBeNull();
    expect(n.headline_source).toBe('not_set');
  });

  it('never emits seniority or contribution verbs', () => {
    const n = composeNarrative(IDENTITY, [CAP], [ART], []);
    const text = `${n.suggested_about} ${n.facts.join(' ')}`;
    for (const banned of ['Senior', 'Led ', 'Architected', 'Built ', 'Spearheaded', 'Managed ']) {
      expect(text).not.toContain(banned);
    }
  });

  it('never emits a percentage, revenue figure or invented metric', () => {
    const n = composeNarrative(IDENTITY, [CAP], [ART], []);
    expect(n.suggested_about || '').not.toMatch(/\d+\s*%/);
    expect(n.suggested_about || '').not.toMatch(/\$\d/);
  });

  it('states only counts that are true', () => {
    const n = composeNarrative(IDENTITY, [CAP], [ART], []);
    expect(n.facts).toContain('1 Colaberry-verified capability');
    expect(n.facts).toContain('1 build artifact');
    // No projects supplied → no project claim.
    expect(n.facts.join(' ')).not.toContain('project');
  });

  it('produces no summary at all when there is nothing true to say', () => {
    const n = composeNarrative({ ...IDENTITY, title: null }, [], [], []);
    expect(n.suggested_about).toBeNull();
    expect(n.facts).toEqual([]);
  });

  it('excludes resume-level capabilities from the verified count', () => {
    const resumeOnly: CareerCapability = { ...CAP, evidence_level: 'resume' };
    const n = composeNarrative(IDENTITY, [resumeOnly], [ART], []);
    expect(n.facts.join(' ')).not.toContain('Colaberry-verified');
  });
});

describe('computeRecentActivity', () => {
  const NOW = new Date('2026-08-23T12:00:00.000Z');

  it('counts only items inside the window', () => {
    const recent = { ...ART, created_at: '2026-08-21T00:00:00.000Z' };
    const old = { ...ART, id: 'a2', created_at: '2026-07-01T00:00:00.000Z' };
    const r = computeRecentActivity([], [recent, old], NOW);
    expect(r.new_artifacts).toBe(1);
    expect(r.window_days).toBe(7);
  });

  it('handles null timestamps without counting them', () => {
    const undated = { ...ART, created_at: null };
    const r = computeRecentActivity([{ ...CAP, last_demonstrated_at: null }], [undated], NOW);
    expect(r.new_artifacts).toBe(0);
    expect(r.capabilities_advanced).toBe(0);
    expect(r.items).toEqual([]);
  });

  it('returns items newest first and caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...ART, id: `a${i}`, title: `A${i}`,
      created_at: new Date(NOW.getTime() - i * 60_000).toISOString(),
    }));
    const r = computeRecentActivity([], many, NOW);
    expect(r.items).toHaveLength(12);
    expect(r.items[0].label).toBe('A0');
  });
});

describe('deriveEvidenceLevel', () => {
  const { deriveEvidenceLevel } = jest.requireActual('../careerEvidenceAdapters');

  it('is "resume" when only the claim band has credit', () => {
    expect(deriveEvidenceLevel({ claim: 80, knowledge: 0, application: 0, judgment: 0 })).toBe('resume');
  });

  it('is "resume" when there is no evidence at all', () => {
    expect(deriveEvidenceLevel({ claim: 0, knowledge: 0, application: 0, judgment: 0 })).toBe('resume');
  });

  it.each(['knowledge', 'application', 'judgment'])(
    'is "colaberry_verified" when the %s band has credit',
    (band) => {
      const bands = { claim: 0, knowledge: 0, application: 0, judgment: 0, [band]: 5 };
      expect(deriveEvidenceLevel(bands as any)).toBe('colaberry_verified');
    },
  );

  it('a large resume claim never outranks a small verified one', () => {
    expect(deriveEvidenceLevel({ claim: 100, knowledge: 0.1, application: 0, judgment: 0 })).toBe('colaberry_verified');
  });
});
