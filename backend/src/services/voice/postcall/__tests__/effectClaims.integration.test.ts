/**
 * VS3.2 per-effect claims against a REAL Postgres (the CI integration tier): one winner under
 * concurrency, a fresh claim blocks, a stale claim (lost process / lost DB response) is reclaimable,
 * done is final, release gives it back.
 *
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts effectClaims.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[effectClaims.integration] SKIPPED: no DATABASE_URL. See the header.');
}
jest.setTimeout(120_000);

describeIfDb('post-call effect claims against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let E: typeof import('../effectClaims');
  const LOG = '99999999-9999-4999-8999-999999999991';
  const state = async (effect: string) => {
    const [[r]] = await sequelize.query(`SELECT metadata->'postcall'->'${effect}'->>'state' AS s FROM communication_logs WHERE id = '${LOG}'`) as [Array<{ s: string | null }>, unknown];
    return r.s;
  };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    E = await import('../effectClaims');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS communication_logs (
      id UUID PRIMARY KEY, lead_id INTEGER, channel VARCHAR(20) NOT NULL DEFAULT 'voice', status VARCHAR(30) NOT NULL DEFAULT 'pending',
      provider VARCHAR(50), provider_message_id VARCHAR(200), provider_response JSONB, metadata JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
    await sequelize.query(`DELETE FROM communication_logs WHERE id = '${LOG}'`);
    await sequelize.query(`INSERT INTO communication_logs (id, metadata) VALUES ('${LOG}', '{"source": "voice-studio"}'::jsonb)`);
  });
  afterAll(async () => {
    await sequelize.query(`DELETE FROM communication_logs WHERE id = '${LOG}'`);
    await sequelize.close();
  });

  it('20 concurrent claims of one effect: exactly one wins; other metadata is kept', async () => {
    const r = await Promise.all(Array.from({ length: 20 }, () => E.claimEffect(LOG, 'timeline')));
    expect(r.filter(Boolean).length).toBe(1);
    expect(await state('timeline')).toBe('claimed');
    const [[m]] = await sequelize.query(`SELECT metadata->>'source' AS s FROM communication_logs WHERE id = '${LOG}'`) as [Array<{ s: string }>, unknown];
    expect(m.s).toBe('voice-studio');
  });

  it('a fresh claim blocks; a claim older than the lease is presumed lost and reclaimable once', async () => {
    expect(await E.claimEffect(LOG, 'timeline')).toBe(false);
    const later = new Date(Date.now() + E.EFFECT_LEASE_MS + 60_000);
    const r = await Promise.all([E.claimEffect(LOG, 'timeline', later), E.claimEffect(LOG, 'timeline', later)]);
    expect(r.filter(Boolean).length).toBe(1);
  });

  it('done is final, even after the lease', async () => {
    await E.markEffectDone(LOG, 'timeline');
    expect(await state('timeline')).toBe('done');
    expect(await E.claimEffect(LOG, 'timeline', new Date(Date.now() + 10 * E.EFFECT_LEASE_MS))).toBe(false);
  });

  it('effects are independent; release gives a claim back (counted), but never undoes done', async () => {
    expect(await E.claimEffect(LOG, 'extraction')).toBe(true);
    await E.releaseEffect(LOG, 'extraction');
    expect(await state('extraction')).toBe('released');
    expect(await E.claimEffect(LOG, 'extraction')).toBe(true);
    await E.releaseEffect(LOG, 'timeline'); // done: untouched
    expect(await state('timeline')).toBe('done');
  });

  it('bounded retry: the third attempt is the last; a fourth claim is refused', async () => {
    await E.releaseEffect(LOG, 'extraction'); // attempts = 2 so far
    expect(await E.claimEffect(LOG, 'extraction')).toBe(true); // 3
    await E.releaseEffect(LOG, 'extraction');
    expect(await E.claimEffect(LOG, 'extraction')).toBe(false);
    const [[r]] = await sequelize.query(`SELECT metadata->'postcall'->'extraction'->>'attempts' AS a FROM communication_logs WHERE id = '${LOG}'`) as [Array<{ a: string }>, unknown];
    expect(r.a).toBe('3');
  });

  it('markTranscriptReview / clearTranscriptReview set and clear the review state on the log', async () => {
    await E.markTranscriptReview(LOG, 'extraction_failed');
    const read = async () => (await sequelize.query(`SELECT provider_response->>'transcript_state' AS s, provider_response->>'transcript_state_reason' AS r FROM communication_logs WHERE id = '${LOG}'`) as [Array<{ s: string | null; r: string | null }>, unknown])[0][0];
    expect(await read()).toEqual({ s: 'pending_review', r: 'extraction_failed' });
    await E.clearTranscriptReview(LOG);
    expect(await read()).toEqual({ s: 'present', r: null });
  });

  it('markEffectDone inside a rolled-back transaction leaves the effect unmarked (atomic with its write)', async () => {
    await sequelize.query(`UPDATE communication_logs SET metadata = metadata #- '{postcall,extraction}' WHERE id = '${LOG}'`);
    const t = await sequelize.transaction();
    await E.markEffectDone(LOG, 'extraction', t);
    await t.rollback();
    expect(await state('extraction')).toBeNull();
  });
});
