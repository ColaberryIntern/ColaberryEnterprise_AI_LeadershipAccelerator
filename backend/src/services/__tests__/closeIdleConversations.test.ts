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

import { Op } from 'sequelize';
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
  beforeEach(() => {
    jest.clearAllMocks();
    findAll.mockResolvedValue([]);
  });

  const NOW = new Date('2026-11-11T12:00:00.000Z');
  const CUTOFF = new Date('2026-11-11T11:30:00.000Z');
  const queryArg = () => findAll.mock.calls[0][0];
  const orClauses = () => queryArg().where[Op.or] as any[];

  it('selects only active conversations, oldest first, bounded by the limit', async () => {
    await findIdleConversations(30, 200, NOW);

    const arg = queryArg();
    expect(arg.where.status).toBe('active');
    expect(arg.limit).toBe(200);
    // started_at, NOT updated_at: ordering by a column that is null on most rows leaves the
    // batch arbitrary, so the oldest-first guarantee would be a fiction.
    expect(arg.order).toEqual([['started_at', 'ASC']]);
  });

  it('is not blind to a null updated_at, which is how 128 production rows went unswept', async () => {
    // The regression this pins: `updated_at < cutoff` alone matches nothing when the column is
    // null, because `null < cutoff` is null, not true. The model sets `timestamps: false`, so
    // nothing maintains that column except the code paths that write it by hand.
    await findIdleConversations(30, 200, NOW);

    const clauses = orClauses();
    expect(clauses).toHaveLength(2);

    // The fallback clause asks for `updated_at IS NULL` and then measures idleness on
    // started_at. Op.is, not a bare null, because the attribute is typed as a Date.
    const fallback = clauses.find((c) => c.updated_at?.[Op.is] === null);
    expect(fallback).toBeDefined();
    expect(fallback.started_at[Op.lt]).toEqual(CUTOFF);

    const direct = clauses.find((c) => c.updated_at?.[Op.lt] !== undefined);
    expect(direct).toBeDefined();
    expect(direct.updated_at[Op.lt]).toEqual(CUTOFF);
  });

  it('refuses to sweep a conversation the visitor never spoke in', async () => {
    // Closing one is not harmless: it increments admissions_memory.conversation_count and
    // appends a summary reading "0 messages exchanged", which buildMemoryContext then feeds
    // into Maya's prompt. All 128 unswept production rows were exactly this shape.
    await findIdleConversations(30, 200, NOW);

    expect(queryArg().where.visitor_message_count[Op.gt]).toBe(0);
  });

  it('uses a cutoff that would NOT catch a conversation active one minute ago', async () => {
    await findIdleConversations(DEFAULT_IDLE_MINUTES, DEFAULT_BATCH_LIMIT, NOW);

    const oneMinuteAgo = new Date(NOW.getTime() - 60_000);
    for (const clause of orClauses()) {
      const cutoff = (clause.updated_at?.[Op.lt] ?? clause.started_at[Op.lt]) as Date;
      expect(cutoff.getTime()).toBeLessThan(oneMinuteAgo.getTime());
    }
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
