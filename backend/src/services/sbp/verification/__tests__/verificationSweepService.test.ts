import {
  COOLDOWN_HOURS,
  DEFAULT_BATCH,
  runVerificationSweep,
  sweepBatchSize,
  sweepMode,
} from '../verificationSweepService';

const mockCandidates = jest.fn();
const mockVerify = jest.fn();

jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockCandidates(...a) } }));
jest.mock('../buildVerificationService', () => ({ verifyBuildFromRepo: (...a: unknown[]) => mockVerify(...a) }));

/**
 * THE SWEEP'S CHOICE AND ITS RESTRAINT.
 *
 * Two things here are worth more than the happy path.
 *
 * `report_only` MUST NOT CALL THE VERIFIER. `verifyBuildFromRepo` latches stories verified and
 * awards XP, and 34 projects with open stories have never been verified at all, so a first run
 * that actually verified would fire a burst of awards across dormant projects. The middle mode
 * exists to measure the choice with no write of any kind, and a test that only checked its
 * return value would not notice if it quietly started verifying.
 *
 * THE ORDERING IS IN THE SQL, so the SQL is asserted as text. `student_tasks.updated_at` was the
 * obvious column and is unusable: 93 production rows share one identical value because a bulk
 * write stomped it. Ordering by it would make the sweep pick nearly arbitrary projects while
 * reporting that it picked the stalest, and no behavioural test on mocked rows would catch that,
 * because the mock returns whatever order it is given.
 */

const rows = (...r: Array<{ project_id: string; open_stories: number; last_checked: string | null }>) =>
  mockCandidates.mockResolvedValue(r);

beforeEach(() => {
  mockCandidates.mockReset();
  mockVerify.mockReset();
  mockVerify.mockResolvedValue({ ok: true, reason: null });
});

describe('the sweep flag', () => {
  it('is off unless switched on by an exact value', () => {
    expect(sweepMode({})).toBe('off');
    expect(sweepMode({ STORY_VERIFICATION_SWEEP: 'on' })).toBe('on');
    expect(sweepMode({ STORY_VERIFICATION_SWEEP: 'report_only' })).toBe('report_only');
    for (const v of ['ON', 'true', '1', 'yes', 'enabled', '']) {
      expect(sweepMode({ STORY_VERIFICATION_SWEEP: v })).toBe('off');
    }
  });

  it('bounds the batch, whatever it is handed', () => {
    expect(sweepBatchSize({})).toBe(DEFAULT_BATCH);
    expect(sweepBatchSize({ STORY_VERIFICATION_SWEEP_BATCH: '3' })).toBe(3);
    // A bound exists so one tick cannot become a stampede.
    expect(sweepBatchSize({ STORY_VERIFICATION_SWEEP_BATCH: '9999' })).toBe(25);
    for (const v of ['0', '-5', 'abc', '']) {
      expect(sweepBatchSize({ STORY_VERIFICATION_SWEEP_BATCH: v })).toBe(DEFAULT_BATCH);
    }
  });
});

describe('runVerificationSweep', () => {
  it('does nothing at all when off, and asks the database nothing', async () => {
    const out = await runVerificationSweep({ mode: 'off' });
    expect(out.skipped).toBe('mode_off');
    expect(out.candidates).toEqual([]);
    expect(mockCandidates).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('report_only picks a batch and NEVER calls the verifier', async () => {
    rows(
      { project_id: 'p1', open_stories: 18, last_checked: null },
      { project_id: 'p2', open_stories: 6, last_checked: '2026-08-21T01:36:28.627Z' },
    );
    const out = await runVerificationSweep({ mode: 'report_only', batchSize: 5 });
    expect(out.mode).toBe('report_only');
    expect(out.candidates.map((c) => c.project_id)).toEqual(['p1', 'p2']);
    expect(out.verified).toEqual([]);
    // The assertion that matters.
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('verifies the batch when on, and reports what came back', async () => {
    rows(
      { project_id: 'p1', open_stories: 1, last_checked: null },
      { project_id: 'p2', open_stories: 2, last_checked: '2026-09-01T00:00:00.000Z' },
    );
    mockVerify
      .mockResolvedValueOnce({ ok: true, reason: null })
      .mockResolvedValueOnce({ ok: false, reason: 'No workspace repo is provisioned.' });

    const out = await runVerificationSweep({ mode: 'on', batchSize: 5 });
    expect(mockVerify).toHaveBeenCalledTimes(2);
    expect(out.verified).toEqual(['p1']);
    expect(out.failed).toEqual([{ project_id: 'p2', reason: 'No workspace repo is provisioned.' }]);
  });

  it('lets the rest of the batch run when one project throws', async () => {
    // The verifier is documented to classify every expected state, so a throw is a defect in it.
    // A defect on one project must not cost the other four their turn.
    rows(
      { project_id: 'p1', open_stories: 1, last_checked: null },
      { project_id: 'p2', open_stories: 1, last_checked: null },
      { project_id: 'p3', open_stories: 1, last_checked: null },
    );
    mockVerify
      .mockRejectedValueOnce(new Error('database went away'))
      .mockResolvedValueOnce({ ok: true, reason: null })
      .mockResolvedValueOnce({ ok: true, reason: null });

    const out = await runVerificationSweep({ mode: 'on' });
    expect(out.verified).toEqual(['p2', 'p3']);
    expect(out.failed).toEqual([{ project_id: 'p1', reason: 'database went away' }]);
  });

  it('reports a failed candidate query instead of throwing out of a cron tick', async () => {
    mockCandidates.mockRejectedValue(new Error('relation "student_tasks" does not exist'));
    const out = await runVerificationSweep({ mode: 'on' });
    expect(out.skipped).toBe('query_failed');
    expect(out.reason).toContain('student_tasks');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('says so when there is nothing overdue', async () => {
    rows();
    const out = await runVerificationSweep({ mode: 'on' });
    expect(out.skipped).toBe('no_candidates');
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it('passes the batch size to the query rather than slicing afterwards', async () => {
    rows({ project_id: 'p1', open_stories: 1, last_checked: null });
    await runVerificationSweep({ mode: 'report_only', batchSize: 3 });
    const [, opts] = mockCandidates.mock.calls[0];
    expect((opts as { replacements: { limit: number } }).replacements.limit).toBe(3);
  });
});

describe('the ordering signal, asserted against the SQL itself', () => {
  const sqlOf = async (): Promise<string> => {
    rows({ project_id: 'p1', open_stories: 1, last_checked: null });
    await runVerificationSweep({ mode: 'report_only' });
    return String(mockCandidates.mock.calls[0][0]);
  };

  it('orders by the verifier\'s own checked_at, never by the stomped updated_at column', async () => {
    const sql = await sqlOf();
    expect(sql).toContain("verification_json ->> 'checked_at'");
    // The measured trap: 93 production rows share one `updated_at`, so ordering by it would be
    // arbitrary. If this ever reappears in the ordering, the sweep is lying about its choice.
    expect(sql).not.toMatch(/ORDER BY[\s\S]*updated_at/i);
  });

  it('puts never-verified projects at the head of the queue', async () => {
    // 34 projects with open stories have never been verified. Those are more overdue than
    // anything with a timestamp, and NULLS FIRST is what says so.
    expect(await sqlOf()).toMatch(/ORDER BY\s+last_checked\s+ASC\s+NULLS FIRST/i);
  });

  it('only ever considers projects that still have open stories', async () => {
    const sql = await sqlOf();
    expect(sql).toMatch(/HAVING COUNT\(\*\) - COUNT\(verified_at\) > 0/);
  });

  it('respects a cooldown, so the push path always wins', async () => {
    const sql = await sqlOf();
    expect(sql).toContain(`INTERVAL '1 hour' * ${COOLDOWN_HOURS}`);
    expect(sql).toContain('last_checked IS NULL');
  });
});
