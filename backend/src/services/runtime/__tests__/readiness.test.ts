import { computeEmploymentReadiness } from '../employmentReadiness';
import { computeCertificationReadiness } from '../certificationReadiness';
import { StudentSignals } from '../readinessTypes';

const strong: StudentSignals = {
  competencies: [
    { domain_id: 'prompt_engineering', confidence: 0.9, evidence_count: 4 },
    { domain_id: 'architecture', confidence: 0.85, evidence_count: 3 },
    { domain_id: 'context_engineering', confidence: 0.8, evidence_count: 3 },
    { domain_id: 'testing', confidence: 0.8, evidence_count: 2 },
    { domain_id: 'deployment', confidence: 0.75, evidence_count: 2 },
    { domain_id: 'github', confidence: 0.8, evidence_count: 3 },
    { domain_id: 'documentation', confidence: 0.7, evidence_count: 2 },
    { domain_id: 'communication', confidence: 0.7, evidence_count: 2 },
    { domain_id: 'security', confidence: 0.6, evidence_count: 1 },
    { domain_id: 'leadership', confidence: 0.6, evidence_count: 1 },
  ],
  github: { commits: 12, prs: 3, repos: 2 },
  portfolio: { entries: 4, artifacts: 2 },
  xp: { learning: 120, builder: 300, community: 40 },
};
const beginner: StudentSignals = { competencies: [], github: { commits: 0, prs: 0, repos: 0 }, portfolio: { entries: 0, artifacts: 0 }, xp: { learning: 0, builder: 0, community: 0 } };

describe('computeEmploymentReadiness', () => {
  it('rates a strong student competitive/market-ready and lists few gaps', () => {
    const r = computeEmploymentReadiness(strong);
    expect(r.overall).toBeGreaterThan(55);
    expect(['competitive', 'market-ready']).toContain(r.band);
    expect(r.skills.find((s) => s.key === 'prompt_engineering')!.score).toBeGreaterThanOrEqual(85);
    expect(r.skills.find((s) => s.key === 'github_quality')!.score).toBeGreaterThan(50);
  });
  it('rates a beginner emerging and surfaces concrete employer needs', () => {
    const r = computeEmploymentReadiness(beginner);
    expect(r.band).toBe('emerging');
    expect(r.overall).toBeLessThan(35);
    expect(r.employer_gaps.length).toBeGreaterThan(0);
    expect(r.employer_gaps[0].need).toBeTruthy();
  });
});

describe('computeCertificationReadiness', () => {
  it('maps competencies to Anthropic domains with a pass probability', () => {
    const r = computeCertificationReadiness(strong);
    expect(r.domains.length).toBe(6);
    expect(r.pass_probability).toBeGreaterThan(0.5);
    expect(r.strong).toContain('Prompt Engineering');
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
  it('flags weak domains + recommends next activities for a beginner', () => {
    const r = computeCertificationReadiness(beginner);
    expect(r.pass_probability).toBeLessThan(0.3);
    expect(r.weak.length).toBeGreaterThan(0);
    expect(r.next_activities.length).toBeGreaterThan(0);
    expect(r.next_activities).toContain('prompt_lab');
  });
});
