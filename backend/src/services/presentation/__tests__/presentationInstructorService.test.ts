jest.mock('../../settingsService', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));
jest.mock('../../../models/PresentationAssignment', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

import { getSetting, setSetting } from '../../settingsService';
import PresentationAssignment from '../../../models/PresentationAssignment';
import {
  getCohortRequiredTemplate,
  setCohortRequiredTemplate,
  listTemplatesForInstructor,
  cohortReadiness,
} from '../presentationInstructorService';

const mockGet = getSetting as unknown as jest.Mock;
const mockSet = setSetting as unknown as jest.Mock;
const mockFindAll = (PresentationAssignment as unknown as { findAll: jest.Mock }).findAll;

const COHORT = '1f1d86f4-6da5-4767-a250-cd8310570bea';

beforeEach(() => { jest.clearAllMocks(); mockGet.mockResolvedValue(null); });

describe('instructor controls — the cohort required template', () => {
  it('falls back to the programme default when nothing is configured', async () => {
    const s = await getCohortRequiredTemplate(COHORT);
    expect(s.templateId).toBe('final_showcase');
    expect(s.configured).toBe(false);
  });

  it('returns the instructor\'s choice once set', async () => {
    mockGet.mockResolvedValue('architecture_review');
    const s = await getCohortRequiredTemplate(COHORT);
    expect(s).toEqual({ cohortId: COHORT, templateId: 'architecture_review', configured: true });
  });

  it('a setting naming a retired template falls back but still reports as configured', async () => {
    // The cohort keeps working, AND the instructor view can show that what they
    // chose no longer exists — silently reporting "not configured" would hide it.
    mockGet.mockResolvedValue('template_that_was_removed');
    const s = await getCohortRequiredTemplate(COHORT);
    expect(s.templateId).toBe('final_showcase');
    expect(s.configured).toBe(true);
  });

  it('refuses to store a template that does not exist', async () => {
    // Storing it would leave the whole cohort defaulting somewhere nobody chose.
    const r = await setCohortRequiredTemplate(COHORT, 'not_a_template');
    expect(r).toEqual({ ok: false, reason: 'unknown_template' });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('stores a valid template under a per-cohort key, so one cohort cannot affect another', async () => {
    const r = await setCohortRequiredTemplate(COHORT, 'working_system_demo');
    expect(r.ok).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(`presentation_required_template:${COHORT}`, 'working_system_demo');
    // The key is namespaced by cohort id — there is no global write path here at all.
    expect(mockSet.mock.calls[0][0]).toContain(COHORT);
  });

  it('offers every shipped template, flagging the prominent ones', () => {
    const list = listTemplatesForInstructor();
    expect(list).toHaveLength(7);
    expect(list.filter((t) => t.prominent)).toHaveLength(4);
    expect(list[0]).toHaveProperty('structure');
  });
});

describe('instructor controls — cohort readiness', () => {
  it('reports counts derived from persisted answers, not from intent', async () => {
    // "Opened the page" is not progress. Every number here comes from a stored
    // server-derived prep_state or a stored audience.
    mockFindAll.mockResolvedValue([
      { project_id: 'p1', story_id: 'PREP-3', enrollment_id: 'e1', template_slug: 'ai_visual_presentation', prep_state: 'ready', audience: 'Hiring managers' },
      { project_id: 'p2', story_id: 'PREP-3', enrollment_id: 'e2', template_slug: 'ai_visual_presentation', prep_state: 'preparing', audience: '   ' },
      { project_id: 'p3', story_id: 'PREP-3', enrollment_id: 'e3', template_slug: 'ai_visual_presentation', prep_state: 'not_started', audience: null },
    ]);
    const rows = await cohortReadiness(COHORT);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.prepState === 'ready')).toHaveLength(1);
    // Whitespace is not an audience.
    expect(rows.filter((r) => r.hasAudience)).toHaveLength(1);
  });

  it('scopes the query to the cohort', async () => {
    mockFindAll.mockResolvedValue([]);
    await cohortReadiness(COHORT);
    expect(mockFindAll.mock.calls[0][0].where).toEqual({ cohort_id: COHORT });
  });

  it('boundary: a cohort with no assignments reports zero, not an error', async () => {
    mockFindAll.mockResolvedValue([]);
    await expect(cohortReadiness(COHORT)).resolves.toEqual([]);
  });
});
