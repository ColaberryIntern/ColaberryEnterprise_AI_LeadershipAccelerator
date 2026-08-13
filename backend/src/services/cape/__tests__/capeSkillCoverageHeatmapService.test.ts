import CurriculumSkillMap from '../../../models/CurriculumSkillMap';
import { allTypes } from '../../timeline/typeRegistry';
import { listCurrentSkillDefinitions } from '../capeSkillDefinitionsService';
import { getSkillCoverageHeatmap } from '../capeSkillCoverageHeatmapService';
import { ARCHITECTURE_SKILL_IDS } from '../../../constants/architectureSkills';

jest.mock('../../../models/CurriculumSkillMap', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../timeline/typeRegistry', () => ({ allTypes: jest.fn() }));
jest.mock('../capeSkillDefinitionsService', () => ({ listCurrentSkillDefinitions: jest.fn() }));

const findAll = CurriculumSkillMap.findAll as unknown as jest.Mock;
const mockAllTypes = allTypes as unknown as jest.Mock;
const mockListSkillDefs = listCurrentSkillDefinitions as unknown as jest.Mock;

const TYPES = [
  { slug: 'deep_dive', label: 'Deep Dive' },
  { slug: 'prompt_lab', label: 'Prompt Lab' },
  { slug: 'video', label: 'Video' },
];

const SKILL_DEFS = ARCHITECTURE_SKILL_IDS.map((id, i) => ({ skill_id: id, name: id, axis_order: i }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAllTypes.mockReturnValue(TYPES);
  mockListSkillDefs.mockResolvedValue(SKILL_DEFS);
  findAll.mockResolvedValue([]);
});

describe('getSkillCoverageHeatmap', () => {
  it('happy path: matrix dimensions are real type count x 10 skills', async () => {
    const result = await getSkillCoverageHeatmap();
    expect(result.types).toHaveLength(3);
    expect(result.skills).toHaveLength(10);
    expect(result.cells).toHaveLength(3 * 10);
  });

  it('a type with no current type-level mapping row shows source:none for every skill (not omitted)', async () => {
    findAll.mockResolvedValue([]); // no mappings at all
    const result = await getSkillCoverageHeatmap();
    const videoCells = result.cells.filter((c) => c.type_slug === 'video');
    expect(videoCells).toHaveLength(10);
    expect(videoCells.every((c) => c.source === 'none')).toBe(true);
    expect(videoCells.every((c) => c.weight === 0)).toBe(true);
  });

  it('a type with a real mapping surfaces its declared impacts as source:type_default cells, and untouched skills as zero-weight type_default cells', async () => {
    findAll.mockResolvedValue([
      {
        type_slug: 'prompt_lab',
        skill_impacts: [
          { skill_id: 'prompting', weight: 0.6, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 },
          { skill_id: 'llm_core', weight: 0.4, bands: ['knowledge'], credit_strength: 'low', evidence_required: false, max_credit: 5 },
        ],
      },
    ] as any);
    const result = await getSkillCoverageHeatmap();
    const promptCells = result.cells.filter((c) => c.type_slug === 'prompt_lab');
    expect(promptCells).toHaveLength(10);
    const promptingCell = promptCells.find((c) => c.skill_id === 'prompting')!;
    expect(promptingCell).toMatchObject({ weight: 0.6, credit_strength: 'high', source: 'type_default', has_proof_task: true });
    const ragCell = promptCells.find((c) => c.skill_id === 'rag')!; // not in this type's impacts
    expect(ragCell).toMatchObject({ weight: 0, source: 'type_default' });
  });

  it('a cell with only claim/knowledge bands and weight > 0 is flagged as a gap (design doc §12 special warning)', async () => {
    findAll.mockResolvedValue([
      {
        type_slug: 'deep_dive',
        skill_impacts: [
          { skill_id: 'rag', weight: 0.5, bands: ['knowledge'], credit_strength: 'low', evidence_required: false, max_credit: 5 },
        ],
      },
    ] as any);
    const result = await getSkillCoverageHeatmap();
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({ type_slug: 'deep_dive', skill_id: 'rag' });
  });

  it('a cell with knowledge AND application bands is NOT flagged as a gap', async () => {
    findAll.mockResolvedValue([
      {
        type_slug: 'deep_dive',
        skill_impacts: [
          { skill_id: 'rag', weight: 0.5, bands: ['knowledge', 'application'], credit_strength: 'medium', evidence_required: true, max_credit: 15 },
        ],
      },
    ] as any);
    const result = await getSkillCoverageHeatmap();
    expect(result.gaps).toHaveLength(0);
  });

  it('a zero-weight cell (source:none or untouched type_default) is never flagged as a gap even though it has no proof task', async () => {
    findAll.mockResolvedValue([]);
    const result = await getSkillCoverageHeatmap();
    expect(result.gaps).toHaveLength(0);
  });

  it('fail-soft: falls back to the canonical 10 skill ids if listCurrentSkillDefinitions returns empty (Phase 0-1 not yet seeded)', async () => {
    mockListSkillDefs.mockResolvedValue([]);
    const result = await getSkillCoverageHeatmap();
    expect(result.skills).toHaveLength(10);
    expect(result.skills.map((s) => s.skill_id).sort()).toEqual([...ARCHITECTURE_SKILL_IDS].sort());
  });

  it('an impact with an unknown/invalid skill_id is dropped, not crashed on', async () => {
    findAll.mockResolvedValue([
      {
        type_slug: 'prompt_lab',
        skill_impacts: [
          { skill_id: 'not_a_real_skill', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 },
        ],
      },
    ] as any);
    const result = await getSkillCoverageHeatmap();
    const promptCells = result.cells.filter((c) => c.type_slug === 'prompt_lab');
    expect(promptCells).toHaveLength(10); // all 10 real skills, none is the bogus one
    expect(promptCells.every((c) => c.weight === 0)).toBe(true);
  });
});
