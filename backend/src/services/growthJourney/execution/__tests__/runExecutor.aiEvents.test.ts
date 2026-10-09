/**
 * One `ai_events` row per executor run (Phase 6, T609).
 *
 * The event exists so the alerting has an honest DENOMINATOR: without a success
 * event you can count failures but never their rate. So the three things that
 * matter are all about honesty of counting - one event per run that ran, the
 * outcome derived from what actually happened, and NO event for a run that never
 * executed. Plus the rule every journey surface shares: no address, anywhere.
 */

const emitAiEvent = jest.fn();
jest.mock('../../../aiEventService', () => ({ emitAiEvent: (...a: unknown[]) => emitAiEvent(...a), logAiEvent: jest.fn() }));

const programsFindAll = jest.fn();
jest.mock('../../../../models', () => ({
  JourneyProgram: { findAll: (...a: unknown[]) => programsFindAll(...a) },
  GrowthJourneyExecution: { findAll: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
}));

const reconcileExecutions = jest.fn();
jest.mock('../reconcileExecutions', () => ({
  reconcileExecutions: (...a: unknown[]) => reconcileExecutions(...a),
  RECONCILE_LIMIT: 500,
}));

import fs from 'fs';
import path from 'path';

import { EXECUTOR_AGENT_NAME } from '../proposalFiler';
import { emitRunEvent } from '../executorRunEvent';

type Summary = Parameters<typeof emitRunEvent>[0];

const summary = (over: Partial<Summary> = {}): Summary =>
  ({
    correlation_id: 'c1',
    status: 'ran',
    reason: null,
    plan: { programs: 2, candidates: 9, planned: 4, replayed: 0, refused: {}, not_live: {}, remembered: 0, errors: 0, window_capped: 0 },
    execute: { candidates: 4, held: {}, enrolled: 3, not_claimed: 0, blocked: 1, cancelled: 0, failed: 0, errors: 0 },
    reconcile: { scanned: 12, moved: {}, outcomes: { recorded: 0, replayed: 0 }, errors: [] },
    stage_errors: [],
    ...over,
  }) as unknown as Summary;

beforeEach(() => jest.clearAllMocks());

describe('one event per run, and its outcome is what happened', () => {
  it('a clean run -> exactly one success event, with the counts as metadata', async () => {
    await emitRunEvent(summary(), 'corr-1', 1234);
    expect(emitAiEvent).toHaveBeenCalledTimes(1);
    const e = emitAiEvent.mock.calls[0][0];
    expect(e).toMatchObject({
      event_type: 'growth_journey.executor_run',
      outcome: 'success',
      agent_id: EXECUTOR_AGENT_NAME,
      trace_id: 'corr-1',
      duration_ms: 1234,
      error_class: null,
    });
    expect(e.metadata).toEqual({
      programs: 2,
      planned: 4,
      enrolled: 3,
      reconciled: 12,
      stages_failed: [],
      error_classes: [],
    });
  });

  it('a stage error -> failure, naming the first error class and listing every stage', async () => {
    await emitRunEvent(
      summary({
        stage_errors: [
          { stage: 'plan', error_class: 'SequelizeDatabaseError' },
          { stage: 'reconcile', error_class: 'TimeoutError' },
        ] as Summary['stage_errors'],
      }),
      'corr-2',
      50,
    );
    const e = emitAiEvent.mock.calls[0][0];
    // stage() catches per stage and pushes rather than throwing, so a broken run still
    // completes and returns a summary - the outcome has to come from the array, not a catch.
    expect(e.outcome).toBe('failure');
    expect(e.error_class).toBe('SequelizeDatabaseError');
    expect(e.metadata.stages_failed).toEqual(['plan', 'reconcile']);
    expect(e.metadata.error_classes).toEqual(['SequelizeDatabaseError', 'TimeoutError']);
  });

  it('AiEventOutcome has no "partial", so a partly-broken run is a failure here', async () => {
    // The sibling log line says outcome:'partial' for this state; the column's union is
    // success|failure|blocked|escalated. Something did not happen that should have.
    await emitRunEvent(summary({ stage_errors: [{ stage: 'execute', error_class: 'Error' }] as Summary['stage_errors'] }), 'c', 1);
    expect(emitAiEvent.mock.calls[0][0].outcome).toBe('failure');
  });

  it('a null reconcile summary -> reconciled 0, never a throw on the stage that failed', async () => {
    await emitRunEvent(summary({ reconcile: null, stage_errors: [{ stage: 'reconcile', error_class: 'TimeoutError' }] as Summary['stage_errors'] }), 'c', 1);
    expect(emitAiEvent.mock.calls[0][0].metadata.reconciled).toBe(0);
  });
});

describe('a run that never executed emits NOTHING', () => {
  it('the flags being off returns skipped and emits no event at all', async () => {
    const { runExecutor } = require('../runExecutor');
    const out = await runExecutor({
      flags: { growthJourneyEnabled: false, journeyExecution: false } as never,
      explorerFlags: {} as never,
    });
    expect(out.status).toBe('skipped');
    // Counting a skipped run as success would pad the denominator with runs that did no
    // work, which is the opposite of what this event is for. Today EVERY run is skipped,
    // so an empty ai_events table is the correct reading rather than a missing emit.
    expect(emitAiEvent).not.toHaveBeenCalled();
    expect(programsFindAll).not.toHaveBeenCalled();
  });
});

describe('nothing in the event could carry an address', () => {
  it('every metadata value is a number or a closed-union string', async () => {
    await emitRunEvent(
      summary({
        stage_errors: [{ stage: 'plan', error_class: 'SequelizeConnectionRefusedError' }] as Summary['stage_errors'],
      }),
      'corr',
      7,
    );
    const { metadata } = emitAiEvent.mock.calls[0][0];
    for (const [key, value] of Object.entries(metadata)) {
      if (Array.isArray(value)) {
        for (const v of value) expect(typeof v).toBe('string');
      } else {
        expect(typeof value).toBe('number');
      }
      expect(JSON.stringify(value)).not.toContain('@');
      expect(key).not.toContain('@');
    }
  });

  it('a summary carrying an address in a reason map cannot leak it: those maps are not emitted', async () => {
    // `plan.refused` and `execute.held` are reason->count maps whose keys come from
    // elsewhere. They are deliberately NOT copied into the event; only scalar counts and
    // the stage/error-class vocabularies are. This is the cell that fails if someone
    // "enriches" the metadata later.
    await emitRunEvent(
      summary({
        plan: { ...summary().plan, refused: { 'someone@example.com': 3 } } as Summary['plan'],
        execute: { ...summary().execute, held: { 'other@example.com': 1 } } as Summary['execute'],
      }),
      'corr',
      7,
    );
    const serialised = JSON.stringify(emitAiEvent.mock.calls[0][0]);
    expect(serialised).not.toContain('@example.com');
    expect(serialised).not.toContain('someone');
    expect(serialised).not.toContain('other@');
  });
});

describe('the wiring: runExecutor calls it exactly once, at the end', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'runExecutor.ts'), 'utf8').replace(/\r\n/g, '\n');

  it('imports emitRunEvent and calls it once, after the closing log and before the return', () => {
    expect(source).toContain("import { emitRunEvent } from './executorRunEvent';");
    expect(source.match(/await emitRunEvent\(/g)).toHaveLength(1);
    const call = source.indexOf('await emitRunEvent(');
    expect(source.lastIndexOf("'growth_journey.executor.run'")).toBeLessThan(call);
    expect(source.indexOf('return s;', call)).toBeGreaterThan(call);
  });

  it('does not import the ai event service itself, so the orchestrator keeps one less edge', () => {
    expect(source).not.toContain('aiEventService');
  });

  it('stays under the 300-line pin its own suite enforces', () => {
    expect(source.split('\n').length).toBeLessThan(300);
  });
});
