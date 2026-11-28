/**
 * AO2.3 the Admissions & Ops agent tables on a real Postgres (scratch database): the audit log refuses UPDATE and DELETE
 * at the database, the same request id twice writes one log row and one approval, a level-5 agent request creates an
 * approval and executes nothing, and two people deciding one item at once cannot both win.
 *
 * Runs in CI's integration tier (scripts/ci/runIntegrationSuites.js gives it its own database). Skipped without
 * DATABASE_URL. NEVER point it at production: it creates tables.
 */
import { QueryTypes } from 'sequelize';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[admissionsOps agentLog.integration] SKIPPED: no DATABASE_URL. Not evidence that the audit log is append-only in Postgres.');
}

describeIfDb('AO2.3 agent log and approvals on a scratch Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let svc: typeof import('../intentService');
  const q = async <T extends object>(sql: string, bind: unknown[] = []): Promise<T[]> => sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });
  const AGENT = { onBehalfOf: 'taiwo@example.test', mgmtRole: 'lead_intake', actor: 'agent' as const, agentId: 'aura', agentVersion: '0.1' };
  const OWNER = { onBehalfOf: 'owner@example.test', mgmtRole: 'owner', actor: 'person' as const, agentId: null, agentVersion: null };

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (/prod/i.test(db)) throw new Error(`Refusing to run against ${db}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    const { ensureAdmissionsOpsAgentSchema } = await import('../../../db/ensureAdmissionsOpsAgentSchema');
    await ensureAdmissionsOpsAgentSchema();
    await ensureAdmissionsOpsAgentSchema(); // idempotent: a second boot changes nothing and does not throw
    svc = await import('../intentService');
  });
  afterAll(async () => { await sequelize.close(); });

  it('a level-5 agent request creates one approval, executes nothing, and replaying it writes nothing more', async () => {
    const req = { request_id: 'int-refund-0001', type: 'invoke' as const, screen: 'payments', action: 'payments.requestRefund', params: { ref: 'sample-1', reason: 'duplicate' } };
    const first = await svc.handleIntent(req, AGENT);
    const again = await svc.handleIntent(req, AGENT);
    expect(first.outcome).toBe('sent_to_approval');
    expect(again).toEqual({ ...first, replayed: true });
    expect(await q('SELECT 1 FROM admissions_ops_agent_log WHERE request_id = $1', [req.request_id])).toHaveLength(1);
    expect(await q('SELECT 1 FROM admissions_ops_approvals WHERE request_id = $1', [req.request_id])).toHaveLength(1);
  });

  it('the audit log is append-only: UPDATE and DELETE are refused by the database', async () => {
    await svc.handleIntent({ request_id: 'int-nav-0001', type: 'navigate', screen: 'today', action: 'tfcAudit.open', params: {} }, { ...OWNER, mgmtRole: 'lead_intake' });
    await expect(sequelize.query("UPDATE admissions_ops_agent_log SET outcome = 'done' WHERE request_id = 'int-nav-0001'")).rejects.toThrow(/append-only/);
    await expect(sequelize.query("DELETE FROM admissions_ops_agent_log WHERE request_id = 'int-nav-0001'")).rejects.toThrow(/append-only/);
    expect(await q('SELECT 1 FROM admissions_ops_agent_log WHERE request_id = $1', ['int-nav-0001'])).toHaveLength(1);
  });

  it('the agent cannot decide; two people deciding at once: exactly one decision is recorded', async () => {
    const r = await svc.handleIntent({ request_id: 'int-refund-0002', type: 'invoke', screen: 'payments', action: 'payments.requestRefund', params: { ref: 'a', reason: 'b' } }, AGENT);
    const id = r.approval_id as string;
    expect(await svc.decideApproval(id, 'approve', AGENT, 'int-dec-0001')).toEqual({ status: 'refused', reason: 'the_agent_cannot_decide' });
    const [a, b] = await Promise.all([
      svc.decideApproval(id, 'approve', OWNER, 'int-dec-0002'),
      svc.decideApproval(id, 'hold', { ...OWNER, onBehalfOf: 'other-owner@example.test' }, 'int-dec-0003'),
    ]);
    const fresh = [a, b].filter((x) => x.status === 'decided' && !x.already);
    expect(fresh).toHaveLength(1);
    const row = (await q<{ status: string; decided_by: string }>('SELECT status, decided_by FROM admissions_ops_approvals WHERE id = $1', [id]))[0];
    expect(['approved', 'held']).toContain(row.status);
    expect(await svc.countOpenApprovals()).toBe(1); // int-refund-0001 is still open
  });
});
