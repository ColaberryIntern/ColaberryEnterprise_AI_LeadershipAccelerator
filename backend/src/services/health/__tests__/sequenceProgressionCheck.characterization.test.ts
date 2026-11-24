import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Characterization of the two checks T609 moved out of `systemHealthService.ts`.
 *
 * ─── WHAT A CHARACTERIZATION TEST IS FOR ────────────────────────────────────
 *
 * Neither function had a single test before this file: `systemHealthService.ts`
 * has no suite, and nothing else covers it. So the extraction had no safety net
 * at all, which is exactly when a "move" quietly becomes a rewrite. This pins
 * the behaviour that existed BEFORE the move, so the move is provably inert.
 *
 * ─── THE md5 PIN, AND WHY IT IS NORMALISED ──────────────────────────────────
 *
 * Each body's md5 is asserted against the file on disk. The text is normalised
 * to LF first, deliberately: `core.autocrlf=true` means these files are CRLF in
 * a Windows working tree and LF in the committed blob, so a raw byte hash would
 * pin the checkout style rather than the code and would fail for half the repo's
 * readers. Two suites in this repo already fail on Windows for precisely that
 * reason; this one will not join them.
 *
 * The pin is a tripwire, not a specification. If you deliberately change either
 * function, update the constant in the same commit and say why in the message -
 * that is the point at which someone should have to think.
 *
 * ─── THE CELL THAT EARNS ITS KEEP ───────────────────────────────────────────
 *
 * `checkSequenceProgression` resolves `../sequenceService` and `../../models`
 * with runtime `require`, inside a `try` whose `catch` only logs. Both paths had
 * to be re-pointed for the move. If either were wrong, MODULE_NOT_FOUND would be
 * swallowed there: the check would still push its warning, this suite would still
 * be green, and the auto-fix would silently never run again. So one cell mocks
 * that module and asserts the auto-fix branch REPORTED RECOVERED ROWS - a thing
 * that is only reachable through a require that resolved.
 */

const SRC_DIR = path.join(__dirname, '..');

/** The function body as shipped, LF-normalised: everything from `export async function` on. */
function shippedBody(file: string, fnName: string): string {
  const text = fs.readFileSync(path.join(SRC_DIR, file), 'utf8').replace(/\r\n/g, '\n');
  const marker = `export async function ${fnName}`;
  const start = text.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return text.slice(start + 'export '.length).replace(/\n+$/, '');
}

const md5 = (s: string): string => crypto.createHash('md5').update(s, 'utf8').digest('hex');

// ── the mocks the extracted code reaches for ────────────────────────────────
const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));

const scheduleNextStep = jest.fn();
jest.mock('../../sequenceService', () => ({ scheduleNextStep: (...a: unknown[]) => scheduleNextStep(...a) }));

const findByPk = jest.fn();
jest.mock('../../../models', () => ({ ScheduledEmail: { findByPk: (...a: unknown[]) => findByPk(...a) } }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkSequenceProgression } = require('../sequenceProgressionCheck');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkCampaignHealth } = require('../campaignHealthCheck');

type Check = { name: string; severity: string; detail: string; metric?: number; autoFixed?: string };

beforeEach(() => {
  query.mockReset();
  scheduleNextStep.mockReset();
  findByPk.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('the extracted bodies are the ones that left systemHealthService', () => {
  it('checkSequenceProgression is pinned (re-pinned by OH1s for its two deliberate query changes)', () => {
    const body = shippedBody('sequenceProgressionCheck.ts', 'checkSequenceProgression');
    // OH1s: was d35ab8ad0cb0b537ecb38e85d2268806 (the T609 move). Changed on purpose:
    // any next-step row counts as "not a gap", and pre-scheduled sequences are excluded.
    // 2026-11-24: was dbfda9e32e1a78e17f29c31d59e798b1 (OH1s). Changed on purpose:
    // audience-tagged follow-ups (attended/missed steps) are excluded as well.
    expect(md5(body)).toBe('d21851e1a3ac47790728b9f5ac559db2');
    // the two forced edits, asserted as the ONLY path change - an unqualified
    // `./sequenceService` or `../models` here would resolve from the wrong directory
    expect(body).toContain("require('../sequenceService')");
    expect(body).toContain("require('../../models')");
    expect(body).not.toContain("require('./sequenceService')");
    expect(body).not.toContain("require('../models')");
  });

  it('checkCampaignHealth is byte-identical to what left, with no path change at all', () => {
    const body = shippedBody('campaignHealthCheck.ts', 'checkCampaignHealth');
    expect(md5(body)).toBe('8db7908488e934c0bf96cfb80fa3709b');
    expect(body).not.toMatch(/require\('\.\.?\//);
  });
});

describe('checkSequenceProgression: the three states it pushed before the move', () => {
  it('no gaps -> one ok check with metric 0', async () => {
    query.mockResolvedValue([[]]);
    const checks: Check[] = [];
    await checkSequenceProgression(checks as never);
    expect(checks).toEqual([
      {
        name: 'sequence_progression',
        severity: 'ok',
        detail: 'All sequence progressions are healthy — no gaps detected.',
        metric: 0,
      },
    ]);
  });

  it('the query throws -> one warning naming the failure, never a crash', async () => {
    query.mockRejectedValue(new Error('relation "scheduled_emails" does not exist'));
    const checks: Check[] = [];
    await checkSequenceProgression(checks as never);
    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe('sequence_progression');
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].detail).toBe('Check failed: relation "scheduled_emails" does not exist');
  });

  it('gaps that auto-recover -> warning + autoFixed, which PROVES both require paths resolve', async () => {
    // Six gaps: enough that a non-recovering run would be 'critical' (>= 5), so the
    // assertion below can only pass through the auto-fix branch.
    const gaps = [1, 2, 3, 4, 5, 6].map((id) => ({ id, lead_id: id, campaign_id: 'c', sequence_id: 's', step_index: 0 }));
    query.mockResolvedValue([gaps]);
    findByPk.mockImplementation((id: number) => Promise.resolve({ id }));
    scheduleNextStep.mockResolvedValue({ id: 'next' });

    const checks: Check[] = [];
    await checkSequenceProgression(checks as never);

    // If `require('../sequenceService')` did not resolve, MODULE_NOT_FOUND would be
    // swallowed by the auto-fix catch, `fixed` would be 0, and this would be 'critical'.
    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('warning');
    expect(checks[0].metric).toBe(6);
    expect(checks[0].autoFixed).toBe('Recovered 6/6 stuck sequences');
    expect(scheduleNextStep).toHaveBeenCalledTimes(6);
    expect(findByPk).toHaveBeenCalledTimes(6);
  });

  it('gaps that do NOT recover -> critical at five or more, the un-fixed path', async () => {
    const gaps = [1, 2, 3, 4, 5].map((id) => ({ id, lead_id: id, sequence_id: 's', step_index: 0 }));
    query.mockResolvedValue([gaps]);
    findByPk.mockResolvedValue(null); // nothing to re-schedule, so fixed stays 0
    const checks: Check[] = [];
    await checkSequenceProgression(checks as never);
    expect(checks).toHaveLength(1);
    expect(checks[0].severity).toBe('critical');
    expect(checks[0].metric).toBe(5);
    expect(checks[0].autoFixed).toBeUndefined();
    expect(scheduleNextStep).not.toHaveBeenCalled();
  });

  it('the auto-fix is capped at 100 rows per run', async () => {
    const gaps = Array.from({ length: 150 }, (_, i) => ({ id: i, lead_id: i, sequence_id: 's', step_index: 0 }));
    query.mockResolvedValue([gaps]);
    findByPk.mockImplementation((id: number) => Promise.resolve({ id }));
    scheduleNextStep.mockResolvedValue({ id: 'next' });
    const checks: Check[] = [];
    await checkSequenceProgression(checks as never);
    expect(scheduleNextStep).toHaveBeenCalledTimes(100);
    expect(checks[0].metric).toBe(150);
    expect(checks[0].autoFixed).toBe('Recovered 100/150 stuck sequences');
  });
});

describe('checkSequenceProgression: OH1s, a cancelled step is a decision, not a gap', () => {
  async function sqlSent(): Promise<string> {
    query.mockResolvedValue([[]]);
    await checkSequenceProgression([] as never);
    return String(query.mock.calls[0][0]).replace(/\s+/g, ' ');
  }

  it('any existing next-step row, in any status, means there is no gap to repair', async () => {
    const sql = await sqlSent();
    const notExists = sql.slice(sql.indexOf('AND NOT EXISTS'), sql.indexOf('AND EXISTS'));
    expect(notExists).toContain('se2.step_index = se.step_index + 1');
    // The old status filter made a CANCELLED next step look missing, so it was re-created forever.
    expect(notExists).not.toMatch(/se2\.status/);
  });

  it('pre-scheduled sequences (event, call, cohort countdowns) are excluded, all three kinds', async () => {
    const sql = await sqlSent();
    expect(sql).toContain("st->>'minutes_before_event' IS NOT NULL");
    expect(sql).toContain("st->>'minutes_before_call' IS NOT NULL");
    expect(sql).toContain("st->>'days_before_cohort_start' IS NOT NULL");
    expect(sql).toContain("COALESCE(NULLIF(st->>'delay_days', ''), '0')::numeric <> 0");
  });

  it('audience-tagged follow-ups (attended/missed steps) are excluded: an attendee skipping step 1 is correct', async () => {
    const sql = await sqlSent();
    // Must sit inside the follow_up_sequences EXISTS, ANDed with the countdown exclusion,
    // so it filters the sequence rather than the sent row.
    const seqClause = sql.slice(sql.indexOf('SELECT 1 FROM follow_up_sequences fs'));
    expect(seqClause).toContain(
      "AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(fs.steps) st WHERE st->>'audience' IN ('attended', 'missed'))",
    );
  });
});

describe('checkCampaignHealth: silent when healthy, which is worth knowing', () => {
  it('a clean database pushes NOTHING - every push sits behind a problem guard', async () => {
    query.mockResolvedValue([[]]);
    const checks: Check[] = [];
    await checkCampaignHealth(checks as never);
    // Pinned because it surprised the author of this test, and because it is
    // asymmetric with checkSequenceProgression, which always pushes an explicit
    // 'ok'. A reader of /health/full therefore CANNOT tell "campaigns are fine"
    // from "this check never ran" - the absence of a campaign entry means both.
    // Left exactly as it was: this task is a move, and giving the function an
    // 'ok' branch would be a behaviour change needing its own reasoning.
    expect(checks).toEqual([]);
  });

  it('stuck actions -> one warning carrying the count as the metric', async () => {
    // First query is the stuck-actions count; the rest come back empty.
    // `cnt`, not `count` - the alias the function's own SQL uses.
    query.mockResolvedValueOnce([[{ cnt: '7' }]]).mockResolvedValue([[]]);
    const checks: Check[] = [];
    await checkCampaignHealth(checks as never);
    expect(checks).toEqual([
      {
        name: 'stuck_actions',
        severity: 'warning',
        detail: '7 actions stuck in processing for over 10 minutes. The stale recovery job should clean these up.',
        metric: 7,
      },
    ]);
  });

  it('the query throws -> one warning named campaign_health, not a rejection', async () => {
    query.mockRejectedValue(new Error('boom'));
    const checks: Check[] = [];
    await expect(checkCampaignHealth(checks as never)).resolves.toBeUndefined();
    expect(checks).toEqual([{ name: 'campaign_health', severity: 'warning', detail: 'Check failed: boom' }]);
  });
});
