import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { GROWTH_JOURNEY_PHASE4_STATEMENTS } from '../growthJourneyPhase4Statements';
import { GROWTH_JOURNEY_PHASE5_STATEMENTS } from '../growthJourneyPhase5Statements';
import { OPEN_HANDOFF_STATUSES } from '../../models/GrowthJourneyHandoff';
import GrowthJourneyExecution, { OPEN_EXECUTION_STATUSES } from '../../models/GrowthJourneyExecution';
import GrowthJourneyExecutionControl from '../../models/GrowthJourneyExecutionControl';
import GrowthJourneyInAppNudge from '../../models/GrowthJourneyInAppNudge';
import { columnsDeclaredIn, statementCreating, tablesCreated } from './helpers/growthJourneyDdl';

/**
 * The Phase 5 statements (governed execution). T501 opens the sibling module
 * with the one index the Phase 5 packet's 7A asked for; T503 adds the three
 * execution tables to the same list and to this file.
 *
 * Same discipline as the Phase 1-4 files: the expected column lists are WRITTEN
 * OUT LITERALLY, never derived from `Model.getAttributes()`, and compared IN
 * ORDER against both the DDL and the model. A column that moves is a column
 * somebody should have to move on purpose.
 */

const ws = (s: string) => s.replace(/\s+/g, ' ').trim();
const indexStatementsOn = (table: string) =>
  GROWTH_JOURNEY_STATEMENTS.filter((s) => new RegExp(`INDEX IF NOT EXISTS \\w+\\s+ON ${table}\\b`, 'i').test(ws(s)));
const modelColumns = (model: { getAttributes: () => Record<string, unknown> }) => Object.keys(model.getAttributes());

const EXPECTED_EXECUTION_COLUMNS = [
  'id', 'tenant_id', 'brand_id', 'program_id', 'decision_id', 'subject_ref', 'lead_id', 'enrollment_id',
  'channel', 'action_type', 'campaign_id', 'campaign_key', 'sequence_id', 'mode', 'status', 'status_reason',
  'control_ids', 'proposal_id', 'approved_by', 'approved_at', 'claimed_at', 'attempts', 'scheduled_email_id',
  'nudge_id', 'outcome', 'last_error_class', 'created_at', 'updated_at',
];
const EXPECTED_CONTROL_COLUMNS = [
  'id', 'tenant_id', 'kind', 'scope_key', 'brand_id', 'program_id', 'channel', 'subject_ref', 'mode',
  'cohort_lead_ids', 'daily_limit', 'reason', 'set_by_admin_id', 'cleared_at', 'cleared_by_admin_id', 'created_at',
];
/** Column names that contain a banned word but hold an id or a reference, never content. */
const POINTERS_NOT_CONTENT = ['subject_ref', 'scheduled_email_id'];

const EXPECTED_NUDGE_COLUMNS = [
  'id', 'tenant_id', 'brand_id', 'program_id', 'enrollment_id', 'execution_id', 'title', 'href', 'purpose',
  'shown_at', 'dismissed_at', 'expires_at', 'created_at',
];

describe('the Phase 5 sibling module', () => {
  it('is spread whole, right after Phase 4, and the brands ALTER stays last', () => {
    const p4Last = GROWTH_JOURNEY_STATEMENTS.indexOf(GROWTH_JOURNEY_PHASE4_STATEMENTS[GROWTH_JOURNEY_PHASE4_STATEMENTS.length - 1]);
    const p5 = GROWTH_JOURNEY_PHASE5_STATEMENTS.map((s) => GROWTH_JOURNEY_STATEMENTS.indexOf(s));
    expect(GROWTH_JOURNEY_PHASE5_STATEMENTS.length).toBeGreaterThan(0);
    expect(p5).toEqual(GROWTH_JOURNEY_PHASE5_STATEMENTS.map((_, i) => p4Last + 1 + i));
    const alterAt = GROWTH_JOURNEY_STATEMENTS.findIndex((s) => /ALTER\s+TABLE\s+brands/i.test(s));
    expect(alterAt).toBe(GROWTH_JOURNEY_STATEMENTS.length - 1);
    expect(Math.max(...p5)).toBeLessThan(alterAt);
  });

  it('is additive: every statement IF NOT EXISTS, none destructive, no explorer_ name', () => {
    for (const s of GROWTH_JOURNEY_PHASE5_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/i);
      expect(s).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM|ALTER COLUMN|\bRENAME\b/i);
      expect(s).not.toMatch(/explorer_/i);
    }
  });

  it('kept the parent at the 500-line ceiling: the import it added was paid for by folding a comment', () => {
    const lines = fs.readFileSync(path.join(__dirname, '..', 'ensureGrowthJourneySchema.ts'), 'utf8').split('\n').length;
    // A trailing newline makes split() one longer than `wc -l`.
    expect(lines - 1).toBeLessThanOrEqual(500);
  });
});

describe('T501 (7A): ONE OPEN HANDOFF PER PERSON PER BRAND', () => {
  it('a partial unique on (lead_id, brand_id) over exactly the open statuses', () => {
    const idx = GROWTH_JOURNEY_PHASE5_STATEMENTS.find((s) => /growth_journey_handoffs_open_lead_unique/.test(s));
    expect(idx).toBeDefined();
    expect(ws(idx!)).toMatch(
      /^CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_open_lead_unique ON growth_journey_handoffs \(lead_id, brand_id\) WHERE status IN \('queued', 'assigned', 'accepted'\)$/,
    );
  });

  it('shares its predicate with the per-subject index and with the model, so no writer can drift from either', () => {
    const inList = (name: string) => {
      const s = ws(GROWTH_JOURNEY_STATEMENTS.find((x) => x.includes(name))!);
      return /WHERE status IN \(([^)]*)\)$/.exec(s)![1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
    };
    expect(inList('growth_journey_handoffs_open_lead_unique')).toEqual(inList('growth_journey_handoffs_open_subject_unique'));
    expect(inList('growth_journey_handoffs_open_lead_unique')).toEqual([...OPEN_HANDOFF_STATUSES]);
  });
});

describe('T503: the execution tables', () => {
  it('each table declares the columns its model does, in the same order', () => {
    expect(columnsDeclaredIn('growth_journey_executions')).toEqual(EXPECTED_EXECUTION_COLUMNS);
    expect(modelColumns(GrowthJourneyExecution)).toEqual(EXPECTED_EXECUTION_COLUMNS);
    expect(columnsDeclaredIn('growth_journey_execution_controls')).toEqual(EXPECTED_CONTROL_COLUMNS);
    expect(modelColumns(GrowthJourneyExecutionControl)).toEqual(EXPECTED_CONTROL_COLUMNS);
    expect(columnsDeclaredIn('growth_journey_in_app_nudges')).toEqual(EXPECTED_NUDGE_COLUMNS);
    expect(modelColumns(GrowthJourneyInAppNudge)).toEqual(EXPECTED_NUDGE_COLUMNS);
  });

  it('carries no address, body or subject column anywhere: a receipt says WHICH rows, never what was said', () => {
    expect(POINTERS_NOT_CONTENT).toEqual(['subject_ref', 'scheduled_email_id']);
    for (const table of ['growth_journey_executions', 'growth_journey_execution_controls', 'growth_journey_in_app_nudges']) {
      for (const column of columnsDeclaredIn(table)) {
        // Two names carry a banned word and are IDs, not content: the journey's subject (a person in a
        // brand) and the pointer at the campaign engine's row. Anything else must be added on purpose.
        if (POINTERS_NOT_CONTENT.includes(column)) continue;
        expect(column).not.toMatch(/email|phone|address|body|subject|message|recipient|transcript/i);
      }
    }
  });

  it('is tenant-scoped everywhere, brand-scoped everywhere but a control (a pause may be programme- or channel-wide)', () => {
    for (const table of ['growth_journey_executions', 'growth_journey_execution_controls', 'growth_journey_in_app_nudges']) {
      expect(statementCreating(table)!).toMatch(/tenant_id UUID NOT NULL REFERENCES tenants\(id\) ON DELETE CASCADE,/);
    }
    for (const table of ['growth_journey_executions', 'growth_journey_in_app_nudges']) {
      expect(statementCreating(table)!).toMatch(/brand_id UUID NOT NULL REFERENCES brands\(id\) ON DELETE CASCADE,/);
    }
    const control = statementCreating('growth_journey_execution_controls')!;
    expect(control).toMatch(/brand_id UUID REFERENCES brands\(id\) ON DELETE CASCADE,/);
    expect(control).not.toMatch(/brand_id UUID NOT NULL/);
  });

  it('the receipt points at the campaign engine WITHOUT foreign keys, and hangs off its decision with one', () => {
    const stmt = statementCreating('growth_journey_executions')!;
    expect(stmt).toMatch(/decision_id UUID NOT NULL REFERENCES growth_journey_decisions\(id\) ON DELETE CASCADE,/);
    for (const column of ['campaign_id', 'sequence_id', 'scheduled_email_id', 'nudge_id']) {
      expect(ws(stmt)).toMatch(new RegExp(`${column} UUID,`));
      expect(ws(stmt)).not.toMatch(new RegExp(`${column} UUID REFERENCES`));
    }
  });

  it('EXACTLY ONCE is three database mechanisms: one receipt per decision, and one OPEN receipt per person and per enrolment', () => {
    const open = `('${OPEN_EXECUTION_STATUSES.join("', '")}')`;
    expect(ws(GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_executions_decision_unique/.test(s))!))
      .toBe('CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_executions_decision_unique ON growth_journey_executions (decision_id)');
    expect(ws(GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_executions_open_lead_unique/.test(s))!))
      .toBe(`CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_executions_open_lead_unique ON growth_journey_executions (lead_id, brand_id, channel) WHERE status IN ${open}`);
    expect(ws(GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_executions_open_enrollment_unique/.test(s))!))
      .toBe(`CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_executions_open_enrollment_unique ON growth_journey_executions (enrollment_id, brand_id, channel) WHERE status IN ${open}`);
    // The model's exported predicate IS the index's, so a writer cannot drift from it.
    expect([...OPEN_EXECUTION_STATUSES]).toEqual(['pending_review', 'approved', 'enrolling', 'enrolled', 'in_progress']);
  });

  it('a limited rollout cannot exist without a cohort and a daily limit, and a pause is always off - the database says so, not the caller', () => {
    const stmt = ws(statementCreating('growth_journey_execution_controls')!);
    expect(stmt).toContain("CHECK (kind <> 'pause' OR mode = 'off')");
    // A rollout RAISES a mode, so it must name the brand it raises; only a pause may be brandless.
    expect(stmt).toContain("CHECK (kind <> 'rollout' OR brand_id IS NOT NULL)");
    // COALESCE, not a bare comparison: a Postgres CHECK passes when its expression is NULL, so
    // `daily_limit > 0` with a NULL limit, and `array_length('{}', 1) > 0` with an empty cohort, both
    // evaluate to NULL and would ADMIT an unbounded `limited` rollout. Proven against PostgreSQL 16 and
    // recorded in evidence/T503-producer.md; these three cases are what the form below refuses:
    //   limited + cohort + NULL daily_limit | limited + limit + EMPTY cohort | rollout + NULL brand_id
    expect(stmt).toContain("CHECK (mode <> 'limited' OR (COALESCE(daily_limit, 0) > 0 AND COALESCE(array_length(cohort_lead_ids, 1), 0) > 0))");
    // The NULL-admitting forms must not come back.
    expect(stmt).not.toMatch(/CHECK \(mode <> 'limited' OR \(daily_limit > 0/);
    expect(ws(GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_execution_controls_scope_unique/.test(s))!))
      .toBe('CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_execution_controls_scope_unique ON growth_journey_execution_controls (scope_key) WHERE cleared_at IS NULL');
  });

  it('one nudge per execution, and the nudge dies with its receipt', () => {
    expect(statementCreating('growth_journey_in_app_nudges')!).toMatch(/execution_id UUID NOT NULL REFERENCES growth_journey_executions\(id\) ON DELETE CASCADE,/);
    expect(ws(GROWTH_JOURNEY_STATEMENTS.find((s) => /growth_journey_in_app_nudges_execution_unique/.test(s))!))
      .toBe('CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_in_app_nudges_execution_unique ON growth_journey_in_app_nudges (execution_id)');
  });

  it('the three tables are created in dependency order, after Phase 4 and before the brands ALTER', () => {
    const tables = tablesCreated();
    expect(tables).toHaveLength(18);
    expect(tables.slice(-3)).toEqual(['growth_journey_executions', 'growth_journey_execution_controls', 'growth_journey_in_app_nudges']);
    // The nudge's foreign key names the receipt, so the receipt's table comes first.
    expect(tables.indexOf('growth_journey_in_app_nudges')).toBeGreaterThan(tables.indexOf('growth_journey_executions'));
    expect(tables.indexOf('growth_journey_executions')).toBeGreaterThan(tables.indexOf('growth_journey_decisions'));
  });

  it('every index this task ships is accounted for: five on the receipt, two on controls, two on nudges', () => {
    expect(indexStatementsOn('growth_journey_executions')).toHaveLength(5);
    expect(indexStatementsOn('growth_journey_execution_controls')).toHaveLength(2);
    expect(indexStatementsOn('growth_journey_in_app_nudges')).toHaveLength(2);
    expect(GROWTH_JOURNEY_PHASE5_STATEMENTS).toHaveLength(13); // T501's index + 3 tables + 9 indexes
  });
});

describe('heredoc tripwire', () => {
  it('this file, the Phase 5 statements module and the escalation-trigger module carry no literal control byte', () => {
    for (const file of [
      __filename,
      path.join(__dirname, '..', 'growthJourneyPhase5Statements.ts'),
      path.join(__dirname, '..', '..', 'services', 'growthJourney', 'handoffs', 'escalationTriggers.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyExecution.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyExecutionControl.ts'),
      path.join(__dirname, '..', '..', 'models', 'GrowthJourneyInAppNudge.ts'),
      path.join(__dirname, '..', '..', 'models', 'growthJourneyModels.ts'),
    ]) {
      const source = fs.readFileSync(file, 'utf8');
      // Tab (0x09), LF (0x0a) and CR (0x0d) are text; every other byte below 0x20 is a shell accident.
      const control = [...source].filter((ch) => ch.charCodeAt(0) < 0x20 && ![0x09, 0x0a, 0x0d].includes(ch.charCodeAt(0)));
      expect({ file: path.basename(file), control }).toEqual({ file: path.basename(file), control: [] });
    }
  });
});
