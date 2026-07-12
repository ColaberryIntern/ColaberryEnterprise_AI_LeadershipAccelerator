import Anthropic from '@anthropic-ai/sdk';
import { generateClarifyingQuestions, generateRequirementsDoc, QuestionAnswer, _resetClientForTesting } from '../advisorBrainService';

jest.mock('@anthropic-ai/sdk');
jest.mock('../../config/env', () => ({
  env: {
    anthropicApiKey: 'test-key',
    advisorClaudeModel: 'claude-sonnet-4-6',
    nodeEnv: 'test',
    databaseUrl: 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',
  },
}));

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

const MOCK_QUESTIONS = [
  'Who is the primary user of this system?',
  'What is the core problem being solved?',
  'What AI capabilities are required?',
  'What platform (web, mobile, API)?',
  'What integrations are needed?',
  'What are the must-have MVP features?',
  'What are the non-functional requirements?',
  'How will success be measured in 3 months?',
  'What is the biggest technical risk?',
  'What is the monetization model?',
];

const MOCK_REQUIREMENTS_RESPONSE = {
  title: 'AI Restaurant Inventory Manager',
  problem_statement: 'Small restaurant owners waste food and money due to manual, error-prone inventory tracking.',
  target_users: 'Small restaurant owners and kitchen managers with limited tech expertise.',
  value_proposition: 'Automated AI-driven inventory tracking that reduces food waste by 30%.',
  technical_requirements: [
    'Real-time inventory tracking via barcode scan or manual entry',
    'AI-powered demand forecasting based on historical sales',
    'Automated low-stock alerts via SMS/email',
    'Supplier integration for automatic reorder',
    'Mobile-first responsive web interface',
  ],
  non_functional_requirements: [
    'Must load within 2 seconds on mobile',
    'Data encrypted at rest and in transit',
    'Support up to 500 SKUs per restaurant',
  ],
  mvp_scope: 'MVP includes manual inventory entry, low-stock alerts, and basic demand forecast. Excludes supplier integrations and barcode scanning.',
  success_metrics: [
    '30% reduction in food waste within 90 days',
    '80% of users log inventory daily after week 2',
    'Zero data loss incidents in first 6 months',
  ],
  raw_markdown: '# AI Restaurant Inventory Manager\n\n## Problem\nSmall restaurant owners...',
};

function makeMessageResponse(content: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content, citations: [] } as Anthropic.TextBlock],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200 } as Anthropic.Usage,
  } as Anthropic.Message;
}

describe('advisorBrainService', () => {
  let mockCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetClientForTesting();
    mockCreate = jest.fn();
    MockedAnthropic.mockImplementation(() => ({
      messages: { create: mockCreate },
    }) as any);
  });

  describe('generateClarifyingQuestions', () => {
    it('happy path: returns 10 questions for a valid idea', async () => {
      mockCreate.mockResolvedValueOnce(
        makeMessageResponse(JSON.stringify({ questions: MOCK_QUESTIONS })),
      );

      const result = await generateClarifyingQuestions(
        'AI tool to help restaurants manage inventory',
        'enroll-123',
      );

      expect(result.error).toBeNull();
      expect(result.enrollmentId).toBe('enroll-123');
      expect(result.questions).toHaveLength(10);
      expect(result.questions[0]).toBe('Who is the primary user of this system?');
    });

    it('returns AuthError when ANTHROPIC_API_KEY is missing', async () => {
      jest.resetModules();
      jest.doMock('../../config/env', () => ({
        env: {
          anthropicApiKey: '',
          advisorClaudeModel: 'claude-sonnet-4-6',
          nodeEnv: 'test',
          databaseUrl: 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',
        },
      }));
      const { generateClarifyingQuestions: noKey } = await import('../advisorBrainService');

      const result = await noKey('some idea', 'enroll-123');
      expect(result.error).toContain('ANTHROPIC_API_KEY not set');
      expect(result.questions).toHaveLength(0);
    });

    it('returns error result on timeout (never throws)', async () => {
      mockCreate.mockRejectedValueOnce(new Error('timeout of 30000ms exceeded'));

      const result = await generateClarifyingQuestions('some idea', 'enroll-123');
      expect(result.error).toBe('TimeoutError');
      expect(result.questions).toHaveLength(0);
    });

    it('boundary: empty idea string returns error without calling Claude', async () => {
      const result = await generateClarifyingQuestions('', 'enroll-123');
      expect(result.error).toBe('idea must not be empty');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('handles Claude returning markdown-fenced JSON', async () => {
      const fenced = '```json\n' + JSON.stringify({ questions: MOCK_QUESTIONS }) + '\n```';
      mockCreate.mockResolvedValueOnce(makeMessageResponse(fenced));

      const result = await generateClarifyingQuestions('restaurant inventory AI', 'enroll-456');
      expect(result.error).toBeNull();
      expect(result.questions).toHaveLength(10);
    });
  });

  describe('generateRequirementsDoc', () => {
    const SAMPLE_ANSWERS: QuestionAnswer[] = [
      { question: 'Who is the primary user?', answer: 'Restaurant owners' },
      { question: 'What is the core problem?', answer: 'Manual inventory waste' },
    ];

    it('happy path: returns structured requirements doc', async () => {
      mockCreate.mockResolvedValueOnce(
        makeMessageResponse(JSON.stringify(MOCK_REQUIREMENTS_RESPONSE)),
      );

      const result = await generateRequirementsDoc(
        'AI restaurant inventory tool',
        SAMPLE_ANSWERS,
        'enroll-123',
      );

      expect(result.error).toBeNull();
      expect(result.title).toBe('AI Restaurant Inventory Manager');
      expect(result.technical_requirements).toHaveLength(5);
      expect(result.non_functional_requirements).toHaveLength(3);
      expect(result.success_metrics).toHaveLength(3);
      expect(result.raw_markdown).toContain('# AI Restaurant Inventory Manager');
    });

    it('boundary: empty answers array still produces a doc (Claude infers defaults)', async () => {
      mockCreate.mockResolvedValueOnce(
        makeMessageResponse(JSON.stringify(MOCK_REQUIREMENTS_RESPONSE)),
      );

      const result = await generateRequirementsDoc(
        'AI restaurant inventory tool',
        [],
        'enroll-123',
      );

      expect(result.error).toBeNull();
      expect(result.title).toBeTruthy();
    });

    it('boundary: partial answers (3 of 10) still produces a doc', async () => {
      mockCreate.mockResolvedValueOnce(
        makeMessageResponse(JSON.stringify(MOCK_REQUIREMENTS_RESPONSE)),
      );
      const threeAnswers: QuestionAnswer[] = SAMPLE_ANSWERS.slice(0, 3);

      const result = await generateRequirementsDoc('AI tool', threeAnswers, 'enroll-123');
      expect(result.error).toBeNull();
    });

    it('returns AuthError when ANTHROPIC_API_KEY is missing', async () => {
      jest.resetModules();
      jest.doMock('../../config/env', () => ({
        env: {
          anthropicApiKey: '',
          advisorClaudeModel: 'claude-sonnet-4-6',
          nodeEnv: 'test',
          databaseUrl: 'postgres://accelerator:accelerator@localhost:5432/accelerator_dev',
        },
      }));
      const { generateRequirementsDoc: noKey } = await import('../advisorBrainService');

      const result = await noKey('some idea', [], 'enroll-123');
      expect(result.error).toContain('ANTHROPIC_API_KEY not set');
      expect(result.title).toBe('');
    });

    it('returns error result on timeout (never throws)', async () => {
      mockCreate.mockRejectedValueOnce(new Error('timeout of 30000ms exceeded'));

      const result = await generateRequirementsDoc('some idea', SAMPLE_ANSWERS, 'enroll-123');
      expect(result.error).toBe('TimeoutError');
      expect(result.title).toBe('');
    });

    it('empty idea string returns error without calling Claude', async () => {
      const result = await generateRequirementsDoc('  ', SAMPLE_ANSWERS, 'enroll-123');
      expect(result.error).toBe('idea must not be empty');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('idempotent: two calls with same inputs both return valid structure', async () => {
      mockCreate
        .mockResolvedValueOnce(makeMessageResponse(JSON.stringify(MOCK_REQUIREMENTS_RESPONSE)))
        .mockResolvedValueOnce(makeMessageResponse(JSON.stringify(MOCK_REQUIREMENTS_RESPONSE)));

      const r1 = await generateRequirementsDoc('AI tool', SAMPLE_ANSWERS, 'enroll-123');
      const r2 = await generateRequirementsDoc('AI tool', SAMPLE_ANSWERS, 'enroll-123');

      expect(r1.title).toBe(r2.title);
      expect(r1.error).toBeNull();
      expect(r2.error).toBeNull();
    });
  });
});
