/**
 * T6 and T7 - the queue that holds a message until a person decides it, and the sweep that can
 * only let one expire.
 *
 * Every test here is one clause of the invariant:
 *
 *   No message Maya composes for a real person is delivered without Ali deciding that exact
 *   message. Not by a retry, a replay, a cron, a timeout, a second tool call, or a bulk button.
 *
 * The model is faked in memory rather than mocked call-by-call, because the properties being
 * tested are about CONCURRENT state transitions - who wins a claim - and a `jest.fn()` that
 * returns a fixed value cannot express losing a race.
 */

interface Row {
  id: string;
  [k: string]: unknown;
}

const store: Row[] = [];
let nextId = 1;

/** Does this row match a Sequelize-style `where`? Only the operators this service uses. */
function matches(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === 'object') {
      const ops = v as Record<symbol, unknown>;
      const lt = Object.getOwnPropertySymbols(ops).find((s) => String(s).includes('lt'));
      if (lt) return (row[k] as Date) < (ops[lt] as Date);
      return false;
    }
    return row[k] === v;
  });
}

class UniqueViolation extends Error {
  constructor() { super('duplicate key'); this.name = 'SequelizeUniqueConstraintError'; }
}

jest.mock('sequelize', () => {
  const actual = jest.requireActual('sequelize');
  return { ...actual, UniqueConstraintError: UniqueViolation };
});

jest.mock('../../../models/MayaOutboundApproval', () => ({
  __esModule: true,
  default: {
    create: jest.fn(async (values: Record<string, unknown>) => {
      if (store.some((r) => r.idempotency_key === values.idempotency_key)) throw new UniqueViolation();
      const row: Row = {
        ...values,
        id: `row-${nextId++}`,
        reload: async () => undefined,
      };
      store.push(row);
      return row;
    }),
    findByPk: jest.fn(async (id: string) => store.find((r) => r.id === id) ?? null),
    findOne: jest.fn(async (opts: { where: Record<string, unknown> }) =>
      store.find((r) => matches(r, opts.where)) ?? null),
    findAll: jest.fn(async (opts: { where?: Record<string, unknown> }) =>
      store.filter((r) => matches(r, opts?.where))),
    // The whole point: an UPDATE with a `where` on `status` affects only rows still in that
    // status, and reports how many it moved. That count is what decides a race.
    update: jest.fn(async (values: Record<string, unknown>, opts: { where: Record<string, unknown> }) => {
      const hit = store.filter((r) => matches(r, opts.where));
      for (const r of hit) Object.assign(r, values);
      return [hit.length];
    }),
  },
}));

jest.mock('../../agentDomain/recordedHumans', () => ({ resolveRecordedHumans: jest.fn() }));
jest.mock('../../../config/database', () => ({ sequelize: {} }));
jest.mock('../mayaOutboundDelivery', () => ({ deliverOutboundRow: jest.fn() }));

import MayaOutboundApproval from '../../../models/MayaOutboundApproval';
import {
  OUTBOUND_EXPIRY_DAYS, approveOutbound, computeBodyHash, enqueueOutbound, listPendingOutbound,
  rejectOutbound, withdrawOutbound, type MayaOutboundQueueDeps,
} from '../mayaOutboundQueue';
import { sweepExpiredMayaOutbound } from '../mayaOutboundExpiry';

const NOW = new Date('2026-11-13T12:00:00Z');
const deliver = jest.fn();

function deps(over: Partial<MayaOutboundQueueDeps> = {}): MayaOutboundQueueDeps {
  return {
    recordedHumans: async (email: string) => (email === 'ali@colaberry.com' ? [email] : []),
    deliver: deliver as unknown as MayaOutboundQueueDeps['deliver'],
    now: () => NOW,
    ...over,
  };
}

const input = (over: Record<string, unknown> = {}) => ({
  recipientRef: 'lead:9e1f', recipientAddress: 'visitor@example.com', recipientDisplay: 'A Visitor',
  channel: 'email', subject: 'Your Executive Briefing', body: '<html>the real bytes</html>',
  composedBy: 'send_document', capability: 'sendDocument', correlationId: 'corr-1',
  idempotencyKey: 'maya-doc-exec-9e1f', ...over,
});

beforeEach(() => {
  store.length = 0;
  nextId = 1;
  jest.clearAllMocks();
  deliver.mockResolvedValue({ providerRef: 'prov-1' });
});

describe('T6 enqueue stores the message, not a description of it', () => {
  it('writes one pending row holding the exact bytes and their hash', async () => {
    const res = await enqueueOutbound(input(), deps());
    expect(res.deduped).toBe(false);
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({
      status: 'pending_approval', body: '<html>the real bytes</html>',
      body_hash: computeBodyHash('<html>the real bytes</html>'),
      recipient_ref: 'lead:9e1f', capability: 'sendDocument',
    });
  });

  it('refuses an empty body rather than storing a placeholder', async () => {
    await expect(enqueueOutbound(input({ body: '   ' }), deps())).rejects.toThrow(/ContractViolation/);
    expect(store).toHaveLength(0);
  });

  it('never writes decided_by, so a new row cannot arrive pre-decided', async () => {
    await enqueueOutbound(input(), deps());
    expect(store[0].decided_by).toBeUndefined();
  });

  it('sets an expiry seven days out, and expiry is the only deadline it has', async () => {
    await enqueueOutbound(input(), deps());
    const expected = new Date(NOW.getTime() + OUTBOUND_EXPIRY_DAYS * 86400000);
    expect(store[0].expires_at).toEqual(expected);
  });

  it('A REPLAY ADDS NO ROW - composing the same message twice is one thing to approve', async () => {
    const first = await enqueueOutbound(input(), deps());
    const second = await enqueueOutbound(input(), deps());
    expect(store).toHaveLength(1);
    expect(second).toMatchObject({ id: first.id, deduped: true });
  });
});

describe('T6 approving is a person deciding one exact message', () => {
  async function queued(): Promise<string> {
    return (await enqueueOutbound(input(), deps())).id;
  }

  it('delivers once and records who decided it', async () => {
    const id = await queued();
    const res = await approveOutbound(id, 'ali@colaberry.com', 'Read it, send it', deps());
    expect(res).toMatchObject({ ok: true, status: 'sent' });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(store[0]).toMatchObject({ status: 'sent', decided_by: 'ali@colaberry.com' });
    expect(store[0].delivered_at).toBeTruthy();
  });

  it('hands the delivery path the STORED row, so it transmits the reviewed bytes', async () => {
    const id = await queued();
    await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    expect(deliver.mock.calls[0][0]).toMatchObject({ id, body: '<html>the real bytes</html>' });
  });

  it('A SECOND TOOL CALL SENDS NOTHING - the second approve loses the claim', async () => {
    const id = await queued();
    await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    const again = await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    expect(again).toMatchObject({ ok: false, refusal: 'not_awaiting_approval', status: 'sent' });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('A RETRY SENDS NOTHING - two concurrent approvals produce one delivery', async () => {
    const id = await queued();
    const [a, b] = await Promise.all([
      approveOutbound(id, 'ali@colaberry.com', undefined, deps()),
      approveOutbound(id, 'ali@colaberry.com', undefined, deps()),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('A TAMPERED BODY SENDS NOTHING - what was shown is what is sent, or nothing is', async () => {
    const id = await queued();
    store[0].body = '<html>something else entirely</html>';
    const res = await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    expect(res).toMatchObject({ ok: false, refusal: 'body_changed_since_review' });
    expect(deliver).not.toHaveBeenCalled();
    // And the row is left where it was, so the tamper is visible rather than absorbed.
    expect(store[0].status).toBe('pending_approval');
  });

  it('AN UNRECORDED APPROVER SENDS NOTHING, and `unknown` is the one that matters', async () => {
    // `unknown` is the DEFAULT `approvedBy` elsewhere in this repo, so it is the value an
    // un-attributed call actually arrives with, not a hypothetical.
    const id = await queued();
    const res = await approveOutbound(id, 'unknown', undefined, deps());
    expect(res).toMatchObject({ ok: false, refusal: 'approver_is_non_human' });
    expect(deliver).not.toHaveBeenCalled();
    expect(store[0].status).toBe('pending_approval');
  });

  it.each(['system:auto_approve_timeout', 'system:retry', 'system:replay'])(
    'A TIMER SENDS NOTHING - %s is refused before anything is claimed',
    async (who) => {
      const id = await queued();
      const res = await approveOutbound(id, who, undefined, deps());
      expect(res).toMatchObject({ ok: false, refusal: 'approver_is_non_human' });
      expect(deliver).not.toHaveBeenCalled();
    },
  );

  it('an admin we hold no record of is refused, because a denylist cannot establish humanity', async () => {
    const id = await queued();
    const res = await approveOutbound(id, 'stranger@example.com', undefined, deps());
    expect(res).toMatchObject({ ok: false, refusal: 'approver_not_a_recorded_human' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('a failed delivery records the failure and is NOT retried', async () => {
    const id = await queued();
    deliver.mockRejectedValue(new TypeError('provider refused'));
    const res = await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    expect(res).toMatchObject({ ok: false, status: 'failed' });
    expect(store[0]).toMatchObject({ status: 'failed', failure_reason: expect.any(String) });
    // Approving again does not re-attempt: the row is no longer awaiting a decision.
    const again = await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    expect(again).toMatchObject({ ok: false, refusal: 'not_awaiting_approval' });
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('refuses an id that does not exist rather than inventing a row', async () => {
    expect(await approveOutbound('row-999', 'ali@colaberry.com', undefined, deps()))
      .toMatchObject({ ok: false, refusal: 'row_not_found' });
  });
});

describe('T6 rejecting and withdrawing are terminal, and neither delivers', () => {
  it('a rejection records who said no and sends nothing', async () => {
    const id = (await enqueueOutbound(input(), deps())).id;
    const res = await rejectOutbound(id, 'ali@colaberry.com', 'Wrong document', deps());
    expect(res).toMatchObject({ ok: true, status: 'rejected' });
    expect(store[0]).toMatchObject({ status: 'rejected', decided_by: 'ali@colaberry.com' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('a rejected message cannot then be approved', async () => {
    const id = (await enqueueOutbound(input(), deps())).id;
    await rejectOutbound(id, 'ali@colaberry.com', 'Wrong document', deps());
    expect(await approveOutbound(id, 'ali@colaberry.com', undefined, deps()))
      .toMatchObject({ ok: false, refusal: 'not_awaiting_approval' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('a rejection by a non-person is refused too', async () => {
    const id = (await enqueueOutbound(input(), deps())).id;
    expect(await rejectOutbound(id, 'system:auto_approve_timeout', 'x', deps()))
      .toMatchObject({ ok: false, refusal: 'approver_is_non_human' });
  });

  it('the composing side can withdraw a message nobody decided yet', async () => {
    await enqueueOutbound(input(), deps());
    const res = await withdrawOutbound('maya-doc-exec-9e1f', 'visitor asked us not to', deps());
    expect(res).toMatchObject({ ok: true, status: 'withdrawn' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('but cannot withdraw one that was already decided', async () => {
    const id = (await enqueueOutbound(input(), deps())).id;
    await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    expect(await withdrawOutbound('maya-doc-exec-9e1f', 'too late', deps()))
      .toMatchObject({ ok: false, refusal: 'not_awaiting_approval' });
  });
});

describe('T6 the review list shows what is waiting, one message at a time', () => {
  it('lists only pending rows, oldest first', async () => {
    await enqueueOutbound(input({ idempotencyKey: 'k1' }), deps());
    await enqueueOutbound(input({ idempotencyKey: 'k2' }), deps());
    const id3 = (await enqueueOutbound(input({ idempotencyKey: 'k3' }), deps())).id;
    await rejectOutbound(id3, 'ali@colaberry.com', 'no', deps());
    const pending = await listPendingOutbound();
    expect(pending.map((r) => (r as unknown as Row).idempotency_key)).toEqual(['k1', 'k2']);
    expect((MayaOutboundApproval.findAll as jest.Mock).mock.calls[0][0].order).toEqual([['created_at', 'ASC']]);
  });

  it('exports NO bulk approve function, because approving is one decision at a time', async () => {
    const api = await import('../mayaOutboundQueue');
    const bulk = Object.keys(api).filter((k) => /all|bulk|batch|each/i.test(k));
    expect(bulk).toEqual([]);
  });
});

describe('T7 the sweep can only let a message expire', () => {
  it('A TIMEOUT SENDS NOTHING - an undecided message past its deadline expires', async () => {
    await enqueueOutbound(input(), deps());
    const later = new Date(NOW.getTime() + (OUTBOUND_EXPIRY_DAYS + 1) * 86400000);
    expect(await sweepExpiredMayaOutbound(later)).toEqual({ expired: 1 });
    expect(store[0].status).toBe('expired');
    expect(store[0].decided_by).toBeUndefined();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('an expired message cannot then be approved', async () => {
    const id = (await enqueueOutbound(input(), deps())).id;
    await sweepExpiredMayaOutbound(new Date(NOW.getTime() + 8 * 86400000));
    expect(await approveOutbound(id, 'ali@colaberry.com', undefined, deps()))
      .toMatchObject({ ok: false, refusal: 'not_awaiting_approval', status: 'expired' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('leaves a message that is still inside its window alone', async () => {
    await enqueueOutbound(input(), deps());
    expect(await sweepExpiredMayaOutbound(new Date(NOW.getTime() + 86400000))).toEqual({ expired: 0 });
    expect(store[0].status).toBe('pending_approval');
  });

  it('never touches a message a person already decided', async () => {
    const id = (await enqueueOutbound(input(), deps())).id;
    await approveOutbound(id, 'ali@colaberry.com', undefined, deps());
    await sweepExpiredMayaOutbound(new Date(NOW.getTime() + 9 * 86400000));
    expect(store[0].status).toBe('sent');
  });

  it('writes expired and literally nothing else', async () => {
    await enqueueOutbound(input(), deps());
    await sweepExpiredMayaOutbound(new Date(NOW.getTime() + 8 * 86400000));
    const [values] = (MayaOutboundApproval.update as jest.Mock).mock.calls.at(-1)!;
    expect(Object.keys(values).sort()).toEqual(['status', 'updated_at']);
    expect(values.status).toBe('expired');
  });
});
