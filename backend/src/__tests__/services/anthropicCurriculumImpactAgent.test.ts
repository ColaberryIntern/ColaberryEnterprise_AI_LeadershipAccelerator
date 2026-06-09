import { runCurriculumImpactAgent } from '../../services/anthropicCurriculumImpactAgent';
import AnthropicChangeEvent from '../../models/AnthropicChangeEvent';
import * as openaiHelper from '../../intelligence/assistant/openaiHelper';
import * as emailService from '../../services/emailService';
import * as settingsService from '../../services/settingsService';

jest.mock('../../models/AnthropicChangeEvent');
jest.mock('../../intelligence/assistant/openaiHelper');
jest.mock('../../services/emailService');
jest.mock('../../services/settingsService');

const MockEvent = AnthropicChangeEvent as jest.Mocked<typeof AnthropicChangeEvent>;
const mockGetOpenAIClient = openaiHelper.getOpenAIClient as jest.Mock;
const mockSendDigest = emailService.sendCurriculumImpactDigest as jest.Mock;
const mockGetSetting = settingsService.getSetting as jest.Mock;

function makeOAIClient(content: string) {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

function makeEvent(overrides: Partial<{
  id: string;
  url: string;
  content_type: string;
  severity: string;
  previous_value: string | null;
  current_value: string;
  detected_at: Date;
  detection_method: string;
}> = {}): any {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    id: overrides.id ?? 'event-uuid-1',
    url: overrides.url ?? 'https://docs.anthropic.com',
    content_type: overrides.content_type ?? 'document',
    severity: overrides.severity ?? 'unknown',
    previous_value: overrides.previous_value !== undefined ? overrides.previous_value : 'hash-aaa',
    current_value: overrides.current_value ?? 'hash-bbb',
    detected_at: overrides.detected_at ?? new Date('2026-06-07T02:00:00Z'),
    detection_method: overrides.detection_method ?? 'content_hash',
    update,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSetting.mockResolvedValue('ali@colaberry.com');
  mockSendDigest.mockResolvedValue(undefined);
});

describe('runCurriculumImpactAgent — happy paths', () => {
  it('scores an event and updates severity', async () => {
    const event = makeEvent();
    MockEvent.findAll = jest.fn().mockResolvedValue([event]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 5, "rationale": "moderate content update"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.scored).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.alerted).toBe(0);
    expect(event.update).toHaveBeenCalledWith({ severity: 'medium' });
    expect(result.events[0].score).toBe(5);
    expect(result.events[0].severity).toBe('medium');
  });

  it('returns zero immediately when no unscored events exist', async () => {
    MockEvent.findAll = jest.fn().mockResolvedValue([]);

    const result = await runCurriculumImpactAgent();

    expect(result.scored).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.alerted).toBe(0);
    expect(mockSendDigest).not.toHaveBeenCalled();
  });

  it('processes multiple events', async () => {
    const events = [
      makeEvent({ id: 'e1', url: 'https://docs.anthropic.com' }),
      makeEvent({ id: 'e2', url: 'https://anthropic.com/news' }),
    ];
    MockEvent.findAll = jest.fn().mockResolvedValue(events);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 3, "rationale": "minor change"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.scored).toBe(2);
    expect(result.events[0].severity).toBe('low');
  });
});

describe('runCurriculumImpactAgent — severity thresholds', () => {
  it('maps score 7 to high and sends alert', async () => {
    const event = makeEvent();
    MockEvent.findAll = jest.fn().mockResolvedValue([event]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 7, "rationale": "significant update"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.events[0].severity).toBe('high');
    expect(result.alerted).toBe(1);
    expect(mockSendDigest).toHaveBeenCalledWith(
      'ali@colaberry.com',
      expect.arrayContaining([expect.objectContaining({ score: 7, severity: 'high' })]),
    );
  });

  it('maps score 9 to critical', async () => {
    const event = makeEvent();
    MockEvent.findAll = jest.fn().mockResolvedValue([event]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 9, "rationale": "major restructure"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.events[0].severity).toBe('critical');
    expect(result.alerted).toBe(1);
  });

  it('does not alert for score 6', async () => {
    const event = makeEvent();
    MockEvent.findAll = jest.fn().mockResolvedValue([event]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 6, "rationale": "moderate update"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.events[0].severity).toBe('medium');
    expect(result.alerted).toBe(0);
    expect(mockSendDigest).not.toHaveBeenCalled();
  });
});

describe('runCurriculumImpactAgent — failure paths', () => {
  it('records ScoringError and continues when OpenAI returns null client', async () => {
    const failEvent = makeEvent({ id: 'fail', url: 'https://fail.example.com' });
    const okEvent = makeEvent({ id: 'ok', url: 'https://docs.anthropic.com' });
    MockEvent.findAll = jest.fn().mockResolvedValue([failEvent, okEvent]);

    mockGetOpenAIClient
      .mockReturnValueOnce(null)
      .mockReturnValue(makeOAIClient('{"score": 4, "rationale": "ok"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.scored).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.events[0].error_class).toBe('ScoringError');
    expect(result.events[1].severity).toBe('medium');
  });

  it('tags malformed JSON as ParseError', async () => {
    const event = makeEvent();
    MockEvent.findAll = jest.fn().mockResolvedValue([event]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('not valid json'));

    const result = await runCurriculumImpactAgent();

    expect(result.errors).toBe(1);
    expect(result.events[0].error_class).toBe('ParseError');
  });
});

describe('runCurriculumImpactAgent — baseline events', () => {
  it('handles baseline event (null previous_value) without error', async () => {
    const event = makeEvent({ previous_value: null });
    MockEvent.findAll = jest.fn().mockResolvedValue([event]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 5, "rationale": "baseline capture"}'));

    const result = await runCurriculumImpactAgent();

    expect(result.scored).toBe(1);
    expect(result.errors).toBe(0);
  });
});

describe('runCurriculumImpactAgent — idempotency', () => {
  it('second run with no unscored events produces zero scored', async () => {
    const event = makeEvent();
    MockEvent.findAll = jest.fn()
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([]);
    mockGetOpenAIClient.mockReturnValue(makeOAIClient('{"score": 5, "rationale": "ok"}'));

    const first = await runCurriculumImpactAgent();
    const second = await runCurriculumImpactAgent();

    expect(first.scored).toBe(1);
    expect(second.scored).toBe(0);
    expect(mockSendDigest).not.toHaveBeenCalled();
  });
});
