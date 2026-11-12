/**
 * MR2 - Maya's `sendEmail` capability. The first one whose action leaves the platform.
 *
 * ── WHAT EACH GROUP IS DEFENDING, worst consequence first ───────────────────
 *
 *   1. **Shadow sends nothing.** Proven the only way it can be proven: the transport stub is
 *      asserted to have been called zero times. A test that merely checks the returned outcome
 *      string would pass with a service that mailed everybody and then said "shadow".
 *   2. **A suppressed recipient leaves NO ledger row.** `agentEmailTool` states the rule this
 *      follows: a message to somebody who unsubscribed must not sit in a queue waiting for a
 *      tired reviewer to approve it. A blocked send that still recorded a draft would be a
 *      mechanism for overriding an unsubscribe later.
 *   3. **A second attempt writes no second row.** Arbitrated by a UNIQUE index, not by a
 *      read-then-write, because a read-then-write is a race and this race mails people twice.
 *   4. **No lead means refuse.** Consent lives on the lead. The failure mode being prevented is
 *      mailing somebody whose unsubscribe we were unable to look up.
 *   5. **The copy is right.** AI disclosed, no price, no date, no "free", no promise that a
 *      person will be in touch.
 *
 * The ledger here is an in-memory Map keyed the way Postgres keys it, so "the index decides the
 * claim" is modelled rather than asserted. Same convention as `mayaWelcomeService.test.ts`.
 */
export {};

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../mayaPromotion', () => ({ resolveMayaMode: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  sendMayaEmailForPurpose, mayaEmailBusinessEventId,
} = require('../mayaEmailService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeIdempotencyKey } = require('../../email/idempotencyKey');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AI_DISCLOSURE } = require('../mayaDisclosure');

type Mode = 'off' | 'shadow' | 'live';

interface Row {
  idempotencyKey: string; purpose: string; mode: string;
  recipient: string; subject: string; body: string; leadId: number;
  providerMessageId?: string; detail?: string; deliveredAt?: string;
}

const REQ = {
  purpose: 'explorer_welcome' as const,
  recipient: 'dana.reyes@gmail.com',
  recipientName: 'Dana Reyes',
  subjectRef: 'enr-123',
};

function harness(mode: Mode, over: Record<string, unknown> = {}) {
  const ledger = new Map<string, Row>();
  const send = jest.fn(async () => ({ outcome: 'sent' as const, messageId: 'msg-1' }));
  const evaluate = jest.fn(async () => ({ allowed: true }));
  const findLeadId = jest.fn(async () => 77 as number | null);
  const ensureTable = jest.fn(async () => undefined);

  const deps = {
    mode: async () => ({ capability: 'sendEmail', mode, reason: 'test' }),
    findLeadId,
    evaluate,
    ensureTable,
    // The UNIQUE index, modelled: the insert succeeds only if the key is absent.
    claim: jest.fn(async (row: Row) => {
      if (ledger.has(row.idempotencyKey)) return false;
      ledger.set(row.idempotencyKey, { ...row });
      return true;
    }),
    send,
    markDelivered: jest.fn(async (key: string, providerMessageId: string) => {
      const r = ledger.get(key);
      if (r && !r.deliveredAt) {
        r.deliveredAt = '2026-11-12T00:00:00Z';
        r.providerMessageId = providerMessageId;
      }
    }),
    markFailed: jest.fn(async (key: string, detail: string) => {
      const r = ledger.get(key);
      if (r) r.detail = detail;
    }),
    ...over,
  };
  return { deps, ledger, send, evaluate, findLeadId, ensureTable };
}

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { warnSpy.mockRestore(); logSpy.mockRestore(); });

describe('shadow records and sends nothing', () => {
  it('writes exactly one row carrying the composed body, and never calls the transport', async () => {
    const h = harness('shadow');

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res).toMatchObject({ outcome: 'recorded_shadow', mode: 'shadow' });
    expect(h.ledger.size).toBe(1);
    expect(h.send).not.toHaveBeenCalled();
    const row = [...h.ledger.values()][0];
    expect(row.mode).toBe('shadow');
    expect(row.body.length).toBeGreaterThan(40);
    expect(row.deliveredAt).toBeUndefined();
    expect(row.providerMessageId).toBeUndefined();
  });

  it('records the subject and recipient the send would have used', async () => {
    const h = harness('shadow');
    await sendMayaEmailForPurpose(REQ, h.deps);
    const row = [...h.ledger.values()][0];
    expect(row.recipient).toBe(REQ.recipient);
    expect(row.subject).toBe('Welcome to Colaberry');
    expect(row.leadId).toBe(77);
    expect(row.purpose).toBe('explorer_welcome');
  });

  it('keys the row with the real idempotency formula, not an ad-hoc string', async () => {
    const h = harness('shadow');
    const res = await sendMayaEmailForPurpose(REQ, h.deps);
    const expected = computeIdempotencyKey(
      REQ.recipient, 'Welcome to Colaberry',
      mayaEmailBusinessEventId('explorer_welcome', REQ.subjectRef),
    );
    expect(res.idempotencyKey).toBe(expected);
    expect(h.ledger.has(expected)).toBe(true);
  });
});

describe('once, and the index decides it', () => {
  it('a second identical attempt writes no second row', async () => {
    const h = harness('shadow');

    const first = await sendMayaEmailForPurpose(REQ, h.deps);
    const second = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(first.outcome).toBe('recorded_shadow');
    expect(second.outcome).toBe('already_recorded');
    expect(h.ledger.size).toBe(1);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('a different person for the same purpose does get a row', async () => {
    // The guard against over-deduping: `subjectRef` is inside the business event id precisely so
    // two people cannot collide, including when a test redirect points both at one address.
    const h = harness('shadow');

    await sendMayaEmailForPurpose(REQ, h.deps);
    await sendMayaEmailForPurpose(
      { ...REQ, recipient: 'sam.okafor@gmail.com', subjectRef: 'enr-456' }, h.deps,
    );

    expect(h.ledger.size).toBe(2);
  });

  it('a shadow row is never upgraded to a send when the capability goes live', async () => {
    // Promotion must not mail people retroactively. The claim is the record that they are done.
    const shadow = harness('shadow');
    await sendMayaEmailForPurpose(REQ, shadow.deps);
    const rowsAfterShadow = shadow.ledger.size;

    // same ledger, now live
    const live = harness('live', { claim: shadow.deps.claim });
    const res = await sendMayaEmailForPurpose(REQ, live.deps);

    expect(res.outcome).toBe('already_recorded');
    expect(live.send).not.toHaveBeenCalled();
    expect(shadow.ledger.size).toBe(rowsAfterShadow);
  });
});

describe('the consent gate is on the path and a refusal leaves no trace', () => {
  it('a suppressed recipient is refused with the named reason', async () => {
    const h = harness('shadow', {
      evaluate: jest.fn(async () => ({ allowed: false, blockedReason: 'unsubscribed' })),
    });

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res.outcome).toBe('blocked');
    expect(res.reason).toBe('unsubscribed');
  });

  it('and writes ZERO ledger rows, so no queue can override the unsubscribe later', async () => {
    const h = harness('shadow', {
      evaluate: jest.fn(async () => ({ allowed: false, blockedReason: 'unsubscribed' })),
    });

    await sendMayaEmailForPurpose(REQ, h.deps);

    expect(h.ledger.size).toBe(0);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('a refusal with no stated reason still reports a named one', async () => {
    const h = harness('shadow', { evaluate: jest.fn(async () => ({ allowed: false })) });
    const res = await sendMayaEmailForPurpose(REQ, h.deps);
    expect(res.reason).toBe('send_not_allowed');
  });

  it('honours a test-mode redirect rather than mailing the real address', async () => {
    const h = harness('live', {
      evaluate: jest.fn(async () => ({ allowed: true, redirectEmail: 'qa@colaberry.com' })),
    });

    await sendMayaEmailForPurpose(REQ, h.deps);

    expect(h.send).toHaveBeenCalledTimes(1);
    expect((h.send.mock.calls[0] as unknown as [{ recipient: string }])[0].recipient)
      .toBe('qa@colaberry.com');
    expect([...h.ledger.values()][0].recipient).toBe('qa@colaberry.com');
  });

  it('a consent gate that throws does not become a send', async () => {
    const h = harness('live', {
      evaluate: jest.fn(async () => { throw new Error('settings unreachable'); }),
    });

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res.outcome).toBe('error');
    expect(h.send).not.toHaveBeenCalled();
    expect(h.ledger.size).toBe(0);
  });
});

describe('an unverifiable recipient is refused, not guessed at', () => {
  it('no lead row means no send and no ledger row', async () => {
    const h = harness('live', { findLeadId: jest.fn(async () => null) });

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res.outcome).toBe('no_lead');
    expect(h.ledger.size).toBe(0);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
  });

  it.each([
    'points.smoke@colaberry-test.local',
    'probe@colaberry.test',
    'demo@northwind-demo.example',
    'anyone@example.com',
  ])('a non-routable address (%s) is refused before anything else happens', async (addr) => {
    const h = harness('live');

    const res = await sendMayaEmailForPurpose({ ...REQ, recipient: addr }, h.deps);

    expect(res.outcome).toBe('not_routable');
    expect(h.ledger.size).toBe(0);
    expect(h.findLeadId).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it('a real address that merely contains the word test is NOT refused', async () => {
    // 84 explorer enrollments contain the substring "test" and most are real people. Silencing
    // one of them is the worse failure of the two.
    const h = harness('shadow');
    const res = await sendMayaEmailForPurpose(
      { ...REQ, recipient: 'testa.nguyen@gmail.com' }, h.deps,
    );
    expect(res.outcome).toBe('recorded_shadow');
  });
});

describe('off means nothing at all', () => {
  it('writes no row, resolves no lead, asks no gate, sends nothing', async () => {
    const h = harness('off');

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res).toMatchObject({ outcome: 'off', mode: 'off' });
    expect(h.ledger.size).toBe(0);
    expect(h.findLeadId).not.toHaveBeenCalled();
    expect(h.evaluate).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.ensureTable).not.toHaveBeenCalled();
  });
});

describe('live sends once and records the outcome truthfully', () => {
  it('claims, sends once, and marks the row delivered with the provider id', async () => {
    const h = harness('live');

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res).toMatchObject({ outcome: 'sent', mode: 'live' });
    expect(h.send).toHaveBeenCalledTimes(1);
    const row = [...h.ledger.values()][0];
    expect(row.mode).toBe('live');
    expect(row.deliveredAt).toBeDefined();
    expect(row.providerMessageId).toBe('msg-1');
  });

  it('claims BEFORE sending, so a crash between the two cannot double-send', async () => {
    const order: string[] = [];
    const h = harness('live', {
      claim: jest.fn(async () => { order.push('claim'); return true; }),
      send: jest.fn(async () => { order.push('send'); return { outcome: 'sent', messageId: 'm' }; }),
    });

    await sendMayaEmailForPurpose(REQ, h.deps);

    expect(order).toEqual(['claim', 'send']);
  });

  it('a transport failure is recorded as failed and never as delivered', async () => {
    const h = harness('live', {
      send: jest.fn(async () => ({ outcome: 'failed', errorClass: 'SendRefused' })),
    });

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res.outcome).toBe('send_failed');
    const row = [...h.ledger.values()][0];
    expect(row.deliveredAt).toBeUndefined();
    expect(row.detail).toBe('SendRefused');
  });

  it('a skipped transport (the send ledger already holds the claim) is not reported as sent', async () => {
    const h = harness('live', { send: jest.fn(async () => ({ outcome: 'skipped' })) });

    const res = await sendMayaEmailForPurpose(REQ, h.deps);

    expect(res.outcome).toBe('send_failed');
    expect([...h.ledger.values()][0].detail).toBe('send_skipped');
  });

  it('does not retry after a failed send', async () => {
    // A retry after a claim is how one message becomes two.
    const send = jest.fn(async () => ({ outcome: 'failed', errorClass: 'Boom' }));
    const h = harness('live', { send });
    await sendMayaEmailForPurpose(REQ, h.deps);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('the copy', () => {
  async function body(name?: string | null): Promise<string> {
    const h = harness('shadow');
    await sendMayaEmailForPurpose({ ...REQ, recipientName: name ?? null }, h.deps);
    return [...h.ledger.values()][0].body;
  }

  it('discloses that she is an AI', async () => {
    expect(await body('Dana')).toContain(AI_DISCLOSURE);
  });

  it('greets a valid first name and silently drops anything that is not one', async () => {
    expect(await body('Dana Reyes')).toContain('Dana');
    for (const junk of ['', '   ', '123', 'a'.repeat(40), '<script>', null]) {
      const b = await body(junk as string | null);
      expect(b).toContain('Welcome to Colaberry.');
    }
  });

  it('states no price, no date, no deadline and no seat count', async () => {
    const b = await body('Dana');
    expect(b).not.toMatch(/\$\d|\d+\s*(dollars|usd)/i);
    expect(b).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(b).not.toMatch(/\bseats?\b|\bdeadline\b|\benrol(l)?ment closes\b/i);
  });

  it('never uses the word free', async () => {
    // 40 TAC 807.172(d). A standing rule for every outbound surface on this project.
    expect(await body('Dana')).not.toMatch(/\bfree\b/i);
  });

  it('does not promise that a person will reach out', async () => {
    // Nobody has committed to that, and MR1's defect 3 was a sentence in outbound mail that
    // described something the code never did.
    const b = await body('Dana');
    expect(b).not.toMatch(/will (call|contact|reach out|be in touch)/i);
    expect(b).not.toMatch(/someone will/i);
  });
});

describe('the log carries no contact detail', () => {
  it('names the purpose and the key but never the recipient, subject or body', async () => {
    const h = harness('shadow');

    await sendMayaEmailForPurpose(REQ, h.deps);

    const lines = [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((c) => String(c[0])).filter((s) => s.startsWith('{'));
    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('\n');
    expect(all).not.toContain(REQ.recipient);
    expect(all).not.toContain('Dana');
    expect(all).not.toContain('@');
    const parsed = lines.map((s) => JSON.parse(s));
    const recorded = parsed.find((l) => l.event === 'maya_email_recorded_shadow');
    expect(recorded).toBeDefined();
    expect(recorded.outcome).toBe('success');
    expect(recorded.service).toBe('maya');
    expect(recorded.context.purpose).toBe('explorer_welcome');
    expect(recorded.context.idempotency_key).toHaveLength(32);
  });

  it('a blocked send logs the reason without the address', async () => {
    const h = harness('shadow', {
      evaluate: jest.fn(async () => ({ allowed: false, blockedReason: 'brand_preference_off' })),
    });

    await sendMayaEmailForPurpose(REQ, h.deps);

    const all = warnSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(all).toContain('brand_preference_off');
    expect(all).not.toContain(REQ.recipient);
    expect(all).not.toContain('@');
  });
});
