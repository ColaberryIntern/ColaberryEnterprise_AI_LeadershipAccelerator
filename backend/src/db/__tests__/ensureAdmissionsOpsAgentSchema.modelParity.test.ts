import fs from 'fs';
import path from 'path';
import AdmissionsOpsAgentLog from '../../models/AdmissionsOpsAgentLog';
import AdmissionsOpsApproval from '../../models/AdmissionsOpsApproval';

/**
 * AO2.3 model and DDL parity for the two Admissions & Ops tables. Column lists are written out literally (never derived
 * from the model, which would only prove the code equals itself) and compared as sets in both directions.
 */
const SRC = fs.readFileSync(path.join(__dirname, '..', 'ensureAdmissionsOpsAgentSchema.ts'), 'utf8');
function ddlColumns(table: string): string[] {
  const start = SRC.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  const body = SRC.slice(start, SRC.indexOf(')`', start));
  return [...body.matchAll(/^\s+([a-z_]+)\s+[A-Z]/gm)].map((m) => m[1]).filter((c) => c !== 'CREATE');
}
const LOG = ['id', 'request_id', 'created_at', 'actor_kind', 'agent_id', 'agent_version', 'on_behalf_of', 'mode', 'intent_type', 'screen',
  'action', 'level', 'params', 'sources_read', 'outcome', 'reason', 'approval_id'];
const APPROVAL = ['id', 'request_id', 'created_at', 'action', 'level', 'screen', 'summary', 'params', 'prepared_by_kind', 'prepared_by',
  'on_behalf_of', 'status', 'decided_by', 'decided_at'];

describe('AO2.3 ensureAdmissionsOpsAgentSchema', () => {
  it('agent log: DDL, model and the literal list agree', () => {
    expect(ddlColumns('admissions_ops_agent_log').sort()).toEqual([...LOG].sort());
    expect(Object.keys(AdmissionsOpsAgentLog.getAttributes()).sort()).toEqual([...LOG].sort());
  });
  it('approvals: DDL, model and the literal list agree', () => {
    expect(ddlColumns('admissions_ops_approvals').sort()).toEqual([...APPROVAL].sort());
    expect(Object.keys(AdmissionsOpsApproval.getAttributes()).sort()).toEqual([...APPROVAL].sort());
  });
  it('is additive and idempotent: IF NOT EXISTS everywhere, unique request ids, no ALTER or DROP TABLE', () => {
    expect(SRC).not.toMatch(/ALTER TABLE|DROP TABLE/);
    expect(SRC.match(/CREATE TABLE IF NOT EXISTS/g)).toHaveLength(2);
    expect(SRC).toContain('CREATE UNIQUE INDEX IF NOT EXISTS admissions_ops_agent_log_request_unique ON admissions_ops_agent_log (request_id)');
    expect(SRC).toContain('CREATE UNIQUE INDEX IF NOT EXISTS admissions_ops_approvals_request_unique ON admissions_ops_approvals (request_id)');
  });
  it('makes the audit log append-only in the database (UPDATE and DELETE raise)', () => {
    expect(SRC).toMatch(/BEFORE UPDATE OR DELETE ON admissions_ops_agent_log/);
    expect(SRC).toMatch(/RAISE EXCEPTION 'admissions_ops_agent_log is append-only'/);
  });
  it('is awaited at boot through the workspace boot module', () => {
    const boot = fs.readFileSync(path.join(__dirname, '..', '..', 'boot', 'admissionsOpsBoot.ts'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.ts'), 'utf8');
    expect(boot).toContain('await ensureAdmissionsOpsAgentSchema();');
    expect(server).toContain('await startAdmissionsOps();');
  });
});
