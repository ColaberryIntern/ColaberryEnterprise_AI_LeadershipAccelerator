/**
 * The prospect-facing read. Two things matter more than the happy path.
 *
 * It must not become a way to discover other people's submissions, and it must be able to
 * say "this failed" rather than spinning forever — a page that shows a spinner after the
 * extraction has already died is how a person concludes the product is broken.
 */

const mockPayloadFindByPk = jest.fn();
const mockRecordFindOne = jest.fn();

jest.mock('../../../models/RawLeadPayload', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockPayloadFindByPk(...a) },
}));

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockRecordFindOne(...a) },
}));

import { getFlotationPreview } from '../flotationPreviewService';

const TOKEN = 'dab3faaf-f4f3-43d6-a9b8-34b4a003fb32';

const extracted = {
  status: 'extracted',
  title: 'Dispatcher Workflow Automation',
  proposed_surfaces: ['Reporting dashboard'],
  items: [
    {
      dimension: 'actors',
      value: 'Ralph is the project manager',
      classification: 'FACT',
      provenance: 'voice_transcript',
      source_quote: 'Ralph usually is the keeper of the spreadsheet',
    },
    {
      dimension: 'integrations',
      value: 'Which accounting system holds the invoices?',
      classification: 'QUESTION',
      provenance: 'ai_inferred',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPayloadFindByPk.mockResolvedValue({ resulting_lead_id: 2736 });
  mockRecordFindOne.mockResolvedValue(extracted);
});

describe('ready', () => {
  it('returns §17’s headline numbers', async () => {
    const preview = await getFlotationPreview(TOKEN);

    expect(preview.status).toBe('ready');
    expect(preview.summary).toMatchObject({
      title: 'Dispatcher Workflow Automation',
      primary_users: 1,
      proposed_surfaces: ['Reporting dashboard'],
    });
  });

  it('marks which statements were inferred rather than said', async () => {
    const preview = await getFlotationPreview(TOKEN);

    expect(preview.items).toEqual([
      expect.objectContaining({ index: 0, value: 'Ralph is the project manager', inferred: false }),
      expect.objectContaining({ index: 1, inferred: true }),
    ]);
  });

  it('does not leak the transcript quotes back to the page', async () => {
    // The quote is internal provenance. Showing someone a transcript line of their own
    // speech, transcribed imperfectly, invites an argument about the transcript rather
    // than about their business.
    const preview = await getFlotationPreview(TOKEN);
    expect(JSON.stringify(preview)).not.toContain('keeper of the spreadsheet');
  });

  it('surfaces what is still open so they can answer it', async () => {
    const preview = await getFlotationPreview(TOKEN);
    expect(preview.still_open).toEqual(['Which accounting system holds the invoices?']);
  });

  it('reports how much they have personally confirmed', async () => {
    const preview = await getFlotationPreview(TOKEN);
    expect(preview.confirmed).toMatchObject({ total: 2, client_confirmed: 0 });
  });
});

describe('pending', () => {
  it('says the write-up is still happening rather than showing nothing', async () => {
    mockRecordFindOne.mockResolvedValue(null);

    const preview = await getFlotationPreview(TOKEN);

    expect(preview.status).toBe('pending');
    expect(preview.message).toContain('updates on its own');
  });
});

describe('failed', () => {
  it('says so, and promises only what actually happens', async () => {
    mockRecordFindOne.mockResolvedValue({ ...extracted, status: 'failed' });

    const preview = await getFlotationPreview(TOKEN);

    expect(preview.status).toBe('failed');
    // Nothing automated retries this, so the message must not imply that something will.
    expect(preview.message).toContain('Someone from AI Flotation will pick this up');
    expect(preview.message).not.toMatch(/retry|automatically|shortly/i);
  });
});

describe('this must not become a way to find other people’s submissions', () => {
  it('answers not_found for an empty token without touching the database', async () => {
    expect(await getFlotationPreview('   ')).toEqual({ status: 'not_found' });
    expect(mockPayloadFindByPk).not.toHaveBeenCalled();
  });

  it('answers not_found for an unknown token', async () => {
    mockPayloadFindByPk.mockResolvedValue(null);
    expect(await getFlotationPreview(TOKEN)).toEqual({ status: 'not_found' });
  });

  it('gives a malformed token the SAME answer, so ids cannot be probed', async () => {
    // A UUID column throws on a non-UUID value; that must not become a signal.
    mockPayloadFindByPk.mockRejectedValue(new Error('invalid input syntax for type uuid'));
    expect(await getFlotationPreview('not-a-uuid')).toEqual({ status: 'not_found' });
  });

  it('answers not_found when the submission never produced a lead', async () => {
    mockPayloadFindByPk.mockResolvedValue({ resulting_lead_id: null });
    expect(await getFlotationPreview(TOKEN)).toEqual({ status: 'not_found' });
    expect(mockRecordFindOne).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the lead that submission created', async () => {
    await getFlotationPreview(TOKEN);
    expect(mockRecordFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { lead_id: 2736 } }),
    );
  });
});
