/**
 * The gate for R3's third acceptance criterion: "A test fails if a cancellation path forgets
 * the reason."
 *
 * It has two halves, and both are necessary.
 *
 *   BEHAVIOUR — the helper really does write the reason, to the key the readers read, and
 *   merges the JSONB column rather than replacing it.
 *
 *   COVERAGE — no NEW cancellation path can be added without a reason. This is the half that
 *   keeps working after everyone involved has forgotten the ticket: it walks the backend
 *   source and fails if any file outside a named allowlist writes a cancelling status onto
 *   `scheduled_emails` directly instead of going through the helper.
 *
 * WHY A DIRECTORY WALK AND NOT `git grep`. Four existing suites spawn a synchronous repo-wide
 * `git grep` inside a test. Measured on an idle machine those spawns ranged 858-2303 ms, a
 * 2.7x spread with nothing competing, and they are the least stable thing in the backend
 * suite. Adding a fifth would make this test part of that problem. `fs.readdirSync` over
 * `backend/src` costs a fraction of it and cannot be destabilised by disk contention in the
 * same way.
 *
 * WHY THERE IS A POSITIVE CONTROL. A scanner that matches nothing passes this test whether
 * the codebase is clean or the scanner is broken, and a "must find nothing" assertion on its
 * own cannot tell those apart. So the coverage test first proves the scanner CAN find a
 * cancelling write, by pointing it at the allowlisted files that are known to contain one. If
 * that control finds nothing, the scan is wrong and the test says so instead of passing.
 */
import fs from 'fs';
import path from 'path';
import { databaseModuleMock } from '../../../__tests__/testSupport/configMocks';

jest.mock('../../../config/database', () => databaseModuleMock(['query']));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ScheduledEmail = require('../../../models/ScheduledEmail').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  cancelScheduledMessage,
  cancelScheduledMessagesWhere,
  pauseScheduledMessagesWhere,
} = require('../cancelScheduledMessage');

/** Pull the raw SQL out of whatever Sequelize literal the helper built for `metadata`. */
function literalSql(value: unknown): string {
  return String((value as { val?: unknown })?.val ?? '');
}

describe('R3 — the helper records a machine-readable reason', () => {
  let update: jest.SpyInstance;

  beforeEach(() => {
    update = jest.spyOn(ScheduledEmail, 'update').mockResolvedValue([1] as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes the reason to blocked_reason, which is the key the readers actually read', async () => {
    await cancelScheduledMessage({ id: 'abc' } as any, 'lead_opted_out');

    const [values] = update.mock.calls[0];
    expect(values.status).toBe('cancelled');
    const sql = literalSql(values.metadata);
    expect(sql).toContain('blocked_reason');
    expect(sql).toContain('lead_opted_out');
    // The key NOTHING reads. unsubscribeEnforcementService used to write this one instead,
    // which is why its reason was recorded and still surfaced downstream as 'unknown'.
    expect(sql).not.toContain('cancelled_reason');
  });

  it('MERGES the metadata column instead of replacing it', async () => {
    await cancelScheduledMessagesWhere({ campaign_id: 'c1' }, 'campaign_archived');

    const sql = literalSql(update.mock.calls[0][0].metadata);
    // Without the COALESCE/|| merge, a plain object would overwrite the whole JSONB column
    // and destroy unrelated keys (cohort_start_date, quality_gate, approved_by...).
    expect(sql).toContain("COALESCE(metadata, '{}'::jsonb)");
    expect(sql).toContain('||');
  });

  it('refuses to relabel a row that is already terminal', async () => {
    await cancelScheduledMessage({ id: 'abc' } as any, 'lead_opted_out');

    const where = update.mock.calls[0][1].where as any;
    // Idempotency: a second sweep must not overwrite the first reason, so the UPDATE filters
    // on the statuses it is allowed to move OUT of rather than matching any row by id.
    const statuses = where.status[Object.getOwnPropertySymbols(where.status)[0]]
      ?? (where.status as any)[Symbol.for('in')];
    expect(statuses).toBeDefined();
    expect(statuses).not.toContain('sent');
    expect(statuses).not.toContain('cancelled');
  });

  it('carries extra context keys alongside the reason', async () => {
    await cancelScheduledMessage(
      { id: 'abc' } as any,
      'test_action_non_test_domain',
      { blocked_email: 'someone@example.com' },
    );

    const sql = literalSql(update.mock.calls[0][0].metadata);
    expect(sql).toContain('blocked_email');
    expect(sql).toContain('someone@example.com');
  });

  it('pauses only pending rows, and says why', async () => {
    await pauseScheduledMessagesWhere({ campaign_id: 'c1' }, 'campaign_paused');

    const [values, options] = update.mock.calls[0];
    expect(values.status).toBe('paused');
    expect(literalSql(values.metadata)).toContain('campaign_paused');
    // A row mid-send cannot be un-sent, so pausing is restricted to `pending`.
    expect((options.where as any).status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// COVERAGE: no new reason-less cancellation path can be introduced
// ---------------------------------------------------------------------------

const SRC = path.resolve(__dirname, '../../..');

/**
 * Files permitted to write a cancelling status directly, each for a stated reason.
 *
 * This list is the test's real content. Adding to it is a deliberate act that has to be
 * justified in review; the default for a new cancellation path is to call the helper.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; why: string }> = [
  {
    file: 'services/scheduling/cancelScheduledMessage.ts',
    why: 'the helper itself — it is the one place allowed to perform the write',
  },
  {
    file: 'services/explorerGrowth/drafts/draftRepository.ts',
    why: 'raw SQL whose RETURNING clause inside a transaction is what proves the supersession '
      + 'took; it writes blocked_reason itself. Routing it through the helper would trade a '
      + 'concurrency guard for stylistic consistency',
  },
  {
    file: 'services/agents/tools/agentEmailInboxService.ts',
    why: 'a guarded single UPDATE whose affected-row count resolves two reviewers acting at '
      + 'once; it writes blocked_reason itself via the reason parameter',
  },
];

const CANCELLING_STATUSES = ['cancelled', 'paused', 'explorer_draft_superseded'];

/**
 * Find cancelling writes aimed at THIS table.
 *
 * The first version of this scanner asked only whether a file contained a cancelling status
 * literal anywhere AND mentioned ScheduledEmail anywhere. It reported twelve offenders and
 * every one was a false positive: agents and campaigns have their own `status: 'paused'`
 * columns, and the two retry agents build audit payloads like
 * `after_state: { status: 'cancelled' }` that are objects in a log, not database writes. A
 * guard that cries wolf gets deleted, so the match is scoped to the statement.
 *
 * Two real shapes, each located first and then inspected within its own span:
 *
 *   A. `ScheduledEmail.update({ status: 'cancelled', ... })` — the Sequelize object form,
 *      where all 21 reason-less sites lived.
 *   B. `UPDATE scheduled_emails ... SET status = ...` — raw SQL. Flagged when the statement
 *      moves the row to a cancelling status WITHOUT mentioning `blocked_reason`. That
 *      wording matters: it is the invariant, not the style. It is what caught the
 *      auto-expiry sweep, which wrote `expired_reason` — a key nothing reads — and so
 *      contributed rows to the unexplained population while looking explained.
 */
function findCancelWrites(text: string): 'object-form' | 'raw-sql-without-reason' | null {
  // A. Object form, inspected within the argument span of the update call.
  const objectForm = /ScheduledEmail\.update\s*\(/g;
  let m = objectForm.exec(text);
  while (m) {
    const span = text.slice(m.index, m.index + 400);
    if (CANCELLING_STATUSES.some((s) => new RegExp(`status\\s*:\\s*'${s}'`).test(span))) {
      return 'object-form';
    }
    m = objectForm.exec(text);
  }

  // B. Raw SQL, inspected within the statement span.
  const rawForm = /UPDATE\s+scheduled_emails/gi;
  m = rawForm.exec(text);
  while (m) {
    const span = text.slice(m.index, m.index + 900);
    const setsStatus = /SET\s+status\s*=/i.test(span);
    // A variable name counts: `SET status = :supersededStatus` is still a cancelling write,
    // and only matching quoted literals would let a parameterised one through.
    const cancelling = CANCELLING_STATUSES.some(
      (s) => span.includes(`'${s}'`) || new RegExp(s.replace(/_/g, '[_a-zA-Z]*'), 'i').test(span)
    );
    if (setsStatus && cancelling && !span.includes('blocked_reason')) {
      return 'raw-sql-without-reason';
    }
    m = rawForm.exec(text);
  }

  return null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|js)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Tests and fixtures legitimately construct rows in these states to assert on them. */
function isTestFile(rel: string): boolean {
  return /__tests__|\.test\.|\/fixtures\/|testSupport/.test(rel);
}

describe('R3 — coverage: every cancellation path goes through the helper', () => {
  const files = walk(SRC);
  const offenders: string[] = [];
  const allowlistHits: string[] = [];

  for (const full of files) {
    const rel = path.relative(SRC, full).split(path.sep).join('/');
    if (isTestFile(rel)) continue;
    const hit = findCancelWrites(fs.readFileSync(full, 'utf8'));
    if (!hit) continue;
    if (ALLOWLIST.some((a) => a.file === rel)) allowlistHits.push(rel);
    else offenders.push(`${rel} (${hit})`);
  }

  it('the scanner can actually find a cancelling write — POSITIVE CONTROL', () => {
    // If this fails, the regex or the walk is broken and the assertion below proves nothing.
    expect(files.length).toBeGreaterThan(500);
    expect(allowlistHits).toContain('services/scheduling/cancelScheduledMessage.ts');
  });

  it('no file outside the allowlist cancels a scheduled message directly', () => {
    expect(offenders).toEqual([]);
  });
});
