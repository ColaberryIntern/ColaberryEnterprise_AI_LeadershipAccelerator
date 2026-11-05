/**
 * AF11.3 service — the part the pure contract cannot prove: what is WRITTEN, and when nothing is.
 *
 * The contract decides whether a decision may stand. This file is about the three properties that
 * only exist once there is a transaction:
 *
 *   1. **A refused decision writes NOTHING.** Not a log row, not a parent update. A refusal that
 *      still left a decision row would be a record of something that did not happen.
 *   2. **`send_back` does not stamp an approver.** It leaves the parent at `submitted` because the
 *      request is still live, so `approved_by_identity` must stay null — a sent-back request that
 *      names an approver reads as decided to everything downstream.
 *   3. **The row is LOCKED inside the transaction.** Two simultaneous decisions must not both see
 *      `submitted` and both proceed. A status check made before the transaction opened would be
 *      worthless, which is why `decideChangeRequest` locks for the same reason.
 *
 * ## One deliberate difference from AF4.2, stated rather than left to be discovered
 *
 * `decideChangeRequest` stores `recorded[0]` — the roster's own spelling of the approver.  This
 * service stores the email the verified token carried. The roster can hold more than one spelling
 * for a person and `recorded[0]` is then arbitrary ordering, whereas the token email is exactly
 * who made the call. Both are honest; this one does not depend on a sort order nobody declared.
 */

const mockResolve = jest.fn();
const mockCatalog = jest.fn();
const mockFindByPk = jest.fn();
const mockCreate = jest.fn();
const mockFindAll = jest.fn();

jest.mock('./../recordedHumans', () => ({
  resolveRecordedHumans: (...a: unknown[]) => mockResolve(...a),
}));
jest.mock('./../toolCatalogForMatching', () => ({
  loadToolCatalogForMatching: (...a: unknown[]) => mockCatalog(...a),
}));
jest.mock('../../../models/AgentDomainChangeRequest', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockFindByPk(...a) },
}));
jest.mock('../../../models/AgentDomainToolRequestDecision', () => ({
  __esModule: true,
  default: {
    create: (...a: unknown[]) => mockCreate(...a),
    findAll: (...a: unknown[]) => mockFindAll(...a),
  },
}));

import { Transaction } from 'sequelize';
import {
  DEFAULT_TOOL_GRANT_APPROVERS,
  ToolRequestDecisionRefusedError,
  ToolRequestNotFoundError,
  configuredApprovers,
  decideToolRequest,
  loadDecisions,
} from '../toolRequestDecisionService';

const ID = '11111111-2222-4333-8444-555555555555';
const APPROVER = 'ali@colaberry.com';
const PROPOSER = 'mihret@colaberry.com';

/** A fake transaction runner, so the callback really runs and the writes are observable. */
const sequelize = {
  transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({ id: 'txn-1' }),
} as never;

function stageRow(over: Record<string, unknown> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  const row = {
    id: ID,
    kind: 'tool',
    status: 'submitted',
    requested_by_identity: PROPOSER,
    update,
    ...over,
  };
  mockFindByPk.mockResolvedValue(row);
  return { row, update };
}

let logSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockResolve.mockResolvedValue([APPROVER, PROPOSER]);
  mockCatalog.mockResolvedValue({
    tools: [{ tool_name: 'fetch_skool_posts', reads: [], produces: [] }],
    degraded: false,
  });
  mockCreate.mockImplementation(async (values: Record<string, unknown>) => ({
    ...values,
    decided_at: values.decided_at ?? new Date('2026-11-05T15:00:00Z'),
  }));
});
afterEach(() => logSpy.mockRestore());

describe('PROPERTY 1 — a refused decision writes nothing', () => {
  it('writes no decision row and does not touch the parent when the decider is the proposer', async () => {
    const { update } = stageRow();
    await expect(decideToolRequest({
      sequelize, email: PROPOSER, id: ID, proposed: { verb: 'approve_to_build' },
    })).rejects.toThrow(ToolRequestDecisionRefusedError);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing when the decider is not a configured approver', async () => {
    mockResolve.mockResolvedValue(['sarbjit@colaberry.com', PROPOSER]);
    const { update } = stageRow();
    await expect(decideToolRequest({
      sequelize, email: 'sarbjit@colaberry.com', id: ID, proposed: { verb: 'approve_to_build' },
    })).rejects.toThrow(/not one of the configured approvers/);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing when the request has already been decided', async () => {
    const { update } = stageRow({ status: 'approved' });
    await expect(decideToolRequest({
      sequelize, email: APPROVER, id: ID, proposed: { verb: 'deny', reason: 'no' },
    })).rejects.toThrow(/already/i);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('carries EVERY refusal, not the first', async () => {
    // The proposer, who is also not an approver, deciding an already-decided request.
    mockResolve.mockResolvedValue([PROPOSER]);
    stageRow({ status: 'declined' });
    try {
      await decideToolRequest({
        sequelize, email: PROPOSER, id: ID, proposed: { verb: 'approve_to_build' },
      });
      throw new Error('should have refused');
    } catch (e) {
      const rules = (e as ToolRequestDecisionRefusedError).issues.map((i) => i.rule);
      expect(rules).toContain('request_already_decided');
      expect(rules).toContain('decider_not_an_approver');
      expect(rules).toContain('proposer_cannot_decide');
    }
  });

  it('an UNREADABLE roster is a named refusal, never a pass', async () => {
    // The roster read is what establishes a person. Falling back to the denylist would let
    // `unknown` through, because `isNonHumanIdentity('unknown')` is false.
    mockResolve.mockRejectedValue(new Error('connection terminated'));
    const { update } = stageRow();
    try {
      await decideToolRequest({
        sequelize, email: APPROVER, id: ID, proposed: { verb: 'approve_to_build' },
      });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as ToolRequestDecisionRefusedError).issues.map((i) => i.rule))
        .toContain('decider_roster_absent');
    }
    expect(mockCreate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses the four-hour timer identity by name', async () => {
    stageRow();
    try {
      await decideToolRequest({
        sequelize, email: 'system:auto_approve_timeout', id: ID,
        proposed: { verb: 'approve_to_build' },
      });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as ToolRequestDecisionRefusedError).issues.map((i) => i.rule))
        .toContain('decider_is_non_human');
    }
  });

  it('refuses `unknown`, which is the identity that actually walks through', async () => {
    // `approvalRequestController` resolves its actor as `req.admin?.email || 'unknown'`, and a
    // denylist reads that as a person. The positive roster is the real gate.
    stageRow();
    try {
      await decideToolRequest({
        sequelize, email: 'unknown', id: ID, proposed: { verb: 'approve_to_build' },
      });
      throw new Error('should have refused');
    } catch (e) {
      const rules = (e as ToolRequestDecisionRefusedError).issues.map((i) => i.rule);
      expect(rules).toContain('decider_not_recorded');
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404s before judging anything when there is no such request', async () => {
    mockFindByPk.mockResolvedValue(null);
    await expect(decideToolRequest({
      sequelize, email: APPROVER, id: ID, proposed: { verb: 'approve_to_build' },
    })).rejects.toThrow(ToolRequestNotFoundError);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('PROPERTY 2 — what each verb writes', () => {
  it('approve_to_build records the actor and the time, and moves the parent to approved', async () => {
    const { update } = stageRow();
    const out = await decideToolRequest({
      sequelize, email: APPROVER, id: ID, proposed: { verb: 'approve_to_build' },
    });
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      change_request_id: ID,
      verb: 'approve_to_build',
      decided_by_identity: APPROVER,
    });
    expect(mockCreate.mock.calls[0][0].decided_at).toBeInstanceOf(Date);
    expect(update.mock.calls[0][0]).toMatchObject({
      status: 'approved', approved_by_identity: APPROVER,
    });
    expect(out.request_status).toBe('approved');
  });

  it('SEND_BACK leaves the parent alone entirely — no status change, no approver stamped', async () => {
    // The request is still live and the intern is expected to edit it. A sent-back request that
    // names an approver reads as decided to everything downstream.
    const { update } = stageRow();
    const out = await decideToolRequest({
      sequelize, email: APPROVER, id: ID,
      proposed: { verb: 'send_back', missing_field: 'touches' },
    });
    expect(update).not.toHaveBeenCalled();
    expect(out.request_status).toBe('submitted');
    // The decision itself IS recorded, which is the whole point of an append-only log.
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      verb: 'send_back', missing_field: 'touches', decided_by_identity: APPROVER,
    });
  });

  it('deny stores the reason on both the log row and the parent', async () => {
    const { update } = stageRow();
    await decideToolRequest({
      sequelize, email: APPROVER, id: ID,
      proposed: { verb: 'deny', reason: 'fetch_skool_posts already does this.' },
    });
    expect(mockCreate.mock.calls[0][0].reason).toBe('fetch_skool_posts already does this.');
    expect(update.mock.calls[0][0]).toMatchObject({
      status: 'declined', declined_reason: 'fetch_skool_posts already does this.',
    });
  });

  it('assign_existing_tool records the tool as an INTENT and grants nothing', async () => {
    const { update } = stageRow();
    await decideToolRequest({
      sequelize, email: APPROVER, id: ID,
      proposed: { verb: 'assign_existing_tool', assigned_tool_name: 'fetch_skool_posts' },
    });
    expect(mockCreate.mock.calls[0][0].assigned_tool_name).toBe('fetch_skool_posts');
    // The parent moves, and NOTHING else is written. No `tools_granted`, no `autonomy_level`.
    const written = Object.keys(update.mock.calls[0][0]);
    expect(written.sort()).toEqual(
      ['approved_at', 'approved_by_identity', 'declined_reason', 'status', 'updated_at'],
    );
  });

  it('refuses a tool the catalog does not have, because one cannot be created here', async () => {
    stageRow();
    try {
      await decideToolRequest({
        sequelize, email: APPROVER, id: ID,
        proposed: { verb: 'assign_existing_tool', assigned_tool_name: 'invented_tool' },
      });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as ToolRequestDecisionRefusedError).issues.map((i) => i.rule))
        .toContain('assigned_tool_unknown');
    }
  });

  it('refuses these four verbs on a CHANGE request', async () => {
    stageRow({ kind: 'change' });
    try {
      await decideToolRequest({
        sequelize, email: APPROVER, id: ID, proposed: { verb: 'approve_to_build' },
      });
      throw new Error('should have refused');
    } catch (e) {
      expect((e as ToolRequestDecisionRefusedError).issues.map((i) => i.rule))
        .toContain('not_a_tool_request');
    }
  });
});

describe('PROPERTY 3 — the row is locked inside the transaction', () => {
  it('reads the parent FOR UPDATE, and inside the transaction', async () => {
    stageRow();
    await decideToolRequest({
      sequelize, email: APPROVER, id: ID, proposed: { verb: 'approve_to_build' },
    });
    const opts = mockFindByPk.mock.calls[0][1] as { lock?: unknown; transaction?: unknown };
    expect(opts.lock).toBe(Transaction.LOCK.UPDATE);
    expect(opts.transaction).toEqual({ id: 'txn-1' });
  });

  it('writes the log row and the parent in the SAME transaction', async () => {
    const { update } = stageRow();
    await decideToolRequest({
      sequelize, email: APPROVER, id: ID, proposed: { verb: 'approve_to_build' },
    });
    expect(mockCreate.mock.calls[0][1]).toEqual({ transaction: { id: 'txn-1' } });
    expect(update.mock.calls[0][1]).toEqual({ transaction: { id: 'txn-1' } });
  });

  it('a DEGRADED catalog does not block a decision that does not need it', async () => {
    // `assign_existing_tool` needs the catalog; the other three do not, and a catalog read that
    // failed should not stop a denial from being recorded.
    mockCatalog.mockRejectedValue(new Error('no catalog'));
    stageRow();
    await expect(decideToolRequest({
      sequelize, email: APPROVER, id: ID, proposed: { verb: 'deny', reason: 'Not needed.' },
    })).resolves.toMatchObject({ verb: 'deny' });
  });
});

describe('the approver set is configuration, and an empty one refuses everybody', () => {
  it('falls back to the documented default when the variable is absent', () => {
    expect(configuredApprovers({} as NodeJS.ProcessEnv)).toEqual(DEFAULT_TOOL_GRANT_APPROVERS);
  });

  it('falls back to the default on an EMPTY value rather than opening the gate', () => {
    // The fail-open reading of an empty list is a mistake this subtree has made more than once.
    expect(configuredApprovers({ TOOL_GRANT_APPROVERS: '' } as NodeJS.ProcessEnv))
      .toEqual(DEFAULT_TOOL_GRANT_APPROVERS);
    expect(configuredApprovers({ TOOL_GRANT_APPROVERS: '  ,  , ' } as NodeJS.ProcessEnv))
      .toEqual(DEFAULT_TOOL_GRANT_APPROVERS);
  });

  it('reads a comma-separated list, trimmed and lowercased', () => {
    expect(configuredApprovers({
      TOOL_GRANT_APPROVERS: ' Ali@Colaberry.com , ram@colaberry.com ',
    } as NodeJS.ProcessEnv)).toEqual(['ali@colaberry.com', 'ram@colaberry.com']);
  });
});

describe('the history read', () => {
  it('returns the decisions oldest first, with an ISO timestamp', async () => {
    mockFindAll.mockResolvedValue([{
      change_request_id: ID, verb: 'send_back', decided_by_identity: APPROVER,
      decided_at: new Date('2026-11-04T15:00:00Z'),
      reason: null, missing_field: 'touches', assigned_tool_name: null,
    }]);
    const rows = await loadDecisions(ID);
    expect(mockFindAll.mock.calls[0][0]).toMatchObject({ order: [['decided_at', 'ASC']] });
    expect(rows[0].decided_at).toBe('2026-11-04T15:00:00.000Z');
  });

  it('carries no status of its own, so it cannot disagree with the parent', async () => {
    mockFindAll.mockResolvedValue([{
      change_request_id: ID, verb: 'deny', decided_by_identity: APPROVER,
      decided_at: new Date('2026-11-04T15:00:00Z'),
      reason: 'no', missing_field: null, assigned_tool_name: null,
    }]);
    const rows = await loadDecisions(ID);
    expect(rows[0].request_status).toBe('');
  });
});
