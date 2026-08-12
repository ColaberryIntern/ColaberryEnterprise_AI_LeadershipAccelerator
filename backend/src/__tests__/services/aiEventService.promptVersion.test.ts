import AiEvent from '../../models/AiEvent';
import { emitAiEvent } from '../../services/aiEventService';

jest.mock('../../models/AiEvent', () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({ id: 'row-1' }) },
}));

const mockCreate = AiEvent.create as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('emitAiEvent prompt_version/prompt_template_id (T003 / P2-3)', () => {
  it('folds prompt_version into metadata without a schema change, leaving metadata null when absent', async () => {
    await emitAiEvent({ event_type: 'llm.call', outcome: 'success' });
    expect(mockCreate.mock.calls[0][0].metadata).toBeNull();
  });

  it('folds prompt_version into metadata when provided, alongside any pre-existing metadata', async () => {
    await emitAiEvent({
      event_type: 'llm.call',
      outcome: 'success',
      prompt_version: 'maya-chat-v1',
      metadata: { streamed: true },
    });
    expect(mockCreate.mock.calls[0][0].metadata).toEqual({ streamed: true, prompt_version: 'maya-chat-v1', prompt_template_id: undefined });
  });

  it('folds prompt_template_id into metadata when provided instead of/alongside prompt_version', async () => {
    await emitAiEvent({
      event_type: 'llm.call',
      outcome: 'success',
      prompt_template_id: 'tmpl-123',
    });
    expect(mockCreate.mock.calls[0][0].metadata).toEqual({ prompt_version: undefined, prompt_template_id: 'tmpl-123' });
  });
});
