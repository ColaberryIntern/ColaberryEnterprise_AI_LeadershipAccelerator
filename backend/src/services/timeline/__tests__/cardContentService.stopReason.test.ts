/**
 * cardContentService — generation completeness gate.
 *
 * A card is only a card if the model finished its own sentence. When generation
 * stops because it hit the token ceiling (`finish_reason: 'length'`), the JSON we
 * are holding is a half-written card, and persisting it publishes a lesson that
 * dies mid-word to every student in the cohort. Three cards shipped that way
 * (Week 4 Prompt Lab, Week 8 Setup Lab, Build Breakdown), and Week 4 re-truncated
 * itself after being hand-repaired because the generator simply produced another
 * truncated one.
 *
 * These tests pin the invariant: a length-stopped (or stop-reason-less) generation
 * is a FAILED generation, never a saved card.
 */

// ---------------------------------------------------------------------------
// Mocks — generateCardContent's whole dependency graph. Declared before the
// import of the service under test (jest hoists jest.mock, but the service is
// imported for real, so every collaborator must be stubbed).
// ---------------------------------------------------------------------------
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

jest.mock('../../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../blueprintContext', () => ({
  getBlueprintContext: jest.fn(),
}));

jest.mock('../sectionCurriculumContext', () => ({
  getSectionCurriculumContext: jest.fn(),
  // A real Set: the service calls .has() on it. 'setup_lab' is deliberately NOT
  // a member, so the roster branch stays out of these tests.
  SECTION_ROSTER_TYPES: new Set(['prompt_lab', 'announcement']),
}));

jest.mock('../../components/promptTesterService', () => ({
  resolvePrompt: jest.fn((tpl: string) => tpl),
}));

jest.mock('../../components/costEstimationService', () => ({
  DEFAULT_MODEL: 'gpt-4o-mini',
  MODEL_PRICING: { 'gpt-4o-mini': { input_per_1m: 0.15, output_per_1m: 0.6 } },
}));

jest.mock('../../openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(),
}));

import { generateCardContent } from '../cardContentService';
import TimelineCard from '../../../models/TimelineCard';
import CurriculumTypeDefinition from '../../../models/CurriculumTypeDefinition';
import { getBlueprintContext } from '../blueprintContext';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockFindByPk = (TimelineCard as unknown as { findByPk: jest.Mock }).findByPk;
const mockFindOne = (CurriculumTypeDefinition as unknown as { findOne: jest.Mock }).findOne;
const mockBlueprint = getBlueprintContext as jest.Mock;
const mockGetClient = getInstrumentedOpenAI as jest.Mock;

let mockCreate: jest.Mock;
let mockUpdate: jest.Mock;

/** A complete, well-formed card payload — what a healthy generation returns. */
const GOOD_CARD = {
  title: 'Prompt Lab: Constraint Stacking',
  summary: 'Practise layering constraints onto a single prompt.',
  body_html: '<h4>Warm up</h4><p>Start from the base prompt and add one constraint at a time.</p>',
  questions: ['Which constraint changed the output most?'],
  reflection: 'Where did the model stop following your instructions?',
};

/**
 * An OpenAI chat-completion envelope. `finishReason` is passed through exactly as
 * given — including `undefined`, which omits the key entirely so we can exercise a
 * response that never reports how it stopped.
 */
function chatResponse(content: string, finishReason: string | null | undefined, opts: { omitFinishReason?: boolean } = {}) {
  const choice: Record<string, unknown> = { index: 0, message: { role: 'assistant', content } };
  if (!opts.omitFinishReason) choice.finish_reason = finishReason;
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    model: 'gpt-4o-mini',
    choices: [choice],
    usage: { prompt_tokens: 900, completion_tokens: 3200, total_tokens: 4100 },
  };
}

/** The half-written JSON a real length-stop produces: cut off mid-word, unclosed. */
const TRUNCATED_JSON =
  '{"title":"Prompt Lab: Constraint Stacking","summary":"Practise layering constraints onto a single prompt.",'
  + '"body_html":"<h4>Warm up</h4><p>Start from the base prompt and add one constraint at a time. Notice how the model beg';

beforeEach(() => {
  jest.clearAllMocks();

  mockUpdate = jest.fn().mockResolvedValue(undefined);
  mockFindByPk.mockResolvedValue({
    id: 'card-1',
    type: 'setup_lab',
    title: 'Setup Lab',
    week: 8,
    description: 'Get your environment running.',
    program_id: 'prog-1',
    metadata: {},
    update: mockUpdate,
  });

  mockFindOne.mockResolvedValue({ generation_prompt: 'Write the setup lab.', student_label: 'Setup Lab' });
  mockBlueprint.mockResolvedValue(null);

  mockCreate = jest.fn();
  mockGetClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
});

describe('generateCardContent — generation completeness gate', () => {
  it('happy path: a normal stop is saved as the card', async () => {
    mockCreate.mockResolvedValueOnce(chatResponse(JSON.stringify(GOOD_CARD), 'stop'));

    const result = await generateCardContent('card-1');

    expect(result.content.title).toBe(GOOD_CARD.title);
    expect(result.content.body_html).toContain('Start from the base prompt');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // The saved copy is the generated copy.
    const saved = mockUpdate.mock.calls[0][0];
    expect(saved.metadata.content.title).toBe(GOOD_CARD.title);
    expect(typeof saved.metadata.content_at).toBe('string');
  });

  it('FAILURE PATH: a length stop on every attempt throws and persists NOTHING', async () => {
    mockCreate.mockResolvedValue(chatResponse(TRUNCATED_JSON, 'length'));

    await expect(generateCardContent('card-1')).rejects.toThrow(/incomplete|truncat|length/i);

    // The whole point: a half-written card is never written to the card.
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('recovers: a length stop retries once with more headroom and saves the complete result', async () => {
    mockCreate
      .mockResolvedValueOnce(chatResponse(TRUNCATED_JSON, 'length'))
      .mockResolvedValueOnce(chatResponse(JSON.stringify(GOOD_CARD), 'stop'));

    const result = await generateCardContent('card-1');

    expect(mockCreate).toHaveBeenCalledTimes(2);

    // The retry must actually give the model more room, otherwise it is just a
    // second identical failure.
    const firstCeiling = mockCreate.mock.calls[0][0].max_tokens;
    const retryCeiling = mockCreate.mock.calls[1][0].max_tokens;
    expect(retryCeiling).toBeGreaterThan(firstCeiling);

    // Exactly one write, and it is the COMPLETE card, not the truncated first pass.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0].metadata.content.body_html).toContain('one constraint at a time.');
    expect(result.content.body_html).not.toContain('the model beg');

    // Cost is the ACCUMULATED spend across both calls, not just the last one:
    // (900 * 0.15 + 3200 * 0.6) / 1e6 = 0.002055 per call.
    expect(result.cost_usd).toBeCloseTo(0.00411, 6);
  });

  it('BOUNDARY: a response with NO finish_reason field is not success — it throws and persists nothing', async () => {
    // Content parses perfectly. The only defect is that the response never said
    // how it stopped. Reading an absent stop reason as "stop" is the same bug one
    // level up, so this must fail closed.
    mockCreate.mockResolvedValue(
      chatResponse(JSON.stringify(GOOD_CARD), undefined, { omitFinishReason: true }),
    );

    await expect(generateCardContent('card-1')).rejects.toThrow(/incomplete|truncat|stop reason/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('BOUNDARY: an explicitly null finish_reason is not success either', async () => {
    mockCreate.mockResolvedValue(chatResponse(JSON.stringify(GOOD_CARD), null));

    await expect(generateCardContent('card-1')).rejects.toThrow(/incomplete|truncat|stop reason/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('BOUNDARY: a content_filter stop fails immediately without burning a retry', async () => {
    // More headroom cannot fix a filtered completion, so there is nothing to retry.
    mockCreate.mockResolvedValue(chatResponse('{}', 'content_filter'));

    await expect(generateCardContent('card-1')).rejects.toThrow(/incomplete|content_filter/i);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
