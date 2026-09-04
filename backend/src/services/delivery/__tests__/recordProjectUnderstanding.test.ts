/**
 * This runs inside a vendor webhook, so its two load-bearing properties are that it never
 * throws and never extracts twice.
 *
 * A redelivered webhook must not run a second extraction: it costs money again, returns a
 * DIFFERENT answer (the same 245-second call has produced 8, 9 and 11 items across real
 * runs), and leaves two conflicting understandings of one conversation with nothing to say
 * which is authoritative.
 */

const mockFindOne = jest.fn();
const mockCreate = jest.fn();
const mockExtract = jest.fn();

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockFindOne(...a),
    create: (...a: any[]) => mockCreate(...a),
  },
}));

jest.mock('../projectUnderstandingExtractor', () => ({
  extractUnderstanding: (...a: any[]) => mockExtract(...a),
}));

import { recordUnderstandingFromConversation } from '../recordProjectUnderstanding';

const understanding = {
  title: 'Dispatch Workflow Automation',
  proposed_surfaces: ['Reporting dashboard'],
  items: [
    {
      dimension: 'actors',
      value: 'Ralph is the project manager',
      classification: 'FACT',
      provenance: 'voice_transcript',
      source_quote: 'Ralph usually is the keeper of the spreadsheet',
    },
  ],
};

const args = {
  leadId: 2736,
  source: 'voice_transcript' as const,
  sourceRef: 'call-abc',
  conversation: 'bot: hi\nhuman: ralph owns the sheet',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindOne.mockResolvedValue(null);
  mockCreate.mockImplementation(async (v: any) => ({ id: 'row-1', ...v }));
  mockExtract.mockResolvedValue({ ok: true, understanding, rejected: [], cost_usd: 0.0006, runtime_ms: 4900 });
});

describe('recordUnderstandingFromConversation', () => {
  it('extracts and stores on a first delivery', async () => {
    const result = await recordUnderstandingFromConversation(args);

    expect(result).toMatchObject({ status: 'created', id: 'row-1', kept: 1, rejected: 0 });
    const written = mockCreate.mock.calls[0][0];
    expect(written).toMatchObject({ lead_id: 2736, source_ref: 'call-abc', status: 'extracted' });
    expect(written.confidence).toMatchObject({ total: 1, facts: 1, fact_ratio: 1 });
  });

  it('does not extract again when the call is already understood', async () => {
    mockFindOne.mockResolvedValue({ id: 'existing-row' });

    const result = await recordUnderstandingFromConversation(args);

    expect(result).toEqual({ status: 'deduplicated', id: 'existing-row' });
    expect(mockExtract).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('treats a lost race on the unique index as deduplication, not failure', async () => {
    mockCreate.mockRejectedValue({ name: 'SequelizeUniqueConstraintError' });

    const result = await recordUnderstandingFromConversation(args);

    expect(result).toMatchObject({ status: 'deduplicated', reason: 'concurrent_delivery' });
  });

  it('recognises the raw postgres unique violation too', async () => {
    mockCreate.mockRejectedValue({ parent: { code: '23505' } });

    const result = await recordUnderstandingFromConversation(args);
    expect(result).toMatchObject({ status: 'deduplicated' });
  });

  it('stores a failed extraction rather than leaving the lead looking unprocessed', async () => {
    mockExtract.mockResolvedValue({ ok: false, error_class: 'EmptyModelResponse', error: 'nothing parseable' });

    const result = await recordUnderstandingFromConversation(args);

    expect(result).toMatchObject({ status: 'failed', reason: 'EmptyModelResponse' });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      status: 'failed',
      error_class: 'EmptyModelResponse',
      source_ref: 'call-abc',
    });
  });

  it('records what the contract refused, so the loss is visible', async () => {
    mockExtract.mockResolvedValue({
      ok: true,
      understanding,
      rejected: [{ index: 5, reason: 'source_quote is the agent speaking, not the customer', raw: {} }],
      cost_usd: 0.0006,
      runtime_ms: 4900,
    });

    const result = await recordUnderstandingFromConversation(args);

    expect(result).toMatchObject({ status: 'created', kept: 1, rejected: 1 });
    expect(mockCreate.mock.calls[0][0].rejected).toHaveLength(1);
  });

  it('refuses without an idempotency key rather than risking a re-extraction per delivery', async () => {
    const result = await recordUnderstandingFromConversation({ ...args, sourceRef: '  ' });

    expect(result).toEqual({ status: 'skipped', reason: 'no_source_ref' });
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('skips an empty conversation without calling the model', async () => {
    const result = await recordUnderstandingFromConversation({ ...args, conversation: '   ' });

    expect(result).toEqual({ status: 'skipped', reason: 'empty_conversation' });
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('still extracts when the dedup READ fails — a database blip must not drop a call', async () => {
    mockFindOne.mockRejectedValue(new Error('connection reset'));

    const result = await recordUnderstandingFromConversation(args);

    expect(result).toMatchObject({ status: 'created' });
  });

  it('never throws at the webhook, even when persistence dies', async () => {
    mockCreate.mockRejectedValue(new Error('disk full'));

    await expect(recordUnderstandingFromConversation(args)).resolves.toMatchObject({
      status: 'failed',
      reason: 'persist_error',
    });
  });
});
