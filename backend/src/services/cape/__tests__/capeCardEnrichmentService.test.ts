import { enrichCard } from '../capeCardEnrichmentService';
import { resolveSkillMapping } from '../capeCurriculumSkillMapService';
import { getLearnerSkillProfile } from '../capeProficiencyService';

jest.mock('../capeCurriculumSkillMapService', () => ({ resolveSkillMapping: jest.fn() }));
jest.mock('../capeProficiencyService', () => ({ getLearnerSkillProfile: jest.fn() }));

const mockResolve = resolveSkillMapping as unknown as jest.Mock;
const mockProfile = getLearnerSkillProfile as unknown as jest.Mock;

function contract(overrides: Record<string, any> = {}) {
  return {
    skill_impacts: [{ skill_id: 'agents_mcp', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }],
    prerequisite_skills: [], recommended_range: { min: 20, max: 60 }, freshness_days: null, reviewable: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('enrichCard — ranker-ON path (Phase 4)', () => {
  it('uses reasons[0] verbatim for why_this when a capeExplanation is supplied', async () => {
    mockResolve.mockResolvedValue({ contract: contract(), source: 'type_default', map_id: 'm1', version: 1 });
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 30 }], overall_placement: 0, overall_proficiency: 30, weights_version: 1 });

    const chips = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 }, { reasons: ['Builds your Agents & MCP gap'] });
    expect(chips.why_this).toBe('Builds your Agents & MCP gap');
    expect(chips.proof).toBe('Build'); // still derived from the real mapping, not the ranker
  });
});

describe('enrichCard — ranker-OFF fallback path (Phase 4 confirmed off in prod)', () => {
  it('derives why_this from a type_default resolved mapping', async () => {
    mockResolve.mockResolvedValue({ contract: contract(), source: 'type_default', map_id: 'm1', version: 1 });
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 30 }], overall_placement: 0, overall_proficiency: 30, weights_version: 1 });

    const chips = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(chips.why_this).toBe('Builds your Agents Mcp skill');
  });

  it('derives a card_override-specific why_this phrasing', async () => {
    mockResolve.mockResolvedValue({ contract: contract(), source: 'card_override', map_id: 'm2', version: 1 });
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 30 }], overall_placement: 0, overall_proficiency: 30, weights_version: 1 });

    const chips = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(chips.why_this).toMatch(/^Matches this card's/);
  });

  it('level: below recommended_range.min -> Foundation', async () => {
    mockResolve.mockResolvedValue({ contract: contract({ recommended_range: { min: 40, max: 60 } }), source: 'type_default', map_id: 'm1', version: 1 });
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 10 }], overall_placement: 0, overall_proficiency: 10, weights_version: 1 });
    const chips = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(chips.level).toBe('Foundation');
  });

  it('level: within recommended_range -> Working', async () => {
    mockResolve.mockResolvedValue({ contract: contract({ recommended_range: { min: 20, max: 60 } }), source: 'type_default', map_id: 'm1', version: 1 });
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 40 }], overall_placement: 0, overall_proficiency: 40, weights_version: 1 });
    const chips = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(chips.level).toBe('Working');
  });

  it('level: up to 20 above max -> Stretch, further above -> Architect', async () => {
    mockResolve.mockResolvedValue({ contract: contract({ recommended_range: { min: 20, max: 60 } }), source: 'type_default', map_id: 'm1', version: 1 });
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 75 }], overall_placement: 0, overall_proficiency: 75, weights_version: 1 });
    const stretch = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(stretch.level).toBe('Stretch');

    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 95 }], overall_placement: 0, overall_proficiency: 95, weights_version: 1 });
    const architect = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(architect.level).toBe('Architect');
  });

  it('proof: application band -> Build; judgment (no application) -> Decide; knowledge + ai_evaluation type -> Check; knowledge, no ai_evaluation -> Learn', async () => {
    mockProfile.mockResolvedValue({ skills: [{ skill_id: 'agents_mcp', placement: 0, proficiency: 30 }], overall_placement: 0, overall_proficiency: 30, weights_version: 1 });

    mockResolve.mockResolvedValue({ contract: contract({ skill_impacts: [{ skill_id: 'agents_mcp', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }] }), source: 'type_default', map_id: 'm1', version: 1 });
    expect((await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 })).proof).toBe('Build');

    mockResolve.mockResolvedValue({ contract: contract({ skill_impacts: [{ skill_id: 'agents_mcp', weight: 1, bands: ['judgment'], credit_strength: 'high', evidence_required: true, max_credit: 20 }] }), source: 'type_default', map_id: 'm1', version: 1 });
    expect((await enrichCard('enr-1', { card_id: 'c1', type: 'reflection', week: 5 })).proof).toBe('Decide');

    mockResolve.mockResolvedValue({ contract: contract({ skill_impacts: [{ skill_id: 'agents_mcp', weight: 1, bands: ['knowledge'], credit_strength: 'medium', evidence_required: true, max_credit: 10 }] }), source: 'type_default', map_id: 'm1', version: 1 });
    expect((await enrichCard('enr-1', { card_id: 'c1', type: 'knowledge_check', week: 5 })).proof).toBe('Check'); // knowledge_check has ai_evaluation:true

    mockResolve.mockResolvedValue({ contract: contract({ skill_impacts: [{ skill_id: 'agents_mcp', weight: 1, bands: ['knowledge'], credit_strength: 'low', evidence_required: false, max_credit: 5 }] }), source: 'type_default', map_id: 'm1', version: 1 });
    expect((await enrichCard('enr-1', { card_id: 'c1', type: 'deep_dive', week: 5 })).proof).toBe('Learn'); // deep_dive has no ai_evaluation
  });
});

describe('enrichCard — boundary: source:none (no resolved mapping at all)', () => {
  it('returns safe neutral chips, never throws', async () => {
    mockResolve.mockResolvedValue({ contract: { skill_impacts: [], prerequisite_skills: [], recommended_range: { min: 0, max: 0 }, freshness_days: null, reviewable: true }, source: 'none', map_id: null, version: null });

    const chips = await enrichCard('enr-1', { card_id: null, type: 'ai_news_flash', week: null });
    expect(chips.level).toBe('Working');
    expect(chips.proof).toBe('Learn');
    expect(chips.why_this).toBe('Current AI update');
    expect(mockProfile).not.toHaveBeenCalled(); // no impact -> no need to fetch the profile at all
  });

  it('a resolveSkillMapping rejection also degrades safely instead of throwing', async () => {
    mockResolve.mockRejectedValue(new Error('db down'));
    await expect(enrichCard('enr-1', { card_id: 'c1', type: 'blog', week: null })).resolves.toEqual({
      why_this: 'Current AI update', level: 'Working', proof: 'Learn',
    });
  });

  it('a getLearnerSkillProfile rejection (when an impact DOES exist) still returns a safe level, never throws', async () => {
    mockResolve.mockResolvedValue({ contract: contract(), source: 'type_default', map_id: 'm1', version: 1 });
    mockProfile.mockRejectedValue(new Error('profile read failed'));

    const chips = await enrichCard('enr-1', { card_id: 'c1', type: 'prompt_lab', week: 5 });
    expect(chips.level).toBe('Foundation'); // placement=proficiency=0 stays below recommended_range.min=20
  });
});
