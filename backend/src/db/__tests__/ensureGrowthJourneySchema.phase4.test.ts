import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { GROWTH_JOURNEY_PHASE4_STATEMENTS } from '../growthJourneyPhase4Statements';
import GrowthJourneyHandoff, { OPEN_HANDOFF_STATUSES } from '../../models/GrowthJourneyHandoff';
import GrowthJourneyOutcome from '../../models/GrowthJourneyOutcome';
import GrowthJourneyPolicy from '../../models/GrowthJourneyPolicy';
import GrowthJourneyConversationOwnership from '../../models/GrowthJourneyConversationOwnership';
import { SQL, columnsDeclaredIn, statementCreating, tablesCreated } from './helpers/growthJourneyDdl';

/**
 * The Phase 4 tables (T401): handoffs, outcomes, policies.
 *
 * Same discipline as the Phase 1–3 files — expected column lists WRITTEN OUT
 * LITERALLY, never derived from `Model.getAttributes()` — with one tightening
 * the T315 production verifier asked for: the lists are compared IN ORDER, on
 * both sides, not as sorted sets. A column that moves is a column somebody
 * should have to move on purpose, and `pg_dump -s` on the live database is
 * compared against the same order.
 */

const EXPECTED_HANDOFF_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'program_id',
  'subject_ref',
  'lead_id',
  'enrollment_id',
  'decision_id',
  'organization_id',
  'owner_queue',
  'assigned_to_type',
  'assigned_to_id',
  'ticket_id',
  'assignment_blocked_reason',
  'priority',
  'expected_value',
  'urgent',
  'reason',
  'evidence',
  'qualification_gaps',
  'talking_points',
  'best_channel',
  'consent_basis',
  'sla_due_at',
  'status',
  'disposition',
  'disposition_reason',
  'disposition_at',
  'dispositioned_by',
  'return_to_ai',
  'integration_refused',
  'accepted_at',
  'expired_at',
  'source',
  'idempotency_key',
  'created_at',
  'updated_at',
];

const EXPECTED_OUTCOME_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'subject_ref',
  'lead_id',
  'handoff_id',
  'decision_id',
  'outcome_type',
  'source',
  'source_ref',
  'occurred_at',
  'value',
  'metadata',
  'created_at',
];

const EXPECTED_POLICY_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'policy_type',
  'owner_queue',
  'daily_capacity',
  'sla_hours',
  'assigned_to_type',
  'assigned_to_id',
  'cooldown_days',
  'settings',
  'status',
  'created_at',
  'updated_at',
];

const EXPECTED_CONVERSATION_OWNERSHIP_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'lead_id',
  'owner_type',
  'owner_id',
  'channel',
  'source',
  'since_at',
  'cleared_at',
  'cleared_by',
  'cleared_reason',
  'created_at',
  'updated_at',
];

/** The attribute names a model maps, in declaration order, timestamps included. */
function modelColumns(model: { getAttributes(): Record<string, unknown> }): string[] {
  return Object.keys(model.getAttributes());
}

function indexStatementsOn(table: string): string[] {
  return GROWTH_JOURNEY_STATEMENTS.filter((s) =>
    new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+\\w+\\s+ON\\s+${table}\\b`, 'i').test(s),
  );
}

const ws = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('growth_journey_handoffs', () => {
  it('SQL declares exactly the expected columns, in order', () => {
    expect(columnsDeclaredIn('growth_journey_handoffs')).toEqual(EXPECTED_HANDOFF_COLUMNS);
  });

  it('GrowthJourneyHandoff maps exactly the same columns, in the same order', () => {
    expect(modelColumns(GrowthJourneyHandoff)).toEqual(EXPECTED_HANDOFF_COLUMNS);
  });

  it('is MUTABLE on purpose — a task changes state — and maintains updated_at on both sides', () => {
    expect(columnsDeclaredIn('growth_journey_handoffs')).toContain('updated_at');
    const options = (GrowthJourneyHandoff as unknown as {
      options: { timestamps?: boolean; createdAt?: string; updatedAt?: string };
    }).options;
    expect(options.timestamps).toBe(true);
    expect(options.createdAt).toBe('created_at');
    expect(options.updatedAt).toBe('updated_at');
  });

  it('speaks the tickets vocabulary for its assignee and points at a tickets row — no second task system', () => {
    // `assigned_to_type` / `assigned_to_id` are `tickets`' own column names; a
    // new `owner_type` / `owner_id` pair would be the hard stop the contract names.
    const stmt = statementCreating('growth_journey_handoffs')!;
    expect(stmt).toMatch(/assigned_to_type VARCHAR\(16\),/);
    expect(stmt).toMatch(/assigned_to_id VARCHAR\(255\),/);
    expect(stmt).toMatch(/ticket_id UUID,/);
    expect(stmt).not.toMatch(/\bowner_type\b|\bowner_id\b/);
  });

  it('references the decision it came from, nullable, and clears rather than cascades', () => {
    // Nullable because a reply-routed or manual handoff has no decision behind
    // it; SET NULL because losing the decision must not lose the human's work.
    const stmt = statementCreating('growth_journey_handoffs')!;
    expect(ws(stmt)).toMatch(/decision_id UUID REFERENCES growth_journey_decisions\(id\) ON DELETE SET NULL,/);
    expect(stmt).not.toMatch(/decision_id UUID NOT NULL/);
  });

  it('organization_id is a pointer with no foreign key, on the lead_tenant_contexts precedent', () => {
    const stmt = statementCreating('growth_journey_handoffs')!;
    expect(stmt).toMatch(/organization_id UUID,/);
    expect(stmt).not.toMatch(/organization_id UUID REFERENCES/);
  });

  it('is created AFTER growth_journey_decisions, which its foreign key names', () => {
    const tables = tablesCreated();
    expect(tables.indexOf('growth_journey_handoffs')).toBeGreaterThan(tables.indexOf('growth_journey_decisions'));
  });

  it('carries the required-by-default evidence packet and a NOT NULL reason', () => {
    const stmt = statementCreating('growth_journey_handoffs')!;
    expect(stmt).toMatch(/evidence JSONB NOT NULL,/);
    expect(stmt).toMatch(/reason TEXT NOT NULL,/);
    expect(stmt).toMatch(/status VARCHAR\(20\) NOT NULL DEFAULT 'queued',/);
    expect(stmt).toMatch(/urgent BOOLEAN NOT NULL DEFAULT FALSE,/);
    expect(stmt).toMatch(/source VARCHAR\(32\) NOT NULL,/);
  });

  describe('its indexes', () => {
    it('ONE OPEN HANDOFF PER SUBJECT PER BRAND: a partial unique on (subject_ref, brand_id) over the open statuses', () => {
      const idx = GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_handoffs_open_subject_unique/.test(s));
      expect(idx).toBeDefined();
      expect(ws(idx!)).toMatch(
        /^CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_open_subject_unique ON growth_journey_handoffs \(subject_ref, brand_id\) WHERE status IN \('queued', 'assigned', 'accepted'\)$/,
      );
      // The model exports the same predicate, so the writer that checks for an
      // open handoff before creating one cannot drift from the index.
      expect([...OPEN_HANDOFF_STATUSES]).toEqual(['queued', 'assigned', 'accepted']);
    });

    it('the idempotency key is unique on both sides', () => {
      expect(ws(SQL)).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_idempotency_unique ON growth_journey_handoffs \(idempotency_key\)/,
      );
      const indexes = (GrowthJourneyHandoff as unknown as { options: { indexes?: { name?: string; unique?: boolean; fields?: string[] }[] } })
        .options.indexes ?? [];
      // `toMatchObject`: Sequelize normalises an index option with `parser` and `type` keys.
      expect(indexes).toHaveLength(1);
      expect(indexes[0]).toMatchObject({ unique: true, name: 'growth_journey_handoffs_idempotency_unique', fields: ['idempotency_key'] });
    });

    it('the queue reads: (tenant_id, brand_id, status), (subject_ref, brand_id), and the partial open-queue index', () => {
      const all = indexStatementsOn('growth_journey_handoffs').map(ws);
      // 5 of T401's, + T501's per-person unique (pinned in ensureGrowthJourneySchema.phase5.test.ts).
      expect(all).toHaveLength(6);
      expect(all).toEqual(
        expect.arrayContaining([
          'CREATE INDEX IF NOT EXISTS idx_gj_handoffs_tenant_brand_status ON growth_journey_handoffs (tenant_id, brand_id, status)',
          'CREATE INDEX IF NOT EXISTS idx_gj_handoffs_subject ON growth_journey_handoffs (subject_ref, brand_id)',
          "CREATE INDEX IF NOT EXISTS idx_gj_handoffs_queue_open ON growth_journey_handoffs (brand_id, owner_queue) WHERE status IN ('queued', 'assigned')",
        ]),
      );
    });
  });
});

describe('growth_journey_outcomes', () => {
  it('SQL declares exactly the expected columns, in order', () => {
    expect(columnsDeclaredIn('growth_journey_outcomes')).toEqual(EXPECTED_OUTCOME_COLUMNS);
  });

  it('GrowthJourneyOutcome maps exactly the same columns, in the same order', () => {
    expect(modelColumns(GrowthJourneyOutcome)).toEqual(EXPECTED_OUTCOME_COLUMNS);
  });

  it('is append-only: created_at, no updated_at, on both sides', () => {
    expect(columnsDeclaredIn('growth_journey_outcomes')).not.toContain('updated_at');
    expect(modelColumns(GrowthJourneyOutcome)).not.toContain('updated_at');
    const options = (GrowthJourneyOutcome as unknown as { options: { updatedAt?: string | boolean } }).options;
    expect(options.updatedAt).toBe(false);
  });

  it('is keyed (source, source_ref) — the same source record normalised twice is one outcome', () => {
    expect(ws(SQL)).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_outcomes_source_unique ON growth_journey_outcomes \(source, source_ref\)/,
    );
    const indexes = (GrowthJourneyOutcome as unknown as { options: { indexes?: { name?: string; unique?: boolean; fields?: string[] }[] } })
      .options.indexes ?? [];
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toMatchObject({ unique: true, name: 'growth_journey_outcomes_source_unique', fields: ['source', 'source_ref'] });
    const stmt = statementCreating('growth_journey_outcomes')!;
    expect(stmt).toMatch(/source VARCHAR\(32\) NOT NULL,/);
    expect(stmt).toMatch(/source_ref VARCHAR\(160\) NOT NULL,/);
    expect(stmt).toMatch(/occurred_at TIMESTAMPTZ NOT NULL,/);
  });

  it('points at the handoff and the decision it belongs to, both nullable, both SET NULL', () => {
    const stmt = ws(statementCreating('growth_journey_outcomes')!);
    expect(stmt).toMatch(/handoff_id UUID REFERENCES growth_journey_handoffs\(id\) ON DELETE SET NULL,/);
    expect(stmt).toMatch(/decision_id UUID REFERENCES growth_journey_decisions\(id\) ON DELETE SET NULL,/);
    const tables = tablesCreated();
    expect(tables.indexOf('growth_journey_outcomes')).toBeGreaterThan(tables.indexOf('growth_journey_handoffs'));
  });

  it('has the subject-history and handoff indexes', () => {
    const all = indexStatementsOn('growth_journey_outcomes').map(ws);
    expect(all).toHaveLength(3);
    expect(all).toEqual(
      expect.arrayContaining([
        'CREATE INDEX IF NOT EXISTS idx_gj_outcomes_subject ON growth_journey_outcomes (subject_ref, brand_id, occurred_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_gj_outcomes_handoff ON growth_journey_outcomes (handoff_id) WHERE handoff_id IS NOT NULL',
      ]),
    );
  });
});

describe('growth_journey_policies', () => {
  it('SQL declares exactly the expected columns, in order', () => {
    expect(columnsDeclaredIn('growth_journey_policies')).toEqual(EXPECTED_POLICY_COLUMNS);
  });

  it('GrowthJourneyPolicy maps exactly the same columns, in the same order', () => {
    expect(modelColumns(GrowthJourneyPolicy)).toEqual(EXPECTED_POLICY_COLUMNS);
  });

  it('every operator value is NULLABLE — a row that ships empty changes nothing (INERT_ON_CREATE)', () => {
    // NULL `daily_capacity` is what the capacity reader reports as `unknown`.
    // A NOT NULL or a defaulted number here would turn "nobody has said" into
    // a number, which is the one thing the contract forbids.
    const stmt = statementCreating('growth_journey_policies')!;
    for (const col of ['daily_capacity INTEGER', 'sla_hours INTEGER', 'cooldown_days INTEGER', 'assigned_to_type VARCHAR(16)', 'assigned_to_id VARCHAR(255)', 'owner_queue VARCHAR(32)']) {
      expect(stmt).toContain(`${col},`);
      expect(stmt).not.toContain(`${col} NOT NULL`);
      expect(stmt).not.toContain(`${col} DEFAULT`);
    }
  });

  it('is mutable and maintains updated_at on both sides', () => {
    expect(columnsDeclaredIn('growth_journey_policies')).toContain('updated_at');
    const options = (GrowthJourneyPolicy as unknown as { options: { timestamps?: boolean; updatedAt?: string } }).options;
    expect(options.timestamps).toBe(true);
    expect(options.updatedAt).toBe('updated_at');
  });

  it('is unique per (brand, policy type, queue) — with COALESCE so a queue-less policy is unique too', () => {
    // A plain unique index treats two NULL owner_queues as distinct, which would
    // let one brand carry two brand-wide cooldowns.
    expect(ws(SQL)).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_policies_brand_type_queue_unique ON growth_journey_policies \(brand_id, policy_type, COALESCE\(owner_queue, ''\)\)/,
    );
    expect(indexStatementsOn('growth_journey_policies')).toHaveLength(1);
  });
});

describe('growth_journey_conversation_ownership (T402)', () => {
  it('SQL declares exactly the expected columns, in order', () => {
    expect(columnsDeclaredIn('growth_journey_conversation_ownership')).toEqual(EXPECTED_CONVERSATION_OWNERSHIP_COLUMNS);
  });

  it('GrowthJourneyConversationOwnership maps exactly the same columns, in the same order', () => {
    expect(modelColumns(GrowthJourneyConversationOwnership)).toEqual(EXPECTED_CONVERSATION_OWNERSHIP_COLUMNS);
  });

  it('ONE OPEN CONVERSATION PER LEAD PER BRAND: a partial unique on (lead_id, brand_id) WHERE cleared_at IS NULL', () => {
    const idx = GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_conversation_ownership_open_unique/.test(s));
    expect(idx).toBeDefined();
    expect(ws(idx!)).toMatch(
      /^CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_conversation_ownership_open_unique ON growth_journey_conversation_ownership \(lead_id, brand_id\) WHERE cleared_at IS NULL$/,
    );
    expect(indexStatementsOn('growth_journey_conversation_ownership')).toHaveLength(2);
  });

  it('is lead-keyed (NOT NULL), mutable (clearing is an update), and its clearing columns are nullable', () => {
    const stmt = statementCreating('growth_journey_conversation_ownership')!;
    expect(stmt).toMatch(/lead_id INTEGER NOT NULL,/);
    expect(stmt).toMatch(/owner_type VARCHAR\(8\) NOT NULL,/);
    expect(stmt).toMatch(/source VARCHAR\(32\) NOT NULL,/);
    expect(stmt).toMatch(/since_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\),/);
    expect(stmt).toMatch(/cleared_at TIMESTAMPTZ,/);
    expect(stmt).toMatch(/cleared_by VARCHAR\(128\),/);
    expect(stmt).toMatch(/cleared_reason VARCHAR\(64\),/);
    const options = (GrowthJourneyConversationOwnership as unknown as { options: { timestamps?: boolean; updatedAt?: string } }).options;
    expect(options.timestamps).toBe(true);
    expect(options.updatedAt).toBe('updated_at');
  });

  it('references nothing but the tenancy tables - never a suppression, activity or communication row', () => {
    const stmt = statementCreating('growth_journey_conversation_ownership')!;
    expect([...stmt.matchAll(/REFERENCES\s+(\w+)/g)].map((m) => m[1]).sort()).toEqual(['brands', 'tenants']);
  });
});

describe('where the four sit, and what they never do', () => {
  it('the run now owns fifteen tables, the Phase 4 four last among the CREATEs and before the brands ALTER', () => {
    // The four come from the sibling module, spread into the one list: the
    // sibling's own export is exactly the fifteen Phase 4 statements, in order
    // (T401's twelve, T402's three).
    expect(GROWTH_JOURNEY_PHASE4_STATEMENTS).toHaveLength(15);
    expect(GROWTH_JOURNEY_PHASE4_STATEMENTS.every((s) => GROWTH_JOURNEY_STATEMENTS.includes(s))).toBe(true);
    const tables = tablesCreated();
    expect(tables).toHaveLength(15);
    expect(tables.slice(-4)).toEqual(['growth_journey_handoffs', 'growth_journey_outcomes', 'growth_journey_policies', 'growth_journey_conversation_ownership']);
    const alterAt = GROWTH_JOURNEY_STATEMENTS.findIndex((s) => /ALTER\s+TABLE\s+brands/i.test(s));
    expect(alterAt).toBe(GROWTH_JOURNEY_STATEMENTS.length - 1);
    for (const table of ['growth_journey_handoffs', 'growth_journey_outcomes', 'growth_journey_policies', 'growth_journey_conversation_ownership']) {
      const at = GROWTH_JOURNEY_STATEMENTS.findIndex((s) => new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(s));
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(alterAt);
    }
  });

  it('every Phase 4 statement is IF NOT EXISTS and none is destructive', () => {
    const mine = GROWTH_JOURNEY_STATEMENTS.filter((s) => /growth_journey_(handoffs|outcomes|policies|conversation_ownership)\b/i.test(s));
    // 4 tables + 5 + 3 + 1 + 2 indexes, + 1: T501's per-person index names growth_journey_handoffs too.
    expect(mine).toHaveLength(16);
    for (const s of mine) {
      expect(s).toMatch(/IF NOT EXISTS/i);
      expect(s).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM|ALTER COLUMN|\bRENAME\b/i);
    }
  });

  it('all three are tenant- and brand-scoped with cascading tenancy keys, like every table this run owns', () => {
    for (const table of ['growth_journey_handoffs', 'growth_journey_outcomes', 'growth_journey_policies', 'growth_journey_conversation_ownership']) {
      const stmt = statementCreating(table)!;
      expect(stmt).toMatch(/tenant_id UUID NOT NULL REFERENCES tenants\(id\) ON DELETE CASCADE,/);
      expect(stmt).toMatch(/brand_id UUID NOT NULL REFERENCES brands\(id\) ON DELETE CASCADE,/);
    }
  });

  it('touches no explorer_ table and no tickets/organizations/leads row', () => {
    // A handoff points at a ticket and an organisation by id; it never reshapes
    // either table, and it never touches Explorer's.
    const mine = GROWTH_JOURNEY_STATEMENTS.filter((s) => /growth_journey_(handoffs|outcomes|policies|conversation_ownership)\b/i.test(s));
    for (const s of mine) {
      expect(s).not.toMatch(/explorer_/i);
      expect(s).not.toMatch(/REFERENCES\s+(tickets|organizations|leads)\b/i);
    }
  });

  it('this file, the Phase 4 statements module and the four models carry no literal control byte (heredoc tripwire)', () => {
    for (const file of [
      __filename,
      path.join(__dirname, '..', 'growthJourneyPhase4Statements.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyConversationOwnership.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyHandoff.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyOutcome.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyPolicy.ts'),
    ]) {
      const source = fs.readFileSync(file, 'utf8');
      for (const ch of ['\u0007', '\u0008', '\u000b', '\u000c', '\u001b']) {
        expect({ file: path.basename(file), has: source.includes(ch) }).toEqual({ file: path.basename(file), has: false });
      }
    }
  });
});
