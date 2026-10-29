/**
 * `scheduled_emails.status` must be wide enough for every status this repo writes.
 *
 * ## The defect this guards
 *
 * The model declared `STRING(20)`. The Explorer draft phase writes
 * `explorer_draft_rejected`, which is 23 characters. Postgres does not truncate an
 * over-long `varchar` - it raises `22001` - and that INSERT is inside the single
 * transaction that also stamps `explorer_journey_decisions.scheduled_email_id`. So the
 * commit would roll back and a refused draft would present as "nothing ever ran", which
 * is the exact ambiguity the draft phase was built to remove. It has never fired in
 * production only because that code is merged-but-undeployed and flag-gated.
 *
 * ## Why the decision logic is tested rather than the SQL
 *
 * A string-shape assertion over the statement array - the convention in the sibling
 * `ensure*` tests - cannot distinguish "widens a narrow column" from "narrows a wide one",
 * and narrowing is the one thing this module must never do. So the runner is injected and
 * the decision is driven directly: each branch is exercised, and the ALTER is asserted
 * ABSENT in every branch that must not issue one. That is what makes the "only ever
 * widens" claim a test result instead of a comment.
 */

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

import * as fs from 'fs';
import * as path from 'path';
import {
  ensureScheduledEmailStatusWidth,
  SCHEDULED_EMAIL_STATUS_WIDTH,
  STATUS_WIDTH_ALTER_SQL,
  STATUS_WIDTH_PROBE_SQL,
  type StatusWidthRunner,
} from '../ensureScheduledEmailStatusWidth';
import {
  EXPLORER_DRAFT_STATUS,
  EXPLORER_DRAFT_REJECTED_STATUS,
  SENDER_CLAIMED_STATUS,
} from '../../services/explorerGrowth/drafts/draftContracts';
import { activeBootCall, serverSourceText } from './helpers/bootCalls';

/** A runner whose probe answers with the given rows and whose execute succeeds. */
function makeRunner(rows: ReadonlyArray<{ len: number | null }>) {
  const probe = jest.fn().mockResolvedValue(rows);
  const execute = jest.fn().mockResolvedValue(undefined);
  const run: StatusWidthRunner = { probe, execute };
  return { run, probe, execute };
}

const modelSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'models', 'ScheduledEmail.ts'),
  'utf8',
);

describe('ensureScheduledEmailStatusWidth — the decision', () => {
  it('widens a column that is too narrow, and issues exactly the widening statement', async () => {
    const { run, probe, execute } = makeRunner([{ len: 20 }]);

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('widened');

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(STATUS_WIDTH_PROBE_SQL);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(STATUS_WIDTH_ALTER_SQL);
  });

  it('leaves a column that is already exactly wide enough alone', async () => {
    const { run, execute } = makeRunner([{ len: SCHEDULED_EMAIL_STATUS_WIDTH }]);

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('already_wide_enough');
    expect(execute).not.toHaveBeenCalled();
  });

  it('NEVER narrows a column that is wider than required', async () => {
    // The assertion that matters. A module written as an unconditional
    // `ALTER ... TYPE VARCHAR(32)` would pass every other test in this file and quietly
    // narrow a column somebody had deliberately widened.
    const { run, execute } = makeRunner([{ len: 64 }]);

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('already_wide_enough');
    expect(execute).not.toHaveBeenCalled();
  });

  it('treats an unbounded text column as already sufficient', async () => {
    // `character_maximum_length` is NULL for `text`. Reading NULL as 0 would issue an
    // ALTER that converts an unlimited column into a 32-character one.
    const { run, execute } = makeRunner([{ len: null }]);

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('unbounded');
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports a missing column instead of altering a table that has none', async () => {
    const { run, execute } = makeRunner([]);

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('column_absent');
    expect(execute).not.toHaveBeenCalled();
  });

  it('is idempotent: the second run over a widened column issues nothing', async () => {
    const first = makeRunner([{ len: 20 }]);
    await expect(ensureScheduledEmailStatusWidth(first.run)).resolves.toBe('widened');

    // Second boot sees the widened column.
    const second = makeRunner([{ len: SCHEDULED_EMAIL_STATUS_WIDTH }]);
    await expect(ensureScheduledEmailStatusWidth(second.run)).resolves.toBe('already_wide_enough');
    expect(second.execute).not.toHaveBeenCalled();
  });
});

describe('ensureScheduledEmailStatusWidth — failure never takes boot down', () => {
  it('returns failed, and alters nothing, when the probe raises', async () => {
    const probe = jest.fn().mockRejectedValue(new Error('relation does not exist'));
    const execute = jest.fn().mockResolvedValue(undefined);
    const run: StatusWidthRunner = { probe, execute };

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('failed');
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns failed when the alter itself raises', async () => {
    const probe = jest.fn().mockResolvedValue([{ len: 20 }]);
    const execute = jest.fn().mockRejectedValue(new Error('lock timeout'));
    const run: StatusWidthRunner = { probe, execute };

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBe('failed');
  });

  it('never rejects, because start() calls it bare and an uncontained throw stops the port binding', async () => {
    const probe = jest.fn().mockRejectedValue(new Error('boom'));
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const run: StatusWidthRunner = { probe, execute };

    await expect(ensureScheduledEmailStatusWidth(run)).resolves.toBeDefined();
  });
});

describe('the width fits every status the codebase writes', () => {
  it('fits the Explorer draft statuses', () => {
    expect(EXPLORER_DRAFT_STATUS.length).toBeLessThanOrEqual(SCHEDULED_EMAIL_STATUS_WIDTH);
    expect(EXPLORER_DRAFT_REJECTED_STATUS.length).toBeLessThanOrEqual(SCHEDULED_EMAIL_STATUS_WIDTH);
    expect(SENDER_CLAIMED_STATUS.length).toBeLessThanOrEqual(SCHEDULED_EMAIL_STATUS_WIDTH);
  });

  it('records WHY this module exists: the rejected status does not fit the old width of 20', () => {
    // If this ever fails because the status was renamed shorter, the module is no longer
    // load-bearing and this file should say so rather than quietly passing.
    expect(EXPLORER_DRAFT_REJECTED_STATUS.length).toBeGreaterThan(20);
  });

  it('fits every status named in the model column comment', () => {
    const comment = /comment:\s*\n?\s*'([^']+)'/.exec(
      modelSource.slice(modelSource.indexOf('status: {')),
    );
    expect(comment).not.toBeNull();

    const vocabulary = (comment as RegExpExecArray)[1]
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    expect(vocabulary.length).toBeGreaterThan(6);
    for (const status of vocabulary) {
      expect(status.length).toBeLessThanOrEqual(SCHEDULED_EMAIL_STATUS_WIDTH);
    }
  });

  it('keeps the model comment honest about the statuses that forced the widening', () => {
    const statusBlock = modelSource.slice(modelSource.indexOf('status: {'));
    expect(statusBlock).toContain(EXPLORER_DRAFT_STATUS);
    expect(statusBlock).toContain(EXPLORER_DRAFT_REJECTED_STATUS);
  });
});

describe('the model and the live column agree', () => {
  it('declares the same width the ensure module applies', () => {
    // The end anchor is searched FROM the start anchor: `processing_started_at` also
    // appears in the attributes interface above `.init()`, so an unanchored indexOf
    // slices backwards and yields an empty string that `toContain` cannot fail on.
    const statusAt = modelSource.indexOf('status: {');
    const statusBlock = modelSource.slice(
      statusAt,
      modelSource.indexOf('processing_started_at', statusAt),
    );

    expect(statusBlock.length).toBeGreaterThan(0);
    expect(statusBlock).toContain(`DataTypes.STRING(${SCHEDULED_EMAIL_STATUS_WIDTH})`);
  });

  it('points a reader at the module that changes the real column', () => {
    // A model edit alone changes nothing: there is no migration runner and
    // sync({ alter: true }) is off. Someone widening this again must find that out here.
    const statusBlock = modelSource.slice(modelSource.indexOf('status: {'));
    expect(statusBlock).toContain('ensureScheduledEmailStatusWidth');
  });
});

describe('boot wiring', () => {
  it('is called from start(), and not merely present as a commented-out line', () => {
    expect(activeBootCall('await ensureScheduledEmailStatusWidth()')).toBeGreaterThan(-1);
  });

  it('is imported in server.ts', () => {
    expect(serverSourceText()).toContain(
      "import { ensureScheduledEmailStatusWidth } from './db/ensureScheduledEmailStatusWidth'",
    );
  });

  it('runs before the scheduler that owns the draft-render cron is started', () => {
    // The draft render is a cron registered by startScheduler(). The widen is awaited
    // earlier in start(), so no render can fire against a narrow column. Moving the widen
    // below startScheduler() would reopen the window this module exists to close.
    const widen = activeBootCall('await ensureScheduledEmailStatusWidth()');
    const scheduler = activeBootCall('startScheduler()');

    expect(widen).toBeGreaterThan(-1);
    expect(scheduler).toBeGreaterThan(-1);
    expect(widen).toBeLessThan(scheduler);
  });
});
