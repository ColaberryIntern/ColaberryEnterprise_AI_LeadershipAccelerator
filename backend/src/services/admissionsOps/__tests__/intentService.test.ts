// AO2.3 the intent service with its models faked: one transaction, idempotent replay, approvals created only when the
// policy says so, the agent's decision refused and logged, the first decision standing.
const logRows: Array<Record<string, unknown>> = [];
const approvals = new Map<string, Record<string, unknown>>();
jest.mock('../../../config/database', () => ({ sequelize: { transaction: (fn: (t: unknown) => unknown) => fn({}) } }));
jest.mock('../../../models/AdmissionsOpsAgentLog', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async ({ where }: { where: { request_id: string } }) => logRows.find((r) => r.request_id === where.request_id) ?? null),
    bulkCreate: jest.fn(async (rows: Array<Record<string, unknown>>) => {
      for (const r of rows) if (!logRows.some((x) => x.request_id === r.request_id)) logRows.push(r);
    }),
  },
}));
jest.mock('../../../models/AdmissionsOpsApproval', () => ({
  __esModule: true,
  default: {
    findOrCreate: jest.fn(async ({ where, defaults }: { where: { request_id: string }; defaults: Record<string, unknown> }) => {
      const hit = [...approvals.values()].find((a) => a.request_id === where.request_id);
      if (hit) return [hit, false];
      const row = { id: `ap-${approvals.size + 1}`, status: 'open', decided_by: null, ...defaults };
      approvals.set(row.id as string, row);
      return [row, true];
    }),
    findByPk: jest.fn(async (id: string) => approvals.get(id) ?? null),
    update: jest.fn(async (vals: Record<string, unknown>, { where }: { where: { id: string; status: string } }) => {
      const a = approvals.get(where.id);
      if (!a || a.status !== where.status) return [0];
      Object.assign(a, vals);
      return [1];
    }),
    count: jest.fn(async () => [...approvals.values()].filter((a) => a.status === 'open').length),
  },
}));

import { countOpenApprovals, decideApproval, handleIntent, type Caller } from '../intentService';

const PERSON: Caller = { onBehalfOf: 'taiwo@example.test', mgmtRole: 'lead_intake', actor: 'person', agentId: null, agentVersion: null };
const OWNER: Caller = { ...PERSON, onBehalfOf: 'owner@example.test', mgmtRole: 'owner' };
const AGENT: Caller = { ...PERSON, actor: 'agent', agentId: 'aura', agentVersion: '0.1' };
beforeEach(() => { logRows.length = 0; approvals.clear(); });

describe('AO2.3 handleIntent', () => {
  it('a person\'s dock navigation writes exactly one audit row, done, with no approval', async () => {
    const r = await handleIntent({ request_id: 'nav-00000001', type: 'navigate', screen: 'today', action: 'tfcAudit.open', params: {} }, PERSON);
    expect(r).toEqual({ request_id: 'nav-00000001', outcome: 'done', reason: null, approval_id: null, replayed: false });
    expect(logRows).toHaveLength(1);
    expect(logRows[0]).toMatchObject({ actor_kind: 'person', on_behalf_of: 'taiwo@example.test', mode: 'answer', intent_type: 'navigate', action: 'tfcAudit.open', outcome: 'done' });
    expect(approvals.size).toBe(0);
  });

  it('an agent level-5 invoke creates one Approvals item, executes nothing, and logs sent_to_approval with redacted params', async () => {
    const r = await handleIntent({ request_id: 'ref-00000001', type: 'invoke', screen: 'payments', action: 'payments.requestRefund', params: { ref: 'sample-1', reason: 'duplicate' } }, AGENT);
    expect(r.outcome).toBe('sent_to_approval');
    expect(approvals.size).toBe(1);
    const item = [...approvals.values()][0];
    expect(item).toMatchObject({ action: 'payments.requestRefund', level: 5, status: 'open', prepared_by_kind: 'agent', prepared_by: 'aura', on_behalf_of: 'taiwo@example.test' });
    expect(logRows[0]).toMatchObject({ actor_kind: 'agent', agent_id: 'aura', outcome: 'sent_to_approval', approval_id: item.id });
  });

  it('idempotent: the same request id twice writes one row and one approval, and returns the first result', async () => {
    const req = { request_id: 'ref-00000002', type: 'invoke' as const, screen: 'payments', action: 'payments.requestRefund', params: { ref: 'a', reason: 'b' } };
    const first = await handleIntent(req, AGENT);
    const second = await handleIntent(req, AGENT);
    expect(second).toEqual({ ...first, replayed: true });
    expect(logRows).toHaveLength(1);
    expect(approvals.size).toBe(1);
  });

  it('an agent navigate in Answer mode is refused and logged', async () => {
    const r = await handleIntent({ request_id: 'nav-00000002', type: 'navigate', screen: 'today', action: 'tfcAudit.open', params: {} }, AGENT);
    expect(r).toMatchObject({ outcome: 'refused', reason: 'answer_mode_changes_nothing_on_screen' });
    expect(logRows[0]).toMatchObject({ outcome: 'refused' });
  });
});

describe('AO2.3 decideApproval', () => {
  async function prepared(level5 = true): Promise<string> {
    const action = level5 ? 'payments.requestRefund' : 'tfcAudit.requestContractRecall';
    const screen = level5 ? 'payments' : 'tfcAudit';
    const r = await handleIntent({ request_id: `p-${Math.random().toString(36).slice(2, 12)}`, type: 'invoke', screen, action, params: { ref: 'a', reason: 'b' } }, AGENT);
    return r.approval_id as string;
  }

  it('the agent cannot decide: refused, and the refusal is in the audit log', async () => {
    const id = await prepared();
    const r = await decideApproval(id, 'approve', AGENT, 'dec-00000001');
    expect(r).toEqual({ status: 'refused', reason: 'the_agent_cannot_decide' });
    expect(approvals.get(id)!.status).toBe('open');
    expect(logRows.find((x) => x.request_id === 'decide:dec-00000001')).toMatchObject({ intent_type: 'decide', outcome: 'refused', approval_id: id });
  });

  it('a caller-supplied id that already exists in the log cannot swallow the decision row (namespaced)', async () => {
    const id = await prepared();
    const taken = logRows[logRows.length - 1].request_id as string; // the intent row's own id
    await decideApproval(id, 'approve', AGENT, taken);
    expect(logRows.filter((x) => x.request_id === `decide:${taken}`)).toHaveLength(1);
  });

  it('a level-5 item needs the owner; the owner approves and is recorded as the decider', async () => {
    const id = await prepared();
    expect(await decideApproval(id, 'approve', PERSON, 'dec-00000002')).toEqual({ status: 'refused', reason: 'level_5_needs_a_leadership_approver' });
    const r = await decideApproval(id, 'approve', OWNER, 'dec-00000003');
    expect(r).toMatchObject({ status: 'decided', decision: 'approved', decided_by: 'owner@example.test', already: false });
    expect(logRows.find((x) => x.request_id === 'decide:dec-00000003')).toMatchObject({ actor_kind: 'person', outcome: 'done', reason: 'approved' });
  });

  it('the first decision stands: deciding again is a no-op that returns it', async () => {
    const id = await prepared();
    await decideApproval(id, 'hold', OWNER, 'dec-00000004');
    const again = await decideApproval(id, 'approve', OWNER, 'dec-00000005');
    expect(again).toMatchObject({ status: 'decided', decision: 'held', already: true });
  });

  it('an unknown item is not found; the open count follows decisions', async () => {
    expect(await decideApproval('nope', 'hold', OWNER, 'dec-00000006')).toEqual({ status: 'not_found' });
    const a = await prepared();
    await prepared();
    expect(await countOpenApprovals()).toBe(2);
    await decideApproval(a, 'hold', OWNER, 'dec-00000007');
    expect(await countOpenApprovals()).toBe(1);
  });
});
