/**
 * Operator tools reassign somebody else's work, so none of them is a single button.
 *
 * Preview and commit are two functions, never one with a flag: a flag threaded
 * through a function that also writes is one forgotten `if` away from silently
 * reassigning forty students' recordings, and that is not undoable by apologising.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { previewOps, commitOps, OP_KINDS, type OpsPlan } from '../showcaseOps';
import { PRESENTATION_OPS_STATEMENTS } from '../../../db/ensurePresentationOpsSchema';

const q = sequelize.query as unknown as jest.Mock;
const PARKED = '00000000-0000-0000-0000-000000000000';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  q.mockReset();
});
afterEach(() => { (console.log as jest.Mock).mockRestore?.(); });

const sqlOf = (call: any[]) => String(call[0]);
const writes = () => q.mock.calls.filter((c) => /INSERT|UPDATE|DELETE/i.test(sqlOf(c)));

describe('the preview cannot write, however it is called', () => {
  it('reads recordings and writes nothing', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'review' }], {}]);
    const plan = await previewOps('rematch_recording', ['r1']);
    expect(plan.dry_run).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('writes nothing even when every target is actionable', async () => {
    q.mockResolvedValueOnce([[
      { id: 'r1', attempt_id: PARKED, ingest_status: 'review' },
      { id: 'r2', attempt_id: PARKED, ingest_status: 'failed' },
    ], {}]);
    await previewOps('retry_ingest', ['r1', 'r2']);
    expect(writes()).toEqual([]);
  });

  it('asks for nothing at all when given no ids', async () => {
    const plan = await previewOps('retry_ingest', []);
    expect(plan.targets).toEqual([]);
    expect(q).not.toHaveBeenCalled();
  });

  it('describes what would happen in words an operator can check', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'review' }], {}]);
    const plan = await previewOps('rematch_recording', ['r1']);
    expect(plan.targets[0].wouldDo).toMatch(/Detach it from its current attempt/);
    expect(plan.targets[0].currentState).toContain('review');
  });

  /**
   * A recording a student is relying on must not be moved without a human reading the
   * row. Blocked, with the reason stated, rather than quietly excluded.
   */
  it('blocks rematching a recording that is already on a real attempt', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: 'real-attempt', ingest_status: 'ingested' }], {}]);
    const plan = await previewOps('rematch_recording', ['r1']);
    expect(plan.targets[0].blockedReason).toMatch(/take a recording off a student/i);
    expect(plan.summary).toEqual({ actionable: 0, blocked: 1 });
  });

  it('blocks correcting a publication that was never published', async () => {
    q.mockResolvedValueOnce([[{ id: 's1', audience: 'cohort', published_at: null, withdrawn_at: null }], {}]);
    const plan = await previewOps('correct_publication', ['s1']);
    expect(plan.targets[0].blockedReason).toMatch(/nothing to correct/i);
  });

  it('de-duplicates ids, so one row cannot be acted on twice', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'review' }], {}]);
    await previewOps('retry_ingest', ['r1', 'r1', 'r1']);
    expect((q.mock.calls[0][1] as any).replacements.ids).toEqual(['r1']);
  });
});

describe('commit re-proves the plan rather than trusting what came back', () => {
  const plan = (targets: any[]): OpsPlan => ({
    dry_run: true, generated_at: new Date().toISOString(), kind: 'retry_ingest',
    targets, summary: { actionable: targets.length, blocked: 0 },
  });

  it('re-reads the database before acting on a row', async () => {
    // preview inside commit
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'failed' }], {}]);
    q.mockResolvedValue([[], {}]); // audit + apply
    await commitOps({
      plan: plan([{ id: 'r1', kind: 'retry_ingest', currentState: 'anything', wouldDo: 'x', blockedReason: null }]),
      actorId: 'ali@colaberry.com',
    });
    expect(sqlOf(q.mock.calls[0])).toMatch(/SELECT/i);
  });

  /**
   * A forged row naming a recording the operator never previewed must not be acted
   * on. The plan decides what to CONSIDER, never what is allowed.
   */
  it('skips a row the database does not confirm', async () => {
    q.mockResolvedValueOnce([[], {}]);
    const r = await commitOps({
      plan: plan([{ id: 'forged', kind: 'retry_ingest', currentState: 'x', wouldDo: 'y', blockedReason: null }]),
      actorId: 'ali@colaberry.com',
    });
    expect(r.results[0]).toMatchObject({ outcome: 'skipped' });
    expect(writes()).toEqual([]);
  });

  it('skips a row that became blocked since the preview', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: 'real', ingest_status: 'ingested' }], {}]);
    const r = await commitOps({
      plan: { ...plan([{ id: 'r1', kind: 'rematch_recording', currentState: 'x', wouldDo: 'y', blockedReason: null }]), kind: 'rematch_recording' },
      actorId: 'ali@colaberry.com',
    });
    expect(r.results[0].outcome).toBe('skipped');
    expect(writes()).toEqual([]);
  });

  it('writes an audit row naming who, what and from where', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'failed' }], {}]);
    q.mockResolvedValue([[], {}]);
    await commitOps({
      plan: plan([{ id: 'r1', kind: 'retry_ingest', currentState: 'x', wouldDo: 'y', blockedReason: null }]),
      actorId: 'ali@colaberry.com',
    });
    const auditCall = q.mock.calls.find((c) => /presentation_ops_audit/i.test(sqlOf(c)))!;
    expect(auditCall).toBeTruthy();
    const r = (auditCall[1] as any).replacements;
    expect(r.actor).toBe('ali@colaberry.com');
    expect(r.target).toBe('r1');
    expect(r.from).toContain('failed');
  });

  /**
   * An audit written afterwards is missing for exactly the operations anyone will
   * want to look up — the ones that half-happened.
   */
  it('writes the audit BEFORE the change', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'failed' }], {}]);
    q.mockResolvedValue([[], {}]);
    await commitOps({
      plan: plan([{ id: 'r1', kind: 'retry_ingest', currentState: 'x', wouldDo: 'y', blockedReason: null }]),
      actorId: 'ali@colaberry.com',
    });
    const order = q.mock.calls.map(sqlOf);
    const auditAt = order.findIndex((s) => /presentation_ops_audit/i.test(s));
    const applyAt = order.findIndex((s) => /UPDATE presentation_recordings/i.test(s));
    expect(auditAt).toBeGreaterThan(-1);
    expect(applyAt).toBeGreaterThan(auditAt);
  });

  it('reports done, skipped and failed separately', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'failed' }], {}]);
    q.mockResolvedValue([[], {}]);
    const r = await commitOps({
      plan: plan([
        { id: 'r1', kind: 'retry_ingest', currentState: 'x', wouldDo: 'y', blockedReason: null },
        { id: 'gone', kind: 'retry_ingest', currentState: 'x', wouldDo: 'y', blockedReason: null },
      ]),
      actorId: 'ali@colaberry.com',
    });
    expect(r.summary).toEqual({ done: 1, skipped: 1, failed: 0 });
  });
});

describe('the audit is append-only in practice', () => {
  it('the service never updates or deletes an audit row', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1', attempt_id: PARKED, ingest_status: 'failed' }], {}]);
    q.mockResolvedValue([[], {}]);
    await commitOps({
      plan: {
        dry_run: true, generated_at: '', kind: 'retry_ingest',
        targets: [{ id: 'r1', kind: 'retry_ingest', currentState: 'x', wouldDo: 'y', blockedReason: null }],
        summary: { actionable: 1, blocked: 0 },
      },
      actorId: 'a',
    });
    for (const c of q.mock.calls) {
      const s = sqlOf(c);
      if (/presentation_ops_audit/i.test(s)) expect(s).toMatch(/^\s*INSERT/i);
    }
  });

  it('the table is indexed by what people actually ask', () => {
    const joined = PRESENTATION_OPS_STATEMENTS.join('\n');
    expect(joined).toContain('presentation_ops_audit_target');
    expect(joined).toContain('presentation_ops_audit_actor');
  });

  it('every column in the CREATE body also has an explicit ADD COLUMN', () => {
    const create = PRESENTATION_OPS_STATEMENTS.find((s) => /^CREATE TABLE/i.test(s))!;
    const body = create.slice(create.indexOf('(') + 1, create.lastIndexOf(')'));
    const cols = body.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => l.split(/\s+/)[0]).filter((c) => /^[a-z_]+$/.test(c) && c !== 'id');
    expect(cols.length).toBeGreaterThan(4);
    const altered = PRESENTATION_OPS_STATEMENTS
      .filter((s) => /ADD COLUMN IF NOT EXISTS/i.test(s))
      .map((s) => s.match(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/i)![1]);
    expect(cols.filter((c) => !altered.includes(c))).toEqual([]);
  });
});

describe('the operator surface is a closed set', () => {
  it('names exactly the four operations, so a fifth cannot appear untested', () => {
    expect([...OP_KINDS].sort()).toEqual(
      ['correct_publication', 'rematch_recording', 'reschedule_slot', 'retry_ingest'],
    );
  });
});
