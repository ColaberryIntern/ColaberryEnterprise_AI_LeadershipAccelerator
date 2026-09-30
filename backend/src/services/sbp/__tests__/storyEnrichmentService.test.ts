/**
 * Apply one story's enrichment exactly once.
 *
 * The brief's Scenario C, step by step: a later story emits one event, the
 * truth gains the supported fact with provenance, a replay changes nothing,
 * no backfill ran. Plus the race the ledger's unique key exists for.
 */
const mockLedgerFindOne = jest.fn();
const mockLedgerCreate = jest.fn();
const mockLoadAtRevision = jest.fn();
const mockSaveEnriched = jest.fn();

jest.mock('../../../models/StoryTruthEnrichmentRecord', () => ({
  __esModule: true,
  default: {
    findOne: (...a: any[]) => mockLedgerFindOne(...a),
    create: (...a: any[]) => mockLedgerCreate(...a),
  },
}));
jest.mock('../intakeTruthStore', () => ({
  loadIntakeTruthAtRevision: (...a: any[]) => mockLoadAtRevision(...a),
  saveEnrichedTruth: (...a: any[]) => mockSaveEnriched(...a),
}));

import { applyStoryEnrichment } from '../storyEnrichmentService';
import type { StoryTruthEnrichment } from '../storyEnrichmentContract';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

const fact = (dimension: UnderstandingItem['dimension'], value: string, provenance: UnderstandingItem['provenance'] = 'source_message'): UnderstandingItem => ({
  dimension, value, classification: 'FACT', provenance, source_quote: value,
});

const event = (over: Partial<StoryTruthEnrichment> = {}): StoryTruthEnrichment => ({
  schemaVersion: '1',
  projectId: PROJECT,
  storyId: 'STORY-004',
  projectTruthBaseRevision: 1,
  observedAt: '2026-09-11T12:00:00.000Z',
  sourceCommitSha: 'abc1234',
  factProposals: [{ dimension: 'integrations', value: 'Reads open tickets from the Zendesk API.', evidence: 'src/zendesk/client.ts', classification: 'FACT' }],
  decisions: [],
  limitations: [],
  demonstrationEvidence: [],
  measurementEvents: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockLedgerFindOne.mockResolvedValue(null);
  mockLedgerCreate.mockImplementation(async (attrs: any) => ({ id: 'l1', ...attrs }));
  mockLoadAtRevision.mockResolvedValue({ revision: 1, items: [fact('problem', 'A tool that triages support tickets.')] });
  mockSaveEnriched.mockImplementation(async (_p: string, _items: unknown, expected: number | null) => (expected ?? 0) + 1);
});

describe('Scenario C: a later story discovers missing truth', () => {
  it('merges the supported fact with repo_evidence provenance and bumps the revision', async () => {
    const r = await applyStoryEnrichment(PROJECT, event());

    expect(r.outcome).toBe('merged');
    expect(r.revision).toBe(2);
    expect(r.counts).toMatchObject({ added: 1, refused: 0 });

    const [, items, expected] = mockSaveEnriched.mock.calls[0];
    expect(expected).toBe(1);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ dimension: 'integrations', provenance: 'repo_evidence', source_quote: 'src/zendesk/client.ts' });
  });

  it('writes one ledger row saying what happened, with the event kept whole', async () => {
    await applyStoryEnrichment(PROJECT, event(), { correlationId: '7d1c2f5e-0000-4000-8000-000000000001' });
    expect(mockLedgerCreate).toHaveBeenCalledTimes(1);
    const [row] = mockLedgerCreate.mock.calls[0];
    expect(row).toMatchObject({
      project_id: PROJECT, story_id: 'STORY-004', source_commit_sha: 'abc1234',
      base_revision: 1, merged_revision: 2, outcome: 'merged',
      correlation_id: '7d1c2f5e-0000-4000-8000-000000000001',
    });
    expect(row.idempotency_key).toMatch(/^[0-9a-f]{64}$/);
    expect(row.event.factProposals).toHaveLength(1);
  });

  it('a replay changes nothing: no merge, no save, no second row', async () => {
    mockLedgerFindOne.mockResolvedValue({ merged_revision: 2, created_at: new Date('2026-09-11T12:00:00Z') });
    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('replay');
    expect(r.revision).toBe(2);
    expect(mockLoadAtRevision).not.toHaveBeenCalled();
    expect(mockSaveEnriched).not.toHaveBeenCalled();
    expect(mockLedgerCreate).not.toHaveBeenCalled();
  });

  it('an event that adds nothing new is a no_op with no revision bump, and still gets a receipt', async () => {
    mockLoadAtRevision.mockResolvedValue({ revision: 3, items: [fact('integrations', 'Reads open tickets from the Zendesk API.', 'repo_evidence')] });
    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('no_op');
    expect(r.revision).toBe(3);
    expect(mockSaveEnriched).not.toHaveBeenCalled();
    expect(mockLedgerCreate.mock.calls[0][0]).toMatchObject({ outcome: 'no_op', merged_revision: null, base_revision: 3 });
  });

  it('an event the contract refuses entirely is recorded as refused, with the reasons', async () => {
    const r = await applyStoryEnrichment(PROJECT, event({
      factProposals: [{ dimension: 'success_definition', value: 'Zero backlog.', evidence: 'README.md', classification: 'FACT' }],
    }));
    expect(r.outcome).toBe('refused');
    expect(r.refused[0].reason).toMatch(/cannot establish/);
    expect(mockLedgerCreate.mock.calls[0][0]).toMatchObject({ outcome: 'refused' });
    expect(mockLedgerCreate.mock.calls[0][0].refused).toHaveLength(1);
  });

  it('no backfill: a project with no truth row gets one created from what this story supports', async () => {
    mockLoadAtRevision.mockResolvedValue(null);
    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('merged');
    expect(mockSaveEnriched).toHaveBeenCalledWith(PROJECT, expect.any(Array), null);
    expect(r.revision).toBe(1);
  });
});

describe('what it refuses to do', () => {
  it('refuses a file that names a different project, and writes nothing', async () => {
    const r = await applyStoryEnrichment(PROJECT, event({ projectId: 'aced5b39-0000-4000-8000-000000000001' }));
    expect(r.outcome).toBe('refused');
    expect(mockLoadAtRevision).not.toHaveBeenCalled();
    expect(mockLedgerCreate).not.toHaveBeenCalled();
  });
});

describe('concurrency', () => {
  it('re-merges once against newer truth when the revision moved underneath it', async () => {
    mockLoadAtRevision
      .mockResolvedValueOnce({ revision: 1, items: [] })
      .mockResolvedValueOnce({ revision: 2, items: [fact('actors', 'Priya.')] });
    mockSaveEnriched
      .mockResolvedValueOnce(null)   // CAS lost
      .mockResolvedValueOnce(3);     // CAS won on the re-merge

    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('merged');
    expect(r.revision).toBe(3);
    expect(mockSaveEnriched).toHaveBeenNthCalledWith(2, PROJECT, expect.any(Array), 2);
    // The second merge was against the newer truth: Priya is still there.
    const [, items] = mockSaveEnriched.mock.calls[1];
    expect(items.some((i: UnderstandingItem) => i.value === 'Priya.')).toBe(true);
  });

  it('gives up as stale after one retry rather than spinning', async () => {
    mockSaveEnriched.mockResolvedValue(null);
    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('stale');
    expect(mockSaveEnriched).toHaveBeenCalledTimes(2);
    expect(mockLedgerCreate.mock.calls[0][0]).toMatchObject({ outcome: 'stale', merged_revision: null });
  });

  it('a race on the ledger key is reported as a replay, never as a second application', async () => {
    const err: any = new Error('duplicate key');
    err.name = 'SequelizeUniqueConstraintError';
    mockLedgerCreate.mockRejectedValue(err);
    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('replay');
  });

  it('a ledger failure other than the key does not undo the merge, and is logged', async () => {
    const errSpy = jest.spyOn(console, 'log');
    mockLedgerCreate.mockRejectedValue(new Error('disk full'));
    const r = await applyStoryEnrichment(PROJECT, event());
    expect(r.outcome).toBe('merged');
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('sbp_enrichment_ledger_failed'))).toBe(true);
  });
});
