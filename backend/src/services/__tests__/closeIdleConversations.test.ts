/**
 * Tests for the idle-conversation sweeper (R4).
 *
 * The defect being fixed is that nothing ever closed a conversation, so these tests are
 * written against the thing that actually went wrong: a sweep that silently does nothing, or
 * that stops at the first bad row, is the failure mode, not an exception.
 *
 * The model and the real closer are mocked so this stays a unit test with no database and no
 * OpenAI call. `closeConversation` is injected through `options.closer` for the per-row cases.
 */

jest.mock('../../models/ChatConversation', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

// chatService pulls in the OpenAI client and the whole model graph at import time; the sweeper
// only needs its one function, and every test injects a closer instead.
jest.mock('../chatService', () => ({
  __esModule: true,
  closeConversation: jest.fn(),
}));

import ChatConversation from '../../models/ChatConversation';
import {
  closeIdleConversations,
  findIdleConversations,
  DEFAULT_IDLE_MINUTES,
  DEFAULT_BATCH_LIMIT,
} from '../chat/closeIdleConversations';

const findAll = (ChatConversation as unknown as { findAll: jest.Mock }).findAll;

const row = (id: string) => ({ id } as any);

describe('closeIdleConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- happy path --------------------------------------------------------
  it('closes every idle conversation it finds', async () => {
    findAll.mockResolvedValue([row('a'), row('b'), row('c')]);
    const closer = jest.fn().mockResolvedValue(undefined);

    const result = await closeIdleConversations({ closer });

    expect(result).toEqual({ scanned: 3, closed: 3, failed: 0, errors: [] });
    expect(closer).toHaveBeenCalledTimes(3);
    expect(closer).toHaveBeenCalledWith('a');
    expect(closer).toHaveBeenCalledWith('c');
  });

  // --- the actual production bug this guards against ---------------------
  it('reports zero closed when nothing is idle, without calling the closer', async () => {
    findAll.mockResolvedValue([]);
    const closer = jest.fn();

    const result = await closeIdleConversations({ closer });

    expect(result.scanned).toBe(0);
    expect(result.closed).toBe(0);
    expect(closer).not.toHaveBeenCalled();
  });

  // --- failure path ------------------------------------------------------
  it('keeps sweeping after one conversation fails, and counts it', async () => {
    findAll.mockResolvedValue([row('ok1'), row('bad'), row('ok2')]);
    const closer = jest.fn().mockImplementation(async (id: string) => {
      if (id === 'bad') throw new TypeError('summary generation exploded');
    });

    const result = await closeIdleConversations({ closer });

    // The whole point: one bad row must not stop the other two from closing.
    expect(result.closed).toBe(2);
    expect(result.failed).toBe(1);
    expect(closer).toHaveBeenCalledTimes(3);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      conversation_id: 'bad',
      error_class: 'TypeError',
    });
  });

  it('never throws when the lookup itself fails, so the cron keeps running', async () => {
    findAll.mockRejectedValue(new Error('connection terminated'));

    await expect(closeIdleConversations({ closer: jest.fn() })).resolves.toEqual({
      scanned: 0,
      closed: 0,
      failed: 0,
      errors: [],
    });
  });

  it('logs a failure rather than swallowing it', async () => {
    const errSpy = jest.spyOn(console, 'error');
    findAll.mockResolvedValue([row('bad')]);

    await closeIdleConversations({
      closer: jest.fn().mockRejectedValue(new RangeError('nope')),
    });

    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).toContain('close_failed');
    expect(logged).toContain('RangeError');
    expect(logged).toContain('bad');
  });

  // --- boundary ----------------------------------------------------------
  it('bounds the error list so a mass failure cannot produce an unbounded payload', async () => {
    findAll.mockResolvedValue(Array.from({ length: 50 }, (_, i) => row('c' + i)));

    const result = await closeIdleConversations({
      closer: jest.fn().mockRejectedValue(new Error('all broken')),
    });

    expect(result.failed).toBe(50);
    expect(result.errors).toHaveLength(20);
  });

  // --- idempotency -------------------------------------------------------
  it('is idempotent: the second sweep finds nothing because the rows are no longer active', async () => {
    const closer = jest.fn().mockResolvedValue(undefined);

    findAll.mockResolvedValueOnce([row('a'), row('b')]);
    const first = await closeIdleConversations({ closer });

    // The query filters status='active', so once closed the same rows cannot come back.
    findAll.mockResolvedValueOnce([]);
    const second = await closeIdleConversations({ closer });

    expect(first.closed).toBe(2);
    expect(second.closed).toBe(0);
    expect(closer).toHaveBeenCalledTimes(2);
  });
});

describe('findIdleConversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('selects only active conversations older than the cutoff, oldest first', async () => {
    findAll.mockResolvedValue([]);
    const now = new Date('2026-11-11T12:00:00.000Z');

    await findIdleConversations(30, 200, now);

    const arg = findAll.mock.calls[0][0];
    expect(arg.where.status).toBe('active');
    expect(arg.limit).toBe(200);
    expect(arg.order).toEqual([['updated_at', 'ASC']]);

    // The cutoff must be exactly 30 minutes before "now", not before the epoch or after now.
    const opLt = Object.getOwnPropertySymbols(arg.where.updated_at)
      .map((s) => (arg.where.updated_at as any)[s])
      .find((v) => v instanceof Date);
    expect(opLt).toEqual(new Date('2026-11-11T11:30:00.000Z'));
  });

  it('uses a cutoff that would NOT catch a conversation active one minute ago', async () => {
    findAll.mockResolvedValue([]);
    const now = new Date('2026-11-11T12:00:00.000Z');

    await findIdleConversations(DEFAULT_IDLE_MINUTES, DEFAULT_BATCH_LIMIT, now);

    const arg = findAll.mock.calls[0][0];
    const cutoff = Object.getOwnPropertySymbols(arg.where.updated_at)
      .map((s) => (arg.where.updated_at as any)[s])
      .find((v) => v instanceof Date) as Date;

    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    expect(cutoff.getTime()).toBeLessThan(oneMinuteAgo.getTime());
  });
});

describe('the defaults are the ones the comment claims', () => {
  it('sweeps at 30 minutes idle, 200 per run', () => {
    expect(DEFAULT_IDLE_MINUTES).toBe(30);
    expect(DEFAULT_BATCH_LIMIT).toBe(200);
  });
});

describe('the cron registration stays discoverable to the registry guard', () => {
  // The agent name is written as a string literal at the instrumentCronJob call site, because
  // cronRegistryReconciliation's parser resolves a literal statically and treats an identifier
  // as a dynamicArg that resolves to NO name. A job whose name cannot be resolved is invisible
  // to the invariant that every scheduled job has a seed row to track it, which is how a cron
  // silently stops being accounted for. These assertions keep the literal, the exported
  // constant and the seed row from drifting apart.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const cronsFile = path.join(__dirname, '..', 'scheduling', 'chatConversationCrons.ts');
  const seedFile = path.join(__dirname, '..', 'agentRegistrySeed.ts');

  it('passes the agent name to instrumentCronJob as a resolvable string literal', () => {
    const src = fs.readFileSync(cronsFile, 'utf8');
    expect(src).toContain("instrumentCronJob('ChatCloseIdleConversations'");
    // A control: if this were ever switched back to the identifier form, the guard goes blind.
    expect(src).not.toContain('instrumentCronJob(CLOSE_IDLE_AGENT');
  });

  it('exports a constant equal to the literal it registers under', () => {
    // Read from source rather than importing the module: importing it pulls in
    // cronInstrumentation, which pulls in models/index.ts and wires the real Sequelize
    // associations. ChatConversation is mocked at the top of this file, so that import throws
    // "not a subclass of Sequelize.Model". Parsing the source keeps this a unit test.
    const src = fs.readFileSync(cronsFile, 'utf8');
    const agent = src.match(/export const CLOSE_IDLE_AGENT = '([^']+)'/);
    const schedule = src.match(/export const CLOSE_IDLE_SCHEDULE = '([^']+)'/);
    expect(agent?.[1]).toBe('ChatCloseIdleConversations');
    expect(schedule?.[1]).toBe('*/10 * * * *');
  });

  it('has a seed row whose name and schedule match the registration', () => {
    const seed = fs.readFileSync(seedFile, 'utf8');
    expect(seed).toContain("agent_name: 'ChatCloseIdleConversations'");
    // The seed row's schedule must be the schedule that actually fires, which is the
    // invariant the registry guard calls (iii).
    const block = seed.slice(seed.indexOf("agent_name: 'ChatCloseIdleConversations'"));
    expect(block.slice(0, 400)).toContain("schedule: '*/10 * * * *'");
  });
});
