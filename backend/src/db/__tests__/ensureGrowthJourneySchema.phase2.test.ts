import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { GrowthJourneyClassification } from '../../models/GrowthJourneyClassification';
import { GrowthJourneyTransition } from '../../models/GrowthJourneyTransition';
import { SQL, columnsDeclaredIn, statementCreating, tablesCreated } from './helpers/growthJourneyDdl';

/**
 * T222 — the two Phase 2 tables: model ↔ DDL parity, keys, and append-only shape.
 *
 * Same discipline as the Phase 1 parity file: the expected column lists are
 * WRITTEN OUT LITERALLY, never derived from `Model.getAttributes()`, and the
 * comparison is a set equality in BOTH directions. A one-directional
 * `toContain` passed a deleted primary key in Phase 1 because `'id'` is a
 * substring of `'tenant_id'`.
 */

const EXPECTED_CLASSIFICATION_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'subject_ref',
  'lead_id',
  'enrollment_id',
  'trigger',
  'input_hash',
  'brand_relationship',
  'journey_program_slug',
  'primary_path',
  'secondary_paths',
  'intent',
  'confidence',
  'evidence',
  'source_step',
  'requires_human_review',
  'status',
  'locked',
  'eligibility',
  'referral_target_brand_id',
  'ai_involved',
  'model_version',
  'ruleset_version',
  'override_of',
  'decided_by',
  'idempotency_key',
  'created_at',
];

const EXPECTED_TRANSITION_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'program_id',
  'subject_ref',
  'lead_id',
  'enrollment_id',
  'transition_type',
  'from_value',
  'to_value',
  'status',
  'reason',
  'evidence',
  'requested_by',
  'idempotency_key',
  'created_at',
];

/** The attribute names a model maps, including its timestamp columns. */
function modelColumns(model: { getAttributes(): Record<string, unknown> }): string[] {
  return Object.keys(model.getAttributes());
}

const sorted = (xs: string[]) => [...xs].sort();

describe('growth_journey_classifications', () => {
  it('SQL declares exactly the expected columns', () => {
    expect(sorted(columnsDeclaredIn('growth_journey_classifications'))).toEqual(
      sorted(EXPECTED_CLASSIFICATION_COLUMNS),
    );
  });

  it('the model maps exactly the same set', () => {
    expect(sorted(modelColumns(GrowthJourneyClassification))).toEqual(
      sorted(EXPECTED_CLASSIFICATION_COLUMNS),
    );
  });

  it('is append-only on the model: created_at only, no updated_at', () => {
    expect(modelColumns(GrowthJourneyClassification)).not.toContain('updated_at');
    expect(modelColumns(GrowthJourneyClassification)).toContain('created_at');
  });

  it('references tenants and brands, and NOT leads or enrollments', () => {
    const stmt = statementCreating('growth_journey_classifications')!;
    expect(stmt).toMatch(/tenant_id UUID NOT NULL REFERENCES tenants\(id\)/i);
    expect(stmt).toMatch(/brand_id UUID NOT NULL REFERENCES brands\(id\)/i);
    expect(stmt).toMatch(/lead_id INTEGER,/i);
    expect(stmt).toMatch(/enrollment_id UUID,/i);
    expect(stmt).not.toMatch(/REFERENCES leads/i);
    expect(stmt).not.toMatch(/REFERENCES enrollments/i);
    // and the model agrees — the anchors are plain columns
    const attrs = GrowthJourneyClassification.getAttributes() as Record<string, { references?: unknown }>;
    expect(attrs.lead_id.references).toBeUndefined();
    expect(attrs.enrollment_id.references).toBeUndefined();
  });

  it('the idempotency key is a UNIQUE index, on the SQL and the model', () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_classifications_idempotency_unique\s+ON growth_journey_classifications \(idempotency_key\)/i,
    );
    const indexes = (GrowthJourneyClassification.options.indexes ?? []) as Array<{
      name?: string;
      unique?: boolean;
      fields?: unknown[];
    }>;
    const idx = indexes.find((i) => i.name === 'growth_journey_classifications_idempotency_unique');
    expect(idx?.unique).toBe(true);
    expect(idx?.fields).toEqual(['idempotency_key']);
  });

  it('the review queue has a PARTIAL index on requires_human_review', () => {
    expect(SQL).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_gj_classifications_review\s+ON growth_journey_classifications \(brand_id, created_at DESC\)\s+WHERE requires_human_review/i,
    );
  });

  it('JSON list columns default to an empty array, never null', () => {
    const stmt = statementCreating('growth_journey_classifications')!;
    for (const col of ['secondary_paths', 'evidence']) {
      expect(stmt).toMatch(new RegExp(`${col} JSONB NOT NULL DEFAULT '\\[\\]'::jsonb`, 'i'));
    }
    const attrs = GrowthJourneyClassification.getAttributes() as Record<string, { defaultValue?: unknown }>;
    expect(attrs.secondary_paths.defaultValue).toEqual([]);
    expect(attrs.evidence.defaultValue).toEqual([]);
  });

  it('flags default closed: not reviewed, not locked, no AI', () => {
    const attrs = GrowthJourneyClassification.getAttributes() as Record<string, { defaultValue?: unknown }>;
    expect(attrs.requires_human_review.defaultValue).toBe(false);
    expect(attrs.locked.defaultValue).toBe(false);
    expect(attrs.ai_involved.defaultValue).toBe(false);
    const stmt = statementCreating('growth_journey_classifications')!;
    expect(stmt).toMatch(/requires_human_review BOOLEAN NOT NULL DEFAULT false/i);
    expect(stmt).toMatch(/locked BOOLEAN NOT NULL DEFAULT false/i);
    expect(stmt).toMatch(/ai_involved BOOLEAN NOT NULL DEFAULT false/i);
  });

  it('status and ruleset_version are required; model_version is not (deterministic rows have none)', () => {
    const stmt = statementCreating('growth_journey_classifications')!;
    expect(stmt).toMatch(/status VARCHAR\(16\) NOT NULL/i);
    expect(stmt).toMatch(/ruleset_version VARCHAR\(16\) NOT NULL/i);
    expect(stmt).toMatch(/model_version TEXT,/i);
  });
});

describe('growth_journey_transitions', () => {
  it('SQL declares exactly the expected columns', () => {
    expect(sorted(columnsDeclaredIn('growth_journey_transitions'))).toEqual(
      sorted(EXPECTED_TRANSITION_COLUMNS),
    );
  });

  it('the model maps exactly the same set', () => {
    expect(sorted(modelColumns(GrowthJourneyTransition))).toEqual(sorted(EXPECTED_TRANSITION_COLUMNS));
  });

  it('is append-only on the model: created_at only, no updated_at', () => {
    expect(modelColumns(GrowthJourneyTransition)).not.toContain('updated_at');
  });

  it('program_id clears, never cascades, when a programme is deleted', () => {
    // A deleted programme must not erase the history of subjects that were in it.
    const stmt = statementCreating('growth_journey_transitions')!;
    expect(stmt).toMatch(/program_id UUID REFERENCES journey_programs\(id\) ON DELETE SET NULL/i);
  });

  it('the idempotency key is a UNIQUE index, on the SQL and the model', () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_transitions_idempotency_unique\s+ON growth_journey_transitions \(idempotency_key\)/i,
    );
    const indexes = (GrowthJourneyTransition.options.indexes ?? []) as Array<{ name?: string; unique?: boolean }>;
    expect(indexes.find((i) => i.name === 'growth_journey_transitions_idempotency_unique')?.unique).toBe(true);
  });

  it('reason and requested_by are required — a transition without a stated cause cannot be written', () => {
    const stmt = statementCreating('growth_journey_transitions')!;
    expect(stmt).toMatch(/reason TEXT NOT NULL/i);
    expect(stmt).toMatch(/requested_by TEXT NOT NULL/i);
  });
});

describe('the two tables sit in the statement list where the foreign keys allow', () => {
  it('after journey_programs (transitions references it) and before the brands ALTER', () => {
    const order = tablesCreated();
    expect(order.indexOf('journey_programs')).toBeLessThan(order.indexOf('growth_journey_transitions'));
    const idxTransitions = GROWTH_JOURNEY_STATEMENTS.findIndex((s) =>
      /CREATE TABLE IF NOT EXISTS growth_journey_transitions\b/i.test(s),
    );
    const idxAlter = GROWTH_JOURNEY_STATEMENTS.findIndex((s) => /^\s*ALTER\s+TABLE\s+brands\b/i.test(s));
    expect(idxTransitions).toBeGreaterThan(-1);
    expect(idxAlter).toBeGreaterThan(idxTransitions);
  });

  it('the run now owns seven tables, and the bidirectional _unique guard covers all seven', () => {
    expect(tablesCreated()).toHaveLength(7);
    const uniqueNamed = [...SQL.matchAll(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)/gi)].map((m) => m[1]);
    expect(uniqueNamed).toEqual(expect.arrayContaining([
      'growth_journey_classifications_idempotency_unique',
      'growth_journey_transitions_idempotency_unique',
    ]));
  });
});
