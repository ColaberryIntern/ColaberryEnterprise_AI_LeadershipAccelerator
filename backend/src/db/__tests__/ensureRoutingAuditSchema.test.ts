import * as fs from 'fs';
import * as path from 'path';
import { ROUTING_AUDIT_STATEMENTS } from '../ensureRoutingAuditSchema';
import { RoutingRuleExecution } from '../../models/RoutingRuleExecution';
import RoutingRule from '../../models/RoutingRule';
import { activeBootCall } from './helpers/bootCalls';

/**
 * T226 — the routing audit schema. Same discipline as the growth-journey
 * schema tests: an ALLOWLIST of statement shapes (what a statement DOES, not
 * what it starts with), literal column parity both ways, boot order pinned,
 * and the control-byte tripwire over this family of files.
 */

const SQL = ROUTING_AUDIT_STATEMENTS.join('\n');

const ALLOWED: RegExp[] = [
  /^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+routing_rule_executions\s*\(/i,
  /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+\w+\s+ON\s+routing_rule_executions\s*\(/i,
  // The ONE alter: an integer column with a NOT NULL DEFAULT, on routing_rules only.
  /^\s*ALTER\s+TABLE\s+routing_rules\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+version\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1\s*$/i,
];

describe('every statement matches an allowed shape', () => {
  it('and there are six', () => {
    expect(ROUTING_AUDIT_STATEMENTS).toHaveLength(6);
    for (const s of ROUTING_AUDIT_STATEMENTS) {
      expect({ statement: s.slice(0, 60), allowed: ALLOWED.some((re) => re.test(s)) }).toEqual({ statement: s.slice(0, 60), allowed: true });
    }
  });

  it('refuses the reshaping forms by name', () => {
    for (const bad of [/\bDROP\b/i, /\bRENAME\b/i, /\bTRUNCATE\b/i, /ALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN/i, /\bADD\s+(UNIQUE|CHECK|PRIMARY\s+KEY|FOREIGN\s+KEY)\b/i, /\bREFERENCES\b/i]) {
      expect(SQL).not.toMatch(bad);
    }
  });

  it('the allowlist is not vacuous: a unique index on leads is refused', () => {
    const smuggled = 'CREATE UNIQUE INDEX IF NOT EXISTS leads_email_uniq ON leads (email)';
    expect(ALLOWED.some((re) => re.test(smuggled))).toBe(false);
    const smuggledAlter = 'ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS version INTEGER';
    expect(ALLOWED.some((re) => re.test(smuggledAlter))).toBe(false);
  });

  it('touches exactly one existing table, by ADD COLUMN alone, and it is the last thing in its own statement', () => {
    const altered = [...SQL.matchAll(/ALTER\s+TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(altered).toEqual(['routing_rules']);
  });

  it('carries no literal control byte in this family of files', () => {
    for (const f of [__filename, path.join(__dirname, '..', 'ensureRoutingAuditSchema.ts'), path.join(__dirname, '..', '..', 'models', 'RoutingRuleExecution.ts')]) {
      const src = fs.readFileSync(f, 'utf8');
      for (const ch of ['\u0007', '\u0008', '\u000b', '\u000c', '\u001b']) expect(src).not.toContain(ch);
    }
  });
});

const EXPECTED_COLUMNS = [
  'id', 'raw_payload_id', 'lead_id', 'rule_id', 'rule_version', 'action_index', 'action_type', 'action_snapshot',
  'status', 'detail', 'error_class', 'tenant_id', 'brand_id', 'created_at', 'finished_at',
];

function columnsDeclared(): string[] {
  const stmt = ROUTING_AUDIT_STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS routing_rule_executions/i.test(s))!;
  const body = stmt.slice(stmt.indexOf('(') + 1, stmt.lastIndexOf(')'));
  return body.split('\n').map((l) => l.trim().match(/^(\w+)\s+\S/)).filter((m): m is RegExpMatchArray => m !== null).map((m) => m[1]);
}

describe('model ↔ DDL parity, literal, both directions', () => {
  it('the DDL declares exactly the expected columns', () => {
    expect([...columnsDeclared()].sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });
  it('the model maps exactly the same set', () => {
    expect(Object.keys(RoutingRuleExecution.getAttributes()).sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });
  it('no foreign keys: an audit row outlives its rule and its payload', () => {
    const attrs = RoutingRuleExecution.getAttributes() as Record<string, { references?: unknown }>;
    for (const c of ['raw_payload_id', 'lead_id', 'rule_id']) expect(attrs[c].references).toBeUndefined();
    expect(SQL).not.toMatch(/REFERENCES/i);
  });
  it('the replay guard is UNIQUE on (raw_payload_id, rule_id, action_index), SQL and model', () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS routing_rule_executions_payload_rule_action_unique\s+ON routing_rule_executions \(raw_payload_id, rule_id, action_index\)/i);
    const idx = ((RoutingRuleExecution.options.indexes ?? []) as Array<{ name?: string; unique?: boolean; fields?: unknown[] }>)
      .find((i) => i.name === 'routing_rule_executions_payload_rule_action_unique');
    expect(idx).toMatchObject({ unique: true, fields: ['raw_payload_id', 'rule_id', 'action_index'] });
  });
  it('routing_rules.version: on the DDL and on the model, default 1', () => {
    expect(SQL).toMatch(/version INTEGER NOT NULL DEFAULT 1/);
    const v = (RoutingRule.getAttributes() as Record<string, { defaultValue?: unknown; allowNull?: boolean }>).version;
    expect(v).toMatchObject({ defaultValue: 1, allowNull: false });
  });
  it('mixed key types are explicit: UUID payload and rule, INTEGER lead', () => {
    expect(SQL).toMatch(/raw_payload_id UUID NOT NULL/);
    expect(SQL).toMatch(/rule_id UUID NOT NULL/);
    expect(SQL).toMatch(/lead_id INTEGER NOT NULL/);
  });
});

describe('boot order — the ALTER names a table another ensure step creates', () => {
  it('registers ensureRoutingAuditSchema AFTER ensureIngestionSchema, and it is an active call', () => {
    const ingestion = activeBootCall('await ensureIngestionSchema()');
    const audit = activeBootCall('await ensureRoutingAuditSchema()');
    expect(ingestion).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(ingestion);
  });
});
