import { Op } from 'sequelize';

/**
 * T411 - the journey dimension: two reads for the whole population (never per
 * lead, never per node), the latest classification and newest profile winning,
 * a lead with no rows absent from the map (so its `journey` is `null` and it is
 * KEPT in the graph), a missing table degrading to no journeys, and the filter
 * predicate's exact semantics.
 */

const classificationFindAll = jest.fn();
const profileFindAll = jest.fn();
jest.mock('../../../models', () => ({
  GrowthJourneyClassification: { findAll: (...a: unknown[]) => classificationFindAll(...a) },
  GrowthJourneyProfile: { findAll: (...a: unknown[]) => profileFindAll(...a) },
}));

import { hasJourneyScope, journeyMatches, loadLeadJourneyMap, NO_JOURNEYS, type LeadJourneyFacts } from '../campaignJourneyDimension';

const D = (s: string) => new Date(s);
const BRAND = { ent: 'b-ent', cpn: 'b-cpn' };
const facts = (over: Partial<LeadJourneyFacts> = {}): LeadJourneyFacts => ({ program_slug: 'business-growth', path_slug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS', brand_id: BRAND.ent, classified_at: D('2026-09-01T00:00:00Z'), ...over });

beforeEach(() => {
  classificationFindAll.mockReset().mockResolvedValue([]);
  profileFindAll.mockReset().mockResolvedValue([]);
});

describe('the read', () => {
  it('is TWO queries for the whole population, both bounded by the lead ids and ordered newest-first per lead', async () => {
    await loadLeadJourneyMap([501, 502, 503]);
    expect(classificationFindAll).toHaveBeenCalledTimes(1);
    expect(profileFindAll).toHaveBeenCalledTimes(1);
    expect(classificationFindAll).toHaveBeenCalledWith({
      attributes: ['lead_id', 'brand_id', 'journey_program_slug', 'primary_path', 'created_at'],
      where: { lead_id: { [Op.in]: [501, 502, 503] } },
      order: [['lead_id', 'ASC'], ['created_at', 'DESC']],
      raw: true,
    });
    expect(profileFindAll).toHaveBeenCalledWith({
      attributes: ['lead_id', 'brand_id', 'state', 'state_entered_at', 'updated_at'],
      where: { lead_id: { [Op.in]: [501, 502, 503] } },
      order: [['lead_id', 'ASC'], ['updated_at', 'DESC']],
      raw: true,
    });
  });

  it('an empty population reads nothing at all', async () => {
    expect(await loadLeadJourneyMap([])).toBe(NO_JOURNEYS);
    expect(classificationFindAll).not.toHaveBeenCalled();
    expect(profileFindAll).not.toHaveBeenCalled();
  });

  it('the LATEST classification per lead wins - an override supersedes the row it replaced - and the newest profile supplies the state', async () => {
    classificationFindAll.mockResolvedValue([
      { lead_id: 501, brand_id: BRAND.ent, journey_program_slug: 'business-growth', primary_path: 'workflow_automation', created_at: D('2026-09-10T00:00:00Z') },
      { lead_id: 501, brand_id: BRAND.ent, journey_program_slug: 'business-growth', primary_path: 'business_training', created_at: D('2026-08-01T00:00:00Z') },
      { lead_id: 502, brand_id: BRAND.cpn, journey_program_slug: 'cpn-scholars', primary_path: 'learner_free_training', created_at: D('2026-09-02T00:00:00Z') },
    ]);
    profileFindAll.mockResolvedValue([
      { lead_id: 501, brand_id: BRAND.ent, state: 'EXPLORING_SOLUTIONS', state_entered_at: D('2026-09-11T00:00:00Z'), updated_at: D('2026-09-11T00:00:00Z') },
      { lead_id: 501, brand_id: BRAND.ent, state: 'PROBLEM_IDENTIFIED', state_entered_at: D('2026-08-02T00:00:00Z'), updated_at: D('2026-08-02T00:00:00Z') },
    ]);
    const map = await loadLeadJourneyMap([501, 502]);
    expect(map.get(501)).toEqual({ program_slug: 'business-growth', path_slug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS', brand_id: BRAND.ent, classified_at: D('2026-09-10T00:00:00Z') });
    expect(map.get(502)).toEqual({ program_slug: 'cpn-scholars', path_slug: 'learner_free_training', state: null, brand_id: BRAND.cpn, classified_at: D('2026-09-02T00:00:00Z') });
    expect(map.has(503)).toBe(false);
  });

  it('a profile with no classification is still a journey fact (the lifecycle ran, the ladder has not)', async () => {
    profileFindAll.mockResolvedValue([{ lead_id: 777, brand_id: BRAND.ent, state: 'NEW_BUSINESS_LEAD', state_entered_at: D('2026-09-01T00:00:00Z'), updated_at: D('2026-09-01T00:00:00Z') }]);
    const map = await loadLeadJourneyMap([777]);
    expect(map.get(777)).toEqual({ program_slug: null, path_slug: null, state: 'NEW_BUSINESS_LEAD', brand_id: BRAND.ent, classified_at: null });
  });

  it('a read that throws (the tables not deployed yet) is no journeys, never a failed graph', async () => {
    classificationFindAll.mockRejectedValue(Object.assign(new Error('relation "growth_journey_classifications" does not exist'), { name: 'SequelizeDatabaseError' }));
    profileFindAll.mockRejectedValue(new Error('relation does not exist'));
    const map = await loadLeadJourneyMap([501]);
    expect(map.size).toBe(0);
  });

  it('a classification with a null programme keeps the row: the path and the state are still facts', async () => {
    classificationFindAll.mockResolvedValue([{ lead_id: 501, brand_id: BRAND.ent, journey_program_slug: null, primary_path: null, created_at: D('2026-09-01T00:00:00Z') }]);
    const map = await loadLeadJourneyMap([501]);
    expect(map.get(501)).toMatchObject({ program_slug: null, path_slug: null, brand_id: BRAND.ent });
  });
});

describe('the predicate', () => {
  it('no term is no filter', () => {
    expect(hasJourneyScope(undefined)).toBe(false);
    expect(hasJourneyScope(null)).toBe(false);
    expect(hasJourneyScope({})).toBe(false);
    expect(hasJourneyScope({ programSlug: 'business-growth' })).toBe(true);
    expect(hasJourneyScope({ state: 'EXPLORING_SOLUTIONS' })).toBe(true);
    expect(hasJourneyScope({ pathSlug: 'workflow_automation' })).toBe(true);
  });

  it('every term supplied must match; a term not supplied is not checked', () => {
    expect(journeyMatches(facts(), { programSlug: 'business-growth' })).toBe(true);
    expect(journeyMatches(facts(), { programSlug: 'cpn-scholars' })).toBe(false);
    expect(journeyMatches(facts(), { programSlug: 'business-growth', pathSlug: 'workflow_automation', state: 'EXPLORING_SOLUTIONS' })).toBe(true);
    expect(journeyMatches(facts(), { programSlug: 'business-growth', pathSlug: 'business_training' })).toBe(false);
    expect(journeyMatches(facts({ state: 'PROPOSAL_SENT' }), { programSlug: 'business-growth', state: 'EXPLORING_SOLUTIONS' })).toBe(false);
  });

  it('an unclassified lead matches NO term - it belongs to the unfiltered population, never to a journey cohort', () => {
    expect(journeyMatches(null, { programSlug: 'business-growth' })).toBe(false);
    expect(journeyMatches(null, { state: 'EXPLORING_SOLUTIONS' })).toBe(false);
    // And a lead whose journey has no programme is not on a programme.
    expect(journeyMatches(facts({ program_slug: null }), { programSlug: 'business-growth' })).toBe(false);
    expect(journeyMatches(facts({ state: null }), { state: 'EXPLORING_SOLUTIONS' })).toBe(false);
  });
});
