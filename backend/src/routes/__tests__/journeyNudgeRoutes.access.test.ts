const m = { ledger: jest.fn() };
jest.mock('../../models', () => {
  const { Table } = require('../../services/growthJourney/__tests__/fixtures/phase4Tables');
  const nudges = new Table('growth_journey_in_app_nudges', 'nudge');
  return { GrowthJourneyInAppNudge: nudges, __tables: { nudges } };
});
jest.mock('../../services/growthJourney/ledger', () => ({ recordJourneyEvent: (...a: unknown[]) => m.ledger(...a) }));

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import * as models from '../../models';
import type { Table } from '../../services/growthJourney/__tests__/fixtures/phase4Tables';
import { LEARNER_NUDGE_FIELDS } from '../../services/growthJourney/execution/nudgeReadService';
import journeyNudgeRoutes from '../journeyNudgeRoutes';

/**
 * T514 - the learner's nudges over the REAL participant guard and a real JWT
 * (the pattern of `explorerSignalRoutes.test.ts`), with the nudge table the
 * fixture world's (the DDL's unique index on execution_id enforced). What a
 * learner can see and do is asserted end to end through HTTP; what another
 * learner cannot is asserted the same way, with the rows read back unchanged.
 */

const nudges = (models as unknown as { __tables: { nudges: Table } }).__tables.nudges;
const ENR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LIST = '/api/portal/journey-nudges';
const dismissPath = (id: string) => `${LIST}/${encodeURIComponent(id)}/dismiss`;

const app = express();
app.use(express.json());
app.use(journeyNudgeRoutes);

const token = (sub = ENR, extra: Record<string, unknown> = {}) => jwt.sign({ sub, email: 'learner@example.com', cohort_id: 'c1', role: 'participant', ...extra }, env.jwtSecret);
const authed = (sub = ENR, extra: Record<string, unknown> = {}) => ({ Authorization: `Bearer ${token(sub, extra)}` });
let n = 0;
const nudge = (over: Record<string, unknown> = {}) => nudges.insert({
  id: `cccccccc-cccc-4ccc-8ccc-${String(n += 1).padStart(12, '0')}`,
  tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', enrollment_id: ENR, execution_id: `ex-${n}`,
  title: `Nudge ${n}`, href: '/portal/next-step', purpose: 'discovery_questions', shown_at: null, dismissed_at: null, expires_at: null, ...over,
});
const snapshot = () => JSON.stringify(nudges.rows);
const ledgerEvents = () => m.ledger.mock.calls.map((c) => [c[0], c[2], (c[4] as { nudge_id: string }).nudge_id]);

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());
beforeEach(() => {
  nudges.reset();
  m.ledger.mockReset().mockResolvedValue({ recorded: true });
});

describe('acceptance 1: the guard', () => {
  it('no token -> 401 on both routes, and no row is touched', async () => {
    const r = nudge();
    expect((await request(app).get(LIST)).status).toBe(401);
    expect((await request(app).post(dismissPath(r.id as string))).status).toBe(401);
    expect(nudges.rows[0].shown_at).toBeNull();
    expect(nudges.rows[0].dismissed_at).toBeNull();
  });

  it('a non-participant token -> 403; a read-only "view as member" token may list but not dismiss', async () => {
    const r = nudge();
    const admin = jwt.sign({ sub: 'x', email: 'a@b.c', role: 'admin' }, env.jwtSecret);
    expect((await request(app).get(LIST).set('Authorization', `Bearer ${admin}`)).status).toBe(403);
    const list = await request(app).get(LIST).set(authed(ENR, { read_only: true }));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    // The admin's look leaves no trace: shown_at is NOT stamped for a read-only viewer.
    expect(nudges.rows[0].shown_at).toBeNull();
    expect(m.ledger).not.toHaveBeenCalled();
    expect((await request(app).post(dismissPath(r.id as string)).set(authed(ENR, { read_only: true }))).status).toBe(403);
    expect(nudges.rows[0].dismissed_at).toBeNull();
  });
});

describe('acceptance 4: the list is the learner\'s own live nudges, four fields each, shown once', () => {
  it('returns exactly id, title, href and purpose per nudge, oldest first, and nothing of the row', async () => {
    nudge({ title: 'First' });
    nudge({ title: 'Second', href: null, purpose: null });
    const res = await request(app).get(LIST).set(authed());
    expect(res.status).toBe(200);
    expect(res.body.map((x: { title: string }) => x.title)).toEqual(['First', 'Second']);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual([...LEARNER_NUDGE_FIELDS].sort());
      expect(Object.keys(item)).toHaveLength(4);
    }
    expect(res.body[1]).toEqual({ id: nudges.rows[1].id, title: 'Second', href: null, purpose: null });
    expect(JSON.stringify(res.body)).not.toMatch(/tenant_id|brand_id|execution_id|enrollment_id|shown_at|created_at/);
  });

  it('stamps shown_at once: the first list writes it and one ledger row per nudge; the second list writes nothing', async () => {
    const a = nudge();
    const b = nudge({ shown_at: new Date('2026-09-01T00:00:00Z') });
    await request(app).get(LIST).set(authed());
    expect(nudges.rows[0].shown_at).toBeInstanceOf(Date);
    expect(nudges.rows[1].shown_at).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(ledgerEvents()).toEqual([['growth_journey.execution.nudge_shown', a.execution_id, a.id]]);
    const stamped = snapshot();
    m.ledger.mockClear();
    await request(app).get(LIST).set(authed());
    expect(snapshot()).toBe(stamped);
    expect(m.ledger).not.toHaveBeenCalled();
    void b;
  });

  it('another learner\'s nudges, a dismissed one and an expired one are not listed; an unexpired one is', async () => {
    nudge({ enrollment_id: OTHER, title: 'Theirs' });
    nudge({ dismissed_at: new Date(), title: 'Dismissed' });
    nudge({ expires_at: new Date(Date.now() - 60_000), title: 'Expired' });
    nudge({ expires_at: new Date(Date.now() + 60_000), title: 'Still live' });
    const res = await request(app).get(LIST).set(authed());
    expect(res.body.map((x: { title: string }) => x.title)).toEqual(['Still live']);
  });

  it('with no nudges the list is [] (the card renders nothing)', async () => {
    const res = await request(app).get(LIST).set(authed());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('acceptance 2, 3: dismiss', () => {
  it('dismisses the caller\'s own live nudge once: 200, dismissed_at set, one ledger row; a second dismiss is a 404 with nothing changed', async () => {
    const r = nudge();
    const first = await request(app).post(dismissPath(r.id as string)).set(authed());
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ dismissed: true });
    expect(nudges.rows[0].dismissed_at).toBeInstanceOf(Date);
    expect(ledgerEvents()).toEqual([['growth_journey.execution.nudge_dismissed', r.execution_id, r.id]]);
    const after = snapshot();
    m.ledger.mockClear();
    const second = await request(app).post(dismissPath(r.id as string)).set(authed());
    expect(second.status).toBe(404);
    expect(snapshot()).toBe(after);
    expect(m.ledger).not.toHaveBeenCalled();
  });

  it('acceptance 2: another participant\'s id -> 404, and nothing changes', async () => {
    const theirs = nudge({ enrollment_id: OTHER });
    const before = snapshot();
    const res = await request(app).post(dismissPath(theirs.id as string)).set(authed());
    expect(res.status).toBe(404);
    expect(snapshot()).toBe(before);
    expect(m.ledger).not.toHaveBeenCalled();
    // And the same id under the owner's token works - the 404 was ownership, not existence.
    expect((await request(app).post(dismissPath(theirs.id as string)).set(authed(OTHER))).status).toBe(200);
  });

  it('acceptance 3: a malformed id -> 400 before any read; an unknown well-formed id -> 404', async () => {
    const write = jest.spyOn(nudges, 'update');
    const read = jest.spyOn(nudges, 'findOne');
    expect((await request(app).post(dismissPath('not-a-uuid')).set(authed())).status).toBe(400);
    expect((await request(app).post(dismissPath('1; DROP TABLE nudges')).set(authed())).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect((await request(app).post(dismissPath('dddddddd-dddd-4ddd-8ddd-dddddddddddd')).set(authed())).status).toBe(404);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
    read.mockRestore();
  });
});

describe('failure path', () => {
  it('a read that throws is a 500 with a structured error line, never a stack in the body', async () => {
    const spy = jest.spyOn(nudges, 'findAll').mockRejectedValueOnce(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    const res = await request(app).get(LIST).set(authed());
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load nudges' });
    const line = (console.error as jest.Mock).mock.calls.map((c) => String(c[0])).find((l) => l.includes('growth_journey.nudges.list_failed'))!;
    expect(JSON.parse(line)).toMatchObject({ level: 'error', outcome: 'failure', error_class: 'SequelizeConnectionError' });
  });
});
