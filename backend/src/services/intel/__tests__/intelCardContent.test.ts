/**
 * intelCardContent — the completeness gates on the intel materialization path.
 *
 * `materializeIntelCard` had NO protection at all: it never inspected the stop
 * reason and ran at max_tokens 1600. That is the path that truncated the
 * "4-Layer Model for AI Search Readiness" Build Breakdown, and it feeds the whole
 * intel card feed. Both materializers (intelPipeline and aiNewsIngestionService)
 * create their row `visibility: 'published'` with a fresh content_at, so a
 * fragment saved here is a broken card in the live feed for 30 days.
 *
 * The invariant pinned here: an incomplete generation yields null, so the caller
 * persists nothing and the next cron run retries.
 */
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: jest.fn() }));

import { generateIntelCardContent, INTEL_CARD_MAX_TOKENS, INTEL_CARD_MAX_TOKENS_RETRY } from '../intelCardContent';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockGetClient = getInstrumentedOpenAI as jest.Mock;
let mockCreate: jest.Mock;

const ARGS = {
  slug: 'build_breakdown',
  label: 'Build Breakdown',
  resolvedPrompt: 'Break down the AI search readiness study.',
  fallbackTitle: 'The 4-Layer Model for AI Search Readiness',
  workflowId: 'build_breakdown_generate',
  model: 'gpt-4o-mini',
  guid: 'guid-1',
};

/** A complete Build Breakdown, footer and all. */
const GOOD = {
  title: 'The 4-Layer Model for AI Search Readiness',
  summary: 'Four layers decide whether an assistant can read your site at all.',
  body_html: '<div class="ip"><p>Only 24.7% of the 3,200 domains sampled cleared the crawlability floor.</p><div class="foot">Source: Ahrefs<span class="conf">Confidence: Medium</span></div></div>',
  questions: ['Which layer is weakest on your own site?'],
  reflection: 'Where would you start?',
  discussion_prompt: 'Post your own score.',
};

/** The card as it actually shipped: cut off mid-statistic, footer gone. */
const TRUNCATED = {
  title: 'The 4-Layer Model for AI Search Readiness',
  summary: 'Four layers decide whether an assistant can read your site at all.',
  body_html: '<div class="ip"><p>Only 24.7% of domains scored ',
  questions: [],
};

function chatResponse(payload: unknown, finishReason: string | null | undefined, opts: { omitFinishReason?: boolean } = {}) {
  const choice: Record<string, unknown> = { index: 0, message: { role: 'assistant', content: JSON.stringify(payload) } };
  if (!opts.omitFinishReason) choice.finish_reason = finishReason;
  return { id: 'chatcmpl_test', object: 'chat.completion', model: 'gpt-4o-mini', choices: [choice], usage: { prompt_tokens: 400, completion_tokens: 900 } };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockCreate = jest.fn();
  mockGetClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
});

afterEach(() => jest.restoreAllMocks());

describe('generateIntelCardContent — stop-reason gate', () => {
  it('HAPPY PATH: one call, clean stop, complete card', async () => {
    mockCreate.mockResolvedValue(chatResponse(GOOD, 'stop'));

    const out = await generateIntelCardContent(ARGS);

    expect(out).not.toBeNull();
    expect(out!.title).toBe(GOOD.title);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(INTEL_CARD_MAX_TOKENS);
  });

  it('recovers: a length stop retries ONCE with double the headroom', async () => {
    mockCreate
      .mockResolvedValueOnce(chatResponse(TRUNCATED, 'length'))
      .mockResolvedValueOnce(chatResponse(GOOD, 'stop'));

    const out = await generateIntelCardContent(ARGS);

    expect(out).not.toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[1][0].max_tokens).toBe(INTEL_CARD_MAX_TOKENS_RETRY);
  });

  it('FAILURE PATH: a length stop on EVERY attempt yields null — persist nothing', async () => {
    mockCreate.mockResolvedValue(chatResponse(TRUNCATED, 'length'));

    expect(await generateIntelCardContent(ARGS)).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('BOUNDARY: a response with NO finish_reason field is not success', async () => {
    mockCreate.mockResolvedValue(chatResponse(GOOD, undefined, { omitFinishReason: true }));
    expect(await generateIntelCardContent(ARGS)).toBeNull();
  });

  it('BOUNDARY: an explicitly null finish_reason is not success either', async () => {
    mockCreate.mockResolvedValue(chatResponse(GOOD, null));
    expect(await generateIntelCardContent(ARGS)).toBeNull();
  });

  it('a content_filter stop fails immediately without burning a retry', async () => {
    mockCreate.mockResolvedValue(chatResponse(GOOD, 'content_filter'));

    expect(await generateIntelCardContent(ARGS)).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('an API failure yields null without a retry storm', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('upstream 503'), { status: 503 }));

    expect(await generateIntelCardContent(ARGS)).toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('generateIntelCardContent — structural gate', () => {
  it('THE INVARIANT: a finish_reason "stop" response with structurally unfinished content is REJECTED', async () => {
    mockCreate.mockResolvedValue(chatResponse(TRUNCATED, 'stop'));

    expect(await generateIntelCardContent(ARGS)).toBeNull();
    // It still spends the one retry, because this path is a nightly cron with
    // nobody waiting and the alternative is no card until tomorrow.
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('recovers: a clean-stop-but-unfinished first attempt, complete on the retry', async () => {
    mockCreate
      .mockResolvedValueOnce(chatResponse(TRUNCATED, 'stop'))
      .mockResolvedValueOnce(chatResponse(GOOD, 'stop'));

    const out = await generateIntelCardContent(ARGS);
    expect(out).not.toBeNull();
    expect(out!.body_html).toContain('Confidence:');
  });

  it('FAILURE PATH: unparseable JSON is an incomplete generation, never an empty card', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ index: 0, message: { role: 'assistant', content: '{"title":"Half","body_html":"<p>cut' }, finish_reason: 'stop' }],
      usage: {},
    });

    expect(await generateIntelCardContent(ARGS)).toBeNull();
  });

  it('FAILURE PATH: an empty JSON object never becomes a title-only blank card', async () => {
    mockCreate.mockResolvedValue(chatResponse({}, 'stop'));

    // Before the gate this produced { title: item.title } and was published as a
    // real card with no body at all.
    expect(await generateIntelCardContent(ARGS)).toBeNull();
  });

  it('per-type: an intel card that dropped its Source/Confidence footer is rejected', async () => {
    const noFooter = { ...GOOD, body_html: '<div class="ip"><p>The four layer model describes how crawler, parser, ranker and renderer each see a page.</p></div>' };
    mockCreate.mockResolvedValue(chatResponse(noFooter, 'stop'));

    expect(await generateIntelCardContent(ARGS)).toBeNull();
  });
});
