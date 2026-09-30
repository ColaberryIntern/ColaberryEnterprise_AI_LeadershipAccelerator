import { enrichCandidates, EMPTY_CONTRACT } from '../capeCandidateFeatureService';
import TimelineCard from '../../../models/TimelineCard';
import type { TodayFeedItem } from '../../timeline/todayFeedComposer';

jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findAll: jest.fn() } }));

const mockFindAll = TimelineCard.findAll as unknown as jest.Mock;

function mkItem(ref: string, cardId: string | null): TodayFeedItem {
  return {
    position: 0, kind: 'anchored', ref, surface: 'today', type: 'implementation_task', render_band: 'task',
    card_id: cardId, title: ref, subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: 1, estimated_time: 15, status: null, interacted: false,
  };
}

const RAG_MAPPING = {
  skill_impacts: [{ skill_id: 'rag', weight: 1, bands: ['application'], credit_strength: 'high', evidence_required: true, max_credit: 20 }],
  prerequisite_skills: [{ skill_id: 'llm_core', min_placement: 30 }],
  recommended_range: { min: 20, max: 60 },
  freshness_days: null,
  reviewable: true,
};

beforeEach(() => jest.clearAllMocks());

describe('enrichCandidates — happy path', () => {
  it('attaches the real stamped skill_mapping for candidates with a card_id', async () => {
    mockFindAll.mockResolvedValue([{ id: 'card-1', skill_mapping: RAG_MAPPING }]);
    const [result] = await enrichCandidates([mkItem('a', 'card-1')]);
    expect(result.skill_mapping).toEqual(RAG_MAPPING);
    expect(mockFindAll).toHaveBeenCalledWith({ where: { id: ['card-1'] }, attributes: ['id', 'skill_mapping'] });
  });

  it('dedupes repeated card_ids into a single query', async () => {
    mockFindAll.mockResolvedValue([{ id: 'card-1', skill_mapping: RAG_MAPPING }]);
    await enrichCandidates([mkItem('a', 'card-1'), mkItem('b', 'card-1')]);
    expect(mockFindAll.mock.calls[0][0].where.id).toEqual(['card-1']);
  });
});

describe('enrichCandidates — boundary cases', () => {
  it('empty candidate array returns [] without a DB call', async () => {
    const result = await enrichCandidates([]);
    expect(result).toEqual([]);
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('candidates with no card_id (community/session items) get EMPTY_CONTRACT, no DB call for them', async () => {
    mockFindAll.mockResolvedValue([]);
    const [result] = await enrichCandidates([mkItem('community:1', null)]);
    expect(result.skill_mapping).toEqual(EMPTY_CONTRACT);
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('a card_id with no matching TimelineCard row (deleted/draft/never stamped) gets EMPTY_CONTRACT, not a throw', async () => {
    mockFindAll.mockResolvedValue([]);
    const [result] = await enrichCandidates([mkItem('a', 'missing-card')]);
    expect(result.skill_mapping).toEqual(EMPTY_CONTRACT);
  });

  it('a found row with a null skill_mapping column (published but never stamped) falls back to EMPTY_CONTRACT', async () => {
    mockFindAll.mockResolvedValue([{ id: 'card-2', skill_mapping: null }]);
    const [result] = await enrichCandidates([mkItem('a', 'card-2')]);
    expect(result.skill_mapping).toEqual(EMPTY_CONTRACT);
  });
});

describe('enrichCandidates — failure path', () => {
  it('a DB error fails soft: every candidate falls back to EMPTY_CONTRACT rather than throwing', async () => {
    mockFindAll.mockRejectedValue(new Error('connection reset'));
    const result = await enrichCandidates([mkItem('a', 'card-1'), mkItem('b', null)]);
    expect(result).toHaveLength(2);
    expect(result[0].skill_mapping).toEqual(EMPTY_CONTRACT);
    expect(result[1].skill_mapping).toEqual(EMPTY_CONTRACT);
  });
});
