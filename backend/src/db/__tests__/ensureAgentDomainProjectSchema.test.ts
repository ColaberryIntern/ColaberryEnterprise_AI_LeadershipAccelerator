import {
  STATEMENTS,
  ROLLBACK_STATEMENTS,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
  AGENT_DOMAIN_CHECK_KEYS,
  normalizeNameRows,
} from '../ensureAgentDomainProjectSchema';
import { AGENT_DOMAIN_KEYS } from '../../services/agentDomain/agentDomainRegistry';

const ADDITIVE = /^\s*CREATE (TABLE|UNIQUE INDEX|INDEX) IF NOT EXISTS\b/i;

describe('the migration is additive only', () => {
  it('every statement is CREATE TABLE/INDEX IF NOT EXISTS', () => {
    expect(STATEMENTS.length).toBeGreaterThan(0);
    for (const s of STATEMENTS) expect(s).toMatch(ADDITIVE);
  });

  it('no statement carries ALTER, DROP, UPDATE or TRUNCATE', () => {
    for (const s of STATEMENTS) {
      expect(/\bALTER\b/i.test(s)).toBe(false);
      expect(/\bDROP\b/i.test(s)).toBe(false);
      expect(/\bUPDATE\b/i.test(s)).toBe(false);
      expect(/\bTRUNCATE\b/i.test(s)).toBe(false);
    }
  });

  it('DELETE appears ONLY as an ON DELETE foreign-key clause, never as a statement', () => {
    // A blanket DELETE ban is wrong here, and an earlier version of this test was exactly that:
    // the referential actions ON DELETE CASCADE and ON DELETE SET NULL are load-bearing and
    // contain the word. Assert the precise thing rather than relaxing the check.
    for (const s of STATEMENTS) {
      for (const h of [...s.matchAll(/DELETE/gi)]) {
        expect(s.slice(Math.max(0, (h.index as number) - 3), h.index as number)).toMatch(/ON /i);
      }
    }
  });

  it('POSITIVE CONTROL: a bare DELETE statement is caught by that rule', () => {
    const planted = 'DELETE FROM agent_domain_projects WHERE 1=1';
    const h = [...planted.matchAll(/DELETE/gi)][0];
    expect(planted.slice(Math.max(0, (h.index as number) - 3), h.index as number)).not.toMatch(/ON /i);
  });

  it('POSITIVE CONTROL: the predicate rejects a planted ALTER', () => {
    const planted = 'ALTER TABLE agent_domain_projects ADD COLUMN IF NOT EXISTS sneaky TEXT';
    expect(ADDITIVE.test(planted)).toBe(false);
    expect(/\bALTER\b/i.test(planted)).toBe(true);
  });

  it('exactly two tables are created — a third would need the contract write-set amended', () => {
    expect([...REQUIRED_TABLES].sort()).toEqual(
      ['agent_domain_build_authorizations', 'agent_domain_projects'],
    );
  });
});

describe('rollback covers every table it creates', () => {
  it('ROLLBACK_STATEMENTS drops every REQUIRED_TABLE — set equality, not a count', () => {
    const dropped = ROLLBACK_STATEMENTS
      .map((s) => /DROP TABLE IF EXISTS\s+([a-z_][a-z0-9_]*)/i.exec(s)?.[1])
      .filter((v): v is string => Boolean(v));
    expect(dropped.sort()).toEqual([...REQUIRED_TABLES].sort());
  });

  it('children are dropped before parents, so the FK cannot block the rollback', () => {
    const order = ROLLBACK_STATEMENTS.join(' | ');
    expect(order.indexOf('agent_domain_build_authorizations'))
      .toBeLessThan(order.indexOf('agent_domain_projects'));
  });

  it('POSITIVE CONTROL: a table with no DROP breaks set-equality', () => {
    const dropped = ['agent_domain_projects'];
    expect(dropped.sort()).not.toEqual([...REQUIRED_TABLES].sort());
  });
});

describe('the CHECK constraint and the registry cannot disagree', () => {
  it('the CHECK key set equals the registry key set, asserted BOTH directions', () => {
    expect([...AGENT_DOMAIN_CHECK_KEYS].sort()).toEqual([...AGENT_DOMAIN_KEYS].sort());
  });

  it('the CHECK literal in the DDL contains all ten keys and no eleventh', () => {
    const create = STATEMENTS.find((s) => /ck_agent_domain_key/.test(s))!;
    for (const k of AGENT_DOMAIN_KEYS) expect(create).toContain(`'${k}'`);
    const quoted = create.match(/CHECK \(domain_key IN \(([^)]*)\)\)/)![1];
    expect(quoted.split(',')).toHaveLength(10);
  });

  it('POSITIVE CONTROL: an eleventh key breaks set-equality', () => {
    expect([...AGENT_DOMAIN_CHECK_KEYS, 'eleventh'].sort()).not.toEqual([...AGENT_DOMAIN_KEYS].sort());
  });

  it('the builder-state CHECK encodes the three planning states and permits NULL', () => {
    const create = STATEMENTS.find((s) => /ck_agent_domain_builder_state/.test(s))!;
    for (const s of ['verified_active', 'onboarding_pending', 'unassigned']) {
      expect(create).toContain(`'${s}'`);
    }
    expect(create).toMatch(/intended_builder_state IS NULL/);
  });
});

describe('the uniqueness that stops an eleventh project is structural', () => {
  it('declares a unique index on (tenant_id, domain_key) and on student_project_id', () => {
    expect(REQUIRED_INDEXES).toContain('uq_agent_domain_key');
    expect(REQUIRED_INDEXES).toContain('uq_agent_domain_project');
    const byKey = STATEMENTS.find((s) => s.includes('uq_agent_domain_key'))!;
    expect(byKey).toMatch(/CREATE UNIQUE INDEX/i);
    expect(byKey).toMatch(/\(tenant_id,\s*domain_key\)/);
  });

  it('every REQUIRED_INDEX is actually created by a statement', () => {
    for (const idx of REQUIRED_INDEXES) {
      expect(STATEMENTS.some((s) => s.includes(idx))).toBe(true);
    }
  });

  it('POSITIVE CONTROL: an index named but never created is detected', () => {
    expect(STATEMENTS.some((s) => s.includes('uq_never_created'))).toBe(false);
  });
});

describe('the id is derived, never database-generated', () => {
  it('agent_domain_projects.id has NO DEFAULT, so the provisioner must supply a derived id', () => {
    // A gen_random_uuid() default here would silently re-id on every run and defeat idempotency.
    const create = STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS agent_domain_projects/.test(s))!;
    expect(create).toMatch(/id\s+UUID PRIMARY KEY,/);
    expect(create).not.toMatch(/id\s+UUID PRIMARY KEY DEFAULT/);
  });

  it('agent_id is NULLABLE, because eight of ten domains have no AI employee', () => {
    const create = STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS agent_domain_projects/.test(s))!;
    expect(create).toMatch(/agent_id\s+UUID REFERENCES ai_agents\(id\)\s+ON DELETE SET NULL/);
    expect(create).not.toMatch(/agent_id\s+UUID NOT NULL/);
  });

  it('student_project_id cascades, which is what makes the row-level rollback clean', () => {
    const create = STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS agent_domain_projects/.test(s))!;
    expect(create).toMatch(/student_project_id\s+UUID NOT NULL REFERENCES projects\(id\)\s+ON DELETE CASCADE/);
  });

  it('manager_identity_id carries NO foreign key, per the actor-reference convention', () => {
    const create = STATEMENTS.find((s) => /CREATE TABLE IF NOT EXISTS agent_domain_projects/.test(s))!;
    expect(create).toMatch(/manager_identity_id\s+TEXT,/);
  });
});

describe('the post-condition cannot be fooled by the driver row shape', () => {
  // This app returns single-column selects as RAW ARRAYS, not {col} objects. A naive
  // rows.includes(name) therefore reports every table missing. Both shapes must agree.
  it('reads the object shape', () => {
    expect(normalizeNameRows([{ table_name: 'agent_domain_projects' }])).toEqual(['agent_domain_projects']);
  });

  it('reads the RAW ARRAY shape — the one that breaks the naive version', () => {
    expect(normalizeNameRows(['agent_domain_projects'])).toEqual(['agent_domain_projects']);
  });

  it('both shapes yield the SAME verdict for the same data', () => {
    const asObjects = normalizeNameRows([{ t: 'a' }, { t: 'b' }]);
    const asStrings = normalizeNameRows(['a', 'b']);
    expect(asObjects).toEqual(asStrings);
  });

  it('POSITIVE CONTROL: the naive check would have failed on the raw-array shape', () => {
    const raw: unknown[] = ['agent_domain_projects'];
    // what a naive implementation does, and why it lies:
    const naive = (raw as any[]).map((r) => r?.table_name).filter(Boolean);
    expect(naive).toEqual([]);                                  // the lie
    expect(normalizeNameRows(raw)).toEqual(['agent_domain_projects']); // the fix
  });

  it('survives a malformed row without throwing', () => {
    expect(normalizeNameRows([null, 7, {}, 'ok'])).toEqual(['ok']);
    expect(normalizeNameRows(undefined)).toEqual([]);
  });
});

describe('the assert is schema-qualified, because three schemas exist here', () => {
  it('both existence queries filter to public', () => {
    // public, snap_quincy_20260819 and snap_quincy_20260819_after all exist in production, and
    // three baseline tables live in more than one. An unqualified check can report a table present
    // because a snapshot schema has one.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'ensureAgentDomainProjectSchema.ts'),
      'utf8',
    );
    expect(src).toMatch(/table_schema = 'public'/);
    expect(src).toMatch(/schemaname = 'public'/);
    expect(src).not.toMatch(/FROM information_schema\.tables\s*\n?\s*WHERE table_name = ANY/);
  });
});
