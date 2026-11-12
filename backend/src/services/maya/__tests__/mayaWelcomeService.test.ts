jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../mayaPromotion', () => ({ resolveMayaMode: jest.fn() }));

import { sequelize } from '../../../config/database';
import {
  maybeSendMayaWelcome, mayaWelcomeMessage, ensureMayaWelcomeTable, __resetMayaWelcomeTableForTests,
  type MayaWelcomeDeps,
} from '../mayaWelcomeService';
import { AI_DISCLOSURE } from '../mayaDisclosure';

/**
 * M32 acceptance:
 *   - shadow records and delivers nothing, PROVED BY THE ABSENCE OF A SEND (sendDm is never called), not merely the
 *     presence of a record
 *   - in-app only (the only delivery dependency is the portal DM)
 *   - promotion out of shadow requires Ali (mode comes from the M37 switch; covered in mayaPromotion.test.ts)
 *   - copy never advertises the banned word
 */

const NOW = new Date('2026-11-09T15:00:00Z');
const NEW_EXPLORER = {
  id: 'enr-1', enrollment_type: 'explorer', full_name: 'Sam Rivera',
  email: 'sam.rivera@gmail.com', created_at: new Date('2026-11-09T14:00:00Z'),
};

function harness(mode: 'off' | 'shadow' | 'live', over: Partial<MayaWelcomeDeps> = {}) {
  const ledger = new Map<string, { mode: string; body: string; delivered: boolean }>();
  const sendDm = jest.fn(async () => ({ roomId: 'room-1', messageId: 'msg-1' }));
  const deps: MayaWelcomeDeps = {
    mode: async () => ({ capability: 'sendInAppWelcome', mode, reason: 'test' } as never),
    findEnrollment: async () => NEW_EXPLORER,
    ensureTable: async () => undefined,
    claim: async ({ enrollmentId, mode: m, body }) => {
      if (ledger.has(enrollmentId)) return false;
      ledger.set(enrollmentId, { mode: m, body, delivered: false });
      return true;
    },
    sendDm,
    markDelivered: async (id) => { const r = ledger.get(id); if (r) r.delivered = true; },
    markFailed: async () => undefined,
    now: () => NOW,
    ...over,
  };
  return { deps, ledger, sendDm };
}

let logSpy: jest.SpyInstance; let warnSpy: jest.SpyInstance;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

describe('shadow (the default)', () => {
  it('records the exact body it WOULD send, and sends NOTHING', async () => {
    const h = harness('shadow');
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toEqual({ outcome: 'recorded_shadow', mode: 'shadow' });
    expect(h.sendDm).not.toHaveBeenCalled();
    expect(h.ledger.get('enr-1')).toEqual({ mode: 'shadow', body: mayaWelcomeMessage('Sam'), delivered: false });
  });

  it('a second call records nothing more and still sends nothing (one row, ever)', async () => {
    const h = harness('shadow');
    await maybeSendMayaWelcome('enr-1', h.deps);
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'already_recorded' });
    expect(h.ledger.size).toBe(1);
    expect(h.sendDm).not.toHaveBeenCalled();
  });

  it('a person recorded in shadow is NOT greeted later when Maya is promoted (no retroactive sends)', async () => {
    const h = harness('shadow');
    await maybeSendMayaWelcome('enr-1', h.deps);
    h.deps.mode = async () => ({ capability: 'sendInAppWelcome', mode: 'live', reason: 'promoted' } as never);
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'already_recorded' });
    expect(h.sendDm).not.toHaveBeenCalled();
  });
});

describe('off (kill switch)', () => {
  it('records nothing and sends nothing, and never reads the enrollment', async () => {
    const findEnrollment = jest.fn();
    const h = harness('off', { findEnrollment });
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toEqual({ outcome: 'off', mode: 'off' });
    expect(findEnrollment).not.toHaveBeenCalled();
    expect(h.ledger.size).toBe(0);
  });
});

describe('live (only after Ali promotes it and the M29 flags are on)', () => {
  it('claims the row, then sends exactly one in-app DM and marks it delivered', async () => {
    const h = harness('live');
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toEqual({ outcome: 'sent', mode: 'live' });
    expect(h.sendDm).toHaveBeenCalledTimes(1);
    expect(h.sendDm).toHaveBeenCalledWith('enr-1', mayaWelcomeMessage('Sam'));
    expect(h.ledger.get('enr-1')).toMatchObject({ mode: 'live', delivered: true });
    await maybeSendMayaWelcome('enr-1', h.deps);
    expect(h.sendDm).toHaveBeenCalledTimes(1);
  });

  it('a failed send is recorded and NOT retried', async () => {
    const markFailed = jest.fn(async () => undefined);
    const h = harness('live', { sendDm: jest.fn(async () => { throw new Error('dm down'); }), markFailed });
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toEqual({ outcome: 'send_failed', mode: 'live' });
    expect(markFailed).toHaveBeenCalledWith('enr-1', 'send_failed');
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'already_recorded' });
  });
});

describe('who is welcomed', () => {
  it('not an Explorer -> nothing', async () => {
    const h = harness('live', { findEnrollment: async () => ({ ...NEW_EXPLORER, enrollment_type: 'standard' }) });
    expect((await maybeSendMayaWelcome('enr-1', h.deps)).outcome).toBe('not_explorer');
    expect(h.ledger.size).toBe(0);
  });
  it('an account older than 24 hours (a reused account) -> nothing', async () => {
    const h = harness('live', { findEnrollment: async () => ({ ...NEW_EXPLORER, created_at: new Date('2026-11-01T00:00:00Z') }) });
    expect((await maybeSendMayaWelcome('enr-1', h.deps)).outcome).toBe('not_new');
    expect(h.sendDm).not.toHaveBeenCalled();
  });
  it('a throwing dependency is an outcome, never an exception (signup must not break)', async () => {
    const h = harness('shadow', { findEnrollment: async () => { throw new Error('db down'); } });
    await expect(maybeSendMayaWelcome('enr-1', h.deps)).resolves.toEqual({ outcome: 'error' });
  });
});

describe('synthetic accounts are not people (MR4)', () => {
  /**
   * An end-to-end job creates one fixture enrollment every day at 13:30 UTC. Three of the
   * first 13 ledger rows were for it, and the composed body read "Welcome to Colaberry,
   * Points." The exclusion is by reserved domain rather than by name, so the next probe,
   * which will have a different name, is excluded too.
   */
  const withEmail = (email: string | null) =>
    harness('live', { findEnrollment: async () => ({ ...NEW_EXPLORER, email }) });

  it.each([
    ['the daily smoke fixture', 'e2e-points-1794490203287@colaberry-test.local'],
    ['a probe on a reserved TLD', 'c107-probe-1793879440303@colaberry-test.local'],
    ['a .test domain', 'someone@colaberry.test'],
    ['a .example domain', 'aisha.patel@northwind-demo.example'],
    ['a documentation domain', 'closecheck-1783337300@example.com'],
  ])('skips %s, and sends nothing', async (_label, email) => {
    const h = withEmail(email);
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'not_routable' });
    expect(h.sendDm).not.toHaveBeenCalled();
  });

  it('leaves NO ledger row for a fixture, so a probe is not mistaken for a suppressed greeting', async () => {
    const h = withEmail('e2e-points-1794490203287@colaberry-test.local');
    await maybeSendMayaWelcome('enr-1', h.deps);
    expect(h.ledger.size).toBe(0);
  });

  it('still welcomes a real person whose address merely contains "test"', async () => {
    // 84 explorer rows contain that substring and most are real people. Matching it would
    // silence Maya for real prospects, which is the worse failure.
    const h = withEmail('testa.ngozi@gmail.com');
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'sent' });
    expect(h.sendDm).toHaveBeenCalledTimes(1);
  });

  it('still welcomes someone whose company domain starts with "test"', async () => {
    const h = withEmail('dana@testingtechnologies.com');
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'sent' });
  });

  it('does not skip an enrollment that simply has no address on file', async () => {
    // "No address" is a different problem from "test account". Treating it as non-routable
    // would silently drop a real person.
    const h = withEmail(null);
    expect(await maybeSendMayaWelcome('enr-1', h.deps)).toMatchObject({ outcome: 'sent' });
  });
});

describe('the message', () => {
  it('says she is an AI, uses the first name, and never the banned word or an em dash', () => {
    const m = mayaWelcomeMessage('Sam');
    expect(m).toContain(AI_DISCLOSURE);
    expect(m).toContain('Welcome to Colaberry, Sam.');
    expect(m).not.toMatch(/\bfree\b/i);
    expect(m).not.toMatch(/—/);
    expect(m).not.toMatch(/\$|\d/); // no price, no date
    expect(mayaWelcomeMessage('')).toContain('Welcome to Colaberry. ');
  });
});

describe('ensureMayaWelcomeTable', () => {
  it('is CREATE TABLE IF NOT EXISTS with a UNIQUE enrollment, run once per process however often it is called', async () => {
    __resetMayaWelcomeTableForTests();
    const q = sequelize.query as unknown as jest.Mock;
    q.mockReset().mockResolvedValue([]);
    await ensureMayaWelcomeTable();
    await ensureMayaWelcomeTable();
    expect(q).toHaveBeenCalledTimes(1);
    const sql = String(q.mock.calls[0][0]);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS maya_welcome_ledger/);
    expect(sql).toMatch(/enrollment_id UUID NOT NULL UNIQUE/);
  });
  it('a failed create is retried on the next call rather than memoized as done', async () => {
    __resetMayaWelcomeTableForTests();
    const q = sequelize.query as unknown as jest.Mock;
    q.mockReset().mockRejectedValueOnce(new Error('db down')).mockResolvedValue([]);
    await expect(ensureMayaWelcomeTable()).rejects.toThrow('db down');
    await ensureMayaWelcomeTable();
    expect(q).toHaveBeenCalledTimes(2);
  });
});
