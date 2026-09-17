const mockStudentSignals = jest.fn();
jest.mock('../../runtime/runtimeService', () => ({ studentSignals: (...a: any[]) => mockStudentSignals(...a) }));

import { evaluateCertificationRiskSignal } from '../daraSignalService';

const ENROLLMENT_ID = 'enrollment-1';

// Minimal real StudentSignals shape computeCertificationReadiness() actually reads:
// s.competencies[].{domain_id, confidence}, s.github.commits, s.portfolio.entries.
function signals(overrides: { competencies?: Array<{ domain_id: string; confidence: number }>; commits?: number; entries?: number } = {}) {
  return {
    competencies: overrides.competencies ?? [],
    github: { commits: overrides.commits ?? 0 },
    portfolio: { entries: overrides.entries ?? 0 },
  } as any;
}

// All 6 domains strong (confidence 0.9) -> high pass_probability, no weak domains.
const STRONG_COMPETENCIES = [
  { domain_id: 'prompt_engineering', confidence: 0.9 },
  { domain_id: 'context_engineering', confidence: 0.9 },
  { domain_id: 'architecture', confidence: 0.9 },
  { domain_id: 'deployment', confidence: 0.9 },
  { domain_id: 'testing', confidence: 0.9 },
  { domain_id: 'security', confidence: 0.9 },
  { domain_id: 'documentation', confidence: 0.9 },
];

// All weak (confidence 0.1) -> low pass_probability, real weak domains.
const WEAK_COMPETENCIES = STRONG_COMPETENCIES.map((c) => ({ ...c, confidence: 0.1 }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('evaluateCertificationRiskSignal', () => {
  it('happy path: a genuinely at-risk student (low pass probability, real weak domains) produces a signal', async () => {
    mockStudentSignals.mockResolvedValue(signals({ competencies: WEAK_COMPETENCIES }));

    const result = await evaluateCertificationRiskSignal(ENROLLMENT_ID);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('certification_readiness_risk');
    expect(result!.passProbability).toBeLessThan(0.55);
    expect(result!.weakDomains.length).toBeGreaterThan(0);
  });

  it('boundary: a strong student (high pass probability) produces no signal — never a false flag', async () => {
    mockStudentSignals.mockResolvedValue(signals({ competencies: STRONG_COMPETENCIES }));

    const result = await evaluateCertificationRiskSignal(ENROLLMENT_ID);

    expect(result).toBeNull();
  });

  it('boundary: below threshold but genuinely no weak domain to name -> no signal (not actionable, never sent)', async () => {
    // Every real competency id DOMAIN_MAP references (including 'github', which
    // only 'Deployment & Ops' uses and STRONG/WEAK fixtures above omit) set to
    // 0.5 -> every domain lands 'developing' (0.4-0.69), never 'weak' (<0.4) —
    // a real shape where pass_probability lands under 0.55 with zero weak domains.
    const developing = [
      { domain_id: 'prompt_engineering', confidence: 0.5 },
      { domain_id: 'context_engineering', confidence: 0.5 },
      { domain_id: 'architecture', confidence: 0.5 },
      { domain_id: 'deployment', confidence: 0.5 },
      { domain_id: 'testing', confidence: 0.5 },
      { domain_id: 'security', confidence: 0.5 },
      { domain_id: 'documentation', confidence: 0.5 },
      { domain_id: 'github', confidence: 0.5 },
    ];
    mockStudentSignals.mockResolvedValue(signals({ competencies: developing }));

    const result = await evaluateCertificationRiskSignal(ENROLLMENT_ID);

    expect(result).toBeNull();
  });

  it('reads the real, current studentSignals() for the given enrollment id — never a different student\'s data', async () => {
    mockStudentSignals.mockResolvedValue(signals({ competencies: WEAK_COMPETENCIES }));

    await evaluateCertificationRiskSignal(ENROLLMENT_ID);

    expect(mockStudentSignals).toHaveBeenCalledWith(ENROLLMENT_ID);
  });
});
