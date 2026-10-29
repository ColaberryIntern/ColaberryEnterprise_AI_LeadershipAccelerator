/**
 * The two queries regeneration adds, driven against a mocked Sequelize.
 *
 * `draftRepository` had no tests of its own: it was covered only by the source-level guards
 * in `draftsCannotSend.test.ts`, which can prove a statement is shaped safely but not that
 * it produces the right answer. These two functions need the second kind of check, because
 * both have a case where the obvious implementation is quietly wrong:
 *
 *   - `recommitDraft` must leave a row it did not match ALONE and say so, rather than
 *     reporting a supersede that never happened.
 *   - `loadDraftHistory` cannot read the gate verdict off the status for a superseded row,
 *     because superseding overwrote the status that carried it.
 */

const query = jest.fn();
const transaction = jest.fn();

jest.mock('../../../../config/database', () => ({
  sequelize: {
    query: (...args: unknown[]) => query(...args),
    transaction: (cb: (t: unknown) => unknown) => transaction(cb),
  },
}));

import {
  EXPLORER_DRAFT_REJECTED_STATUS,
  EXPLORER_DRAFT_STATUS,
  EXPLORER_DRAFT_SUPERSEDED_STATUS,
  type PersistDraftInput,
} from '../draftContracts';
import { loadDraftHistory, recommitDraft } from '../draftRepository';

beforeEach(() => {
  query.mockReset();
  transaction.mockReset();
  // Run the callback immediately with a sentinel transaction, so every query this module
  // issues inside it can be inspected for having been handed that sentinel.
  transaction.mockImplementation((cb: (t: unknown) => unknown) => cb('TX'));
});

function input(over: Partial<PersistDraftInput> = {}): PersistDraftInput {
  return {
    lead_id: 42,
    campaign_id: 'c1',
    step_index: 0,
    subject: 'Subject',
    body: '<p>Body</p>',
    to_email: 'dana@example.com',
    ai_instructions: 'instructions',
    status: EXPLORER_DRAFT_STATUS,
    metadata: { explorer_decision_id: 'd1' },
    ...over,
  } as PersistDraftInput;
}

describe('recommitDraft', () => {
  it('supersedes, inserts and re-points, all inside one transaction', async () => {
    query
      .mockResolvedValueOnce([{ id: 'se-v1' }]) // supersede
      .mockResolvedValueOnce([{ id: 'se-v2' }]) // insert
      .mockResolvedValueOnce([]); // re-point the decision

    const out = await recommitDraft(input(), 'd1', 'se-v1');

    expect(out).toEqual({ id: 'se-v2', supersededId: 'se-v1' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(3);
    for (const call of query.mock.calls) {
      expect(call[1]).toMatchObject({ transaction: 'TX' });
    }
  });

  it('narrows the supersede to the two draft statuses, so it cannot touch the send queue', async () => {
    query
      .mockResolvedValueOnce([{ id: 'se-v1' }])
      .mockResolvedValueOnce([{ id: 'se-v2' }])
      .mockResolvedValueOnce([]);

    await recommitDraft(input(), 'd1', 'se-v1');

    const [sql, opts] = query.mock.calls[0] as [string, { replacements: Record<string, string> }];
    expect(sql).toContain('UPDATE scheduled_emails');
    expect(sql).toContain('AND status IN (:draftStatus, :rejectedStatus)');
    expect(opts.replacements).toMatchObject({
      supersededStatus: EXPLORER_DRAFT_SUPERSEDED_STATUS,
      draftStatus: EXPLORER_DRAFT_STATUS,
      rejectedStatus: EXPLORER_DRAFT_REJECTED_STATUS,
    });
    // The status the sender claims must not appear among the rows this can match.
    expect(Object.values(opts.replacements)).not.toContain('pending');
  });

  it('reports supersededId as null when the predicate matched nothing', async () => {
    query
      .mockResolvedValueOnce([]) // already superseded by a previous click
      .mockResolvedValueOnce([{ id: 'se-v3' }])
      .mockResolvedValueOnce([]);

    const out = await recommitDraft(input(), 'd1', 'se-v1');

    // The new draft still exists; the claim that something was superseded does not.
    expect(out).toEqual({ id: 'se-v3', supersededId: null });
  });

  it('refuses the sender-claimed status before issuing any query', async () => {
    await expect(recommitDraft(input({ status: 'pending' as never }), 'd1', 'se-v1')).rejects.toThrow(
      /sender-claimed status/,
    );
    expect(query).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('throws rather than re-pointing the decision when the insert returns no id', async () => {
    query
      .mockResolvedValueOnce([{ id: 'se-v1' }])
      .mockResolvedValueOnce([]); // insert returned nothing

    await expect(recommitDraft(input(), 'd1', 'se-v1')).rejects.toThrow(/returned no id/);
    // Two queries, never the third: the decision is not left pointing at nothing.
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('loadDraftHistory', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'se-1',
    subject: 'S',
    body: 'B',
    status: EXPLORER_DRAFT_STATUS,
    step_index: 0,
    metadata: { model: 'gpt-x', quality_gate: { valid: true, issues: [], auto_fixed: [] } },
    created_at: new Date('2026-10-28T00:00:00.000Z'),
    is_current: false,
    ...over,
  });

  it('numbers versions from one, oldest first, and marks the current one', async () => {
    query.mockResolvedValueOnce([
      row({ id: 'se-1', status: EXPLORER_DRAFT_SUPERSEDED_STATUS }),
      row({ id: 'se-2', is_current: true }),
    ]);

    const history = await loadDraftHistory('d1');

    expect(history.map((v) => [v.version, v.scheduled_email_id, v.current, v.superseded])).toEqual([
      [1, 'se-1', false, true],
      [2, 'se-2', true, false],
    ]);
  });

  it('keys on the decision id in metadata, not on the decision’s current pointer', async () => {
    // The pointer names only the newest version, so reading history through it would always
    // return exactly one row.
    query.mockResolvedValueOnce([]);

    await loadDraftHistory('d1');

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain("se.metadata->>'explorer_decision_id' = :decisionId");
    expect(sql).toContain('ORDER BY se.created_at ASC');
  });

  it('reads the gate verdict from metadata for a superseded row, because the status was overwritten', async () => {
    query.mockResolvedValueOnce([
      row({
        status: EXPLORER_DRAFT_SUPERSEDED_STATUS,
        metadata: { quality_gate: { valid: true, issues: [], auto_fixed: [] } },
      }),
      row({
        id: 'se-2',
        status: EXPLORER_DRAFT_SUPERSEDED_STATUS,
        metadata: { quality_gate: { valid: false, issues: ['ungrounded date'], auto_fixed: [] } },
      }),
    ]);

    const history = await loadDraftHistory('d1');

    // Both rows now carry the same status. Deriving the verdict from it, as the
    // single-row reader correctly does, would report both as failures.
    expect(history[0].passed_quality_gate).toBe(true);
    expect(history[1].passed_quality_gate).toBe(false);
    expect(history[1].issues).toEqual(['ungrounded date']);
  });

  it('still derives the verdict from the status for a live row', async () => {
    query.mockResolvedValueOnce([
      row({ status: EXPLORER_DRAFT_REJECTED_STATUS, metadata: { quality_gate: { valid: true } } }),
    ]);

    const history = await loadDraftHistory('d1');

    // A live row's status is the authority, and it disagrees with the stored flag here on
    // purpose: the status is what the rest of the system keys on.
    expect(history[0].passed_quality_gate).toBe(false);
  });

  it('parses metadata that arrives as a JSON string', async () => {
    query.mockResolvedValueOnce([
      row({ metadata: JSON.stringify({ model: 'gpt-y', quality_gate: { valid: true } }) }),
    ]);

    const history = await loadDraftHistory('d1');
    expect(history[0].model).toBe('gpt-y');
  });

  it('survives a row with no metadata at all', async () => {
    query.mockResolvedValueOnce([row({ metadata: null, created_at: null })]);

    const history = await loadDraftHistory('d1');

    expect(history[0].issues).toEqual([]);
    expect(history[0].model).toBeNull();
    expect(history[0].created_at).toBeNull();
    expect(history[0].fact_set_present).toBe(false);
  });

  it('returns an empty list for a decision that has never been drafted', async () => {
    query.mockResolvedValueOnce([]);
    expect(await loadDraftHistory('d1')).toEqual([]);
  });
});
