/**
 * OH1i (T3): maya_brain_items is additive, idempotent, and carries the learner gates as CHECK
 * constraints. (The DDL itself was proven against accelerator_dev1 inside BEGIN/ROLLBACK.)
 */
import { ensureMayaBrainSchema, MAYA_BRAIN_SCHEMA_STATEMENTS } from '../ensureMayaBrainSchema';

describe('ensureMayaBrainSchema', () => {
  it('only creates, never alters or drops', () => {
    for (const s of MAYA_BRAIN_SCHEMA_STATEMENTS) {
      expect(s).toMatch(/^CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS/);
      expect(s).not.toMatch(/\b(ALTER|DROP|DELETE|UPDATE)\b/i);
    }
  });
  it('has the columns the plan names', () => {
    const t = MAYA_BRAIN_SCHEMA_STATEMENTS[0];
    for (const c of ['kind', 'title', 'body', 'source_url', 'source_label', 'virality', 'signal_id', 'status', 'test_build_status',
      'test_build_notes', 'approved_by', 'approved_at', 'expires_at', 'created_at', 'updated_at']) {
      expect(t).toMatch(new RegExp(`\\n\\s+${c} `));
    }
  });
  it('enforces the learner gates in the database too', () => {
    const t = MAYA_BRAIN_SCHEMA_STATEMENTS[0];
    expect(t).toContain("COALESCE(source_label, '') ~ 'CLM-[0-9]{3,}'");
    expect(t).toContain("COALESCE(source_url, '') ~");
    expect(t).toContain("status <> 'approved' OR kind <> 'build_prompt' OR test_build_status = 'passed'");
  });
  it('runs every statement, and one failure is reported without stopping the rest', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ran: string[] = [];
    const r = await ensureMayaBrainSchema(async (sql) => {
      ran.push(sql);
      if (sql.includes('INDEX IF NOT EXISTS idx_')) throw new Error('lock timeout');
    });
    expect(ran).toHaveLength(MAYA_BRAIN_SCHEMA_STATEMENTS.length);
    expect(r).toEqual({ ok: MAYA_BRAIN_SCHEMA_STATEMENTS.length - 1, skipped: ['lock timeout'] });
    warn.mockRestore();
  });
});
