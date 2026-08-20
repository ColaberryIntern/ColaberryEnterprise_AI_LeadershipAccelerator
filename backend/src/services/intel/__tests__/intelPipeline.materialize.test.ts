/**
 * intelPipeline.materializeIntelCard — the persist boundary.
 *
 * This is the function that truncated the Build Breakdown, and it feeds the whole
 * intel card feed. It creates its row `visibility: 'published'` with a fresh
 * content_at, so anything saved here is live to every reader for a 30-day cache
 * life. Before this change it inspected no stop reason at all and ran at
 * max_tokens 1600.
 *
 * The invariant pinned here: for an incomplete generation, NOTHING is written —
 * not `summary_json` on the item, not the card row — and the item stays
 * un-carded so tonight's run tries again. A partial card a student can half-use
 * beats a blank one they cannot; an absent card that regenerates beats both.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/IntelItem', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../../models/CurriculumTypeDefinition', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../components/promptTesterService', () => ({ resolvePrompt: jest.fn((tpl: string) => tpl) }));
jest.mock('../../components/costEstimationService', () => ({ DEFAULT_MODEL: 'gpt-4o-mini', MODEL_PRICING: {} }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { materializeIntelCard } from '../intelPipeline';
import TimelineCard from '../../../models/TimelineCard';
import CurriculumTypeDefinition from '../../../models/CurriculumTypeDefinition';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockCardCreate = (TimelineCard as unknown as { create: jest.Mock }).create;
const mockTypeFindOne = (CurriculumTypeDefinition as unknown as { findOne: jest.Mock }).findOne;
const mockGetClient = getInstrumentedOpenAI as jest.Mock;

let mockCreate: jest.Mock;
let mockItemUpdate: jest.Mock;

const GOOD = {
  title: 'The 4-Layer Model for AI Search Readiness',
  summary: 'Four layers decide whether an assistant can read your site at all.',
  body_html: '<div class="ip"><p>Only 24.7% of the 3,200 domains sampled cleared the crawlability floor.</p><div class="foot">Source: Ahrefs<span class="conf">Confidence: Medium</span></div></div>',
  questions: ['Which layer is weakest on your own site?'],
  reflection: 'Where would you start?',
};

/** Exactly how the Build Breakdown shipped: clean stop, parseable, cut mid-statistic. */
const TRUNCATED = {
  title: 'The 4-Layer Model for AI Search Readiness',
  summary: 'Four layers decide whether an assistant can read your site at all.',
  body_html: '<div class="ip"><p>Only 24.7% of domains scored ',
};

function chatResponse(payload: unknown, finishReason: string) {
  return {
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: finishReason }],
    usage: { prompt_tokens: 400, completion_tokens: 900 },
  };
}

/** any: the real IntelItem is a Sequelize instance; the function reads only these fields. */
const makeItem = (): any => ({
  id: 'item-1', pipeline: 'build_breakdown', guid: 'guid-1', card_id: null, summary_json: null,
  title: 'The 4-Layer Model for AI Search Readiness', source: 'Ahrefs',
  url: 'https://example.com/study', excerpt: 'A study of 3,200 domains.',
  published_at: new Date('2026-08-18T00:00:00Z'), update: mockItemUpdate,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  mockItemUpdate = jest.fn().mockResolvedValue(undefined);
  mockTypeFindOne.mockResolvedValue({ slug: 'build_breakdown', label: 'Build Breakdown', generation_prompt: 'Break down the study.' });
  mockCardCreate.mockResolvedValue({ id: 'card-99' });

  mockCreate = jest.fn();
  mockGetClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
});

afterEach(() => jest.restoreAllMocks());

describe('materializeIntelCard', () => {
  it('THE INVARIANT: a finish_reason "stop" response with structurally unfinished content publishes NOTHING', async () => {
    mockCreate.mockResolvedValue(chatResponse(TRUNCATED, 'stop'));
    const item = makeItem();

    expect(await materializeIntelCard(item)).toBeNull();
    expect(mockCardCreate).not.toHaveBeenCalled();
    expect(mockItemUpdate).not.toHaveBeenCalled(); // no summary_json, so tonight's run retries
  });

  it('FAILURE PATH: a length stop on every attempt publishes nothing', async () => {
    mockCreate.mockResolvedValue(chatResponse(TRUNCATED, 'length'));
    const item = makeItem();

    expect(await materializeIntelCard(item)).toBeNull();
    expect(mockCardCreate).not.toHaveBeenCalled();
  });

  it('BOUNDARY: a response that never says how it stopped publishes nothing', async () => {
    mockCreate.mockResolvedValue({ choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(GOOD) } }] });
    const item = makeItem();

    expect(await materializeIntelCard(item)).toBeNull();
    expect(mockCardCreate).not.toHaveBeenCalled();
  });

  it('HAPPY PATH: a complete card is published once and the item records its card_id', async () => {
    mockCreate.mockResolvedValue(chatResponse(GOOD, 'stop'));
    const item = makeItem();

    expect(await materializeIntelCard(item)).toBe('card-99');
    expect(mockCardCreate).toHaveBeenCalledTimes(1);
    expect(mockCardCreate.mock.calls[0][0].visibility).toBe('published');
    expect(mockItemUpdate).toHaveBeenCalledWith({ summary_json: expect.objectContaining({ title: GOOD.title }) });
    expect(mockItemUpdate).toHaveBeenCalledWith({ card_id: 'card-99' });
  });

  it('IDEMPOTENT: an already-carded item is a no-op with no model call', async () => {
    const item = { ...makeItem(), card_id: 'card-existing' };

    expect(await materializeIntelCard(item)).toBe('card-existing');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCardCreate).not.toHaveBeenCalled();
  });
});
