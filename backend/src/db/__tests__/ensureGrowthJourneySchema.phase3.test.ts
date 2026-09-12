import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import GrowthJourneyDecision from '../../models/GrowthJourneyDecision';
import GrowthJourneyProfile from '../../models/GrowthJourneyProfile';
import GrowthJourneyScoreSnapshot from '../../models/GrowthJourneyScoreSnapshot';
import { SQL, columnsDeclaredIn, statementCreating, tablesCreated } from './helpers/growthJourneyDdl';

/**
 * T301 — the three Phase 3 tables: model ↔ DDL parity, keys, append-only shape,
 * and the one deliberate exception to append-only.
 *
 * Same discipline as the Phase 1 and Phase 2 files: the expected column lists
 * are WRITTEN OUT LITERALLY, never derived from `Model.getAttributes()`, and
 * every comparison is a set equality in BOTH directions. A one-directional
 * `toContain` passed a deleted primary key in Phase 1, because `'id'` is a
 * substring of `'tenant_id'`.
 */

const EXPECTED_DECISION_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'program_id',
  'subject_ref',
  'lead_id',
  'enrollment_id',
  'classification_id',
  'trigger',
  'decision_date',
  'mode',
  'selected_action',
  'selected_path',
  'selected_channel',
  'selected_content',
  'candidates',
  'suppressed',
  'deferred_actions',
  'eligibility',
  'scores',
  'score_gaps',
  'state_at_decision',
  'overlays_at_decision',
  'contact_evidence',
  'human_conversation',
  'sales_capacity',
  'content_gaps',
  'reason',
  'requires_human_review',
  'ai_involved',
  'model_version',
  'ruleset_version',
  'executed',
  'execution_receipt',
  'decided_by',
  'idempotency_key',
  'created_at',
];

const EXPECTED_PROFILE_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'program_id',
  'subject_ref',
  'lead_id',
  'enrollment_id',
  'state',
  'state_entered_at',
  'overlays',
  'scores',
  'score_gaps',
  'scores_computed_at',
  'signals_summary',
  'last_decision_at',
  'source',
  'created_at',
  'updated_at',
];

const EXPECTED_SNAPSHOT_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'subject_ref',
  'as_of_date',
  'state',
  'overlays',
  'scores',
  'score_gaps',
  'created_at',
];

/** The attribute names a model maps, including its timestamp columns. */
function modelColumns(model: { getAttributes(): Record<string, unknown> }): string[] {
  return Object.keys(model.getAttributes());
}

const sorted = (xs: string[]) => [...xs].sort();

describe('growth_journey_decisions', () => {
  it('SQL declares exactly the expected columns', () => {
    expect(sorted(columnsDeclaredIn('growth_journey_decisions'))).toEqual(
      sorted(EXPECTED_DECISION_COLUMNS),
    );
  });

  it('GrowthJourneyDecision maps exactly the same set', () => {
    expect(sorted(modelColumns(GrowthJourneyDecision))).toEqual(sorted(EXPECTED_DECISION_COLUMNS));
  });

  it('is append-only: created_at, no updated_at, on both sides', () => {
    expect(modelColumns(GrowthJourneyDecision)).toContain('created_at');
    expect(modelColumns(GrowthJourneyDecision)).not.toContain('updated_at');
    expect(columnsDeclaredIn('growth_journey_decisions')).not.toContain('updated_at');
  });

  it('carries every §7.3 field a decision must record, including the two with no source', () => {
    // §7.3 requires all candidates, the eligibility/policy result, score and
    // state evidence, content and brand eligibility, recent contacts and
    // cooldowns, human conversation status, sales capacity, the selected action,
    // every suppressed action with its reason, ruleset/model versions, whether
    // AI participated, and an execution receipt.
    //
    // `human_conversation` and `sales_capacity` have NO source in this
    // codebase — nothing records whether a human is already in conversation
    // with someone, and there is no sales capacity table at all — so they exist
    // here to be recorded as `unknown`, honestly, rather than omitted. Omitting
    // them would let a later reader assume the question was answered.
    for (const field of [
      'candidates',
      'suppressed',
      'deferred_actions',
      'eligibility',
      'scores',
      'score_gaps',
      'state_at_decision',
      'overlays_at_decision',
      'contact_evidence',
      'human_conversation',
      'sales_capacity',
      'content_gaps',
      'selected_action',
      'ruleset_version',
      'model_version',
      'ai_involved',
      'execution_receipt',
    ]) {
      expect(columnsDeclaredIn('growth_journey_decisions')).toContain(field);
      expect(modelColumns(GrowthJourneyDecision)).toContain(field);
    }
  });

  it('defaults `executed` false and the two unknowables to `unknown`', () => {
    const stmt = statementCreating('growth_journey_decisions');
    expect(stmt).toMatch(/executed BOOLEAN NOT NULL DEFAULT FALSE/i);
    expect(stmt).toMatch(/human_conversation VARCHAR\(8\) NOT NULL DEFAULT 'unknown'/i);
    expect(stmt).toMatch(/sales_capacity VARCHAR\(12\) NOT NULL DEFAULT 'unknown'/i);
  });

  it('is keyed on a hashed idempotency_key, NOT on (enrollment_id, decision_date)', () => {
    // Explorer's table uses one-per-learner-per-day, which cannot express one
    // decision per subject PER BRAND — and its `enrollment_id` is NOT NULL with
    // a foreign key to `enrollments`, so a business subject cannot be recorded
    // there at all. Hence a separate table with a hashed key.
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_decisions_idempotency_unique\s+ON growth_journey_decisions \(idempotency_key\)/i,
    );
    const decisionUniques = [
      ...SQL.matchAll(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+growth_journey_decisions/gi),
    ].map((m) => m[1]);
    expect(decisionUniques).toEqual(['growth_journey_decisions_idempotency_unique']);
    expect(modelColumns(GrowthJourneyDecision)).toContain('enrollment_id');
    expect(statementCreating('growth_journey_decisions')).toMatch(/enrollment_id UUID,/);
  });
});

describe('growth_journey_profiles', () => {
  it('SQL declares exactly the expected columns', () => {
    expect(sorted(columnsDeclaredIn('growth_journey_profiles'))).toEqual(
      sorted(EXPECTED_PROFILE_COLUMNS),
    );
  });

  it('GrowthJourneyProfile maps exactly the same set', () => {
    expect(sorted(modelColumns(GrowthJourneyProfile))).toEqual(sorted(EXPECTED_PROFILE_COLUMNS));
  });

  it('is the ONE mutable table this run owns, deliberately, and says so on both sides', () => {
    // A projection of the current state, not a ledger. Every state change it
    // records also writes an append-only `growth_journey_transitions` row, so
    // the history is never lost by updating this one in place.
    expect(modelColumns(GrowthJourneyProfile)).toContain('updated_at');
    expect(columnsDeclaredIn('growth_journey_profiles')).toContain('updated_at');
  });

  it('is unique per (brand_id, subject_ref) so one person can stand in a different place per brand', () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_profiles_brand_subject_unique\s+ON growth_journey_profiles \(brand_id, subject_ref\)/i,
    );
  });

  it('allows a null score vector, because a subject with no score source is a real state', () => {
    // CPN has no learner profile source at all: `explorer_journey_profiles` is
    // keyed on an `enrollments.id` and a CPN lead is not a curriculum enrolment.
    // A null `scores` with `score_gaps` explaining why is the honest record.
    const stmt = statementCreating('growth_journey_profiles');
    expect(stmt).toMatch(/scores JSONB,/);
    expect(stmt).toMatch(/score_gaps JSONB NOT NULL DEFAULT '\[\]'::jsonb/i);
    expect(stmt).toMatch(/scores_computed_at TIMESTAMPTZ,/);
  });
});

describe('growth_journey_score_snapshots', () => {
  it('SQL declares exactly the expected columns', () => {
    expect(sorted(columnsDeclaredIn('growth_journey_score_snapshots'))).toEqual(
      sorted(EXPECTED_SNAPSHOT_COLUMNS),
    );
  });

  it('GrowthJourneyScoreSnapshot maps exactly the same set', () => {
    expect(sorted(modelColumns(GrowthJourneyScoreSnapshot))).toEqual(
      sorted(EXPECTED_SNAPSHOT_COLUMNS),
    );
  });

  it('is append-only and unique per day — the gap Explorer\'s own snapshots have', () => {
    // `explorer_score_snapshots` has NO unique index, so a second run on the
    // same day silently doubles the history. This one is unique on
    // (brand_id, subject_ref, as_of_date) in the DDL and on the model.
    expect(modelColumns(GrowthJourneyScoreSnapshot)).not.toContain('updated_at');
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_snapshots_subject_date_unique\s+ON growth_journey_score_snapshots \(brand_id, subject_ref, as_of_date\)/i,
    );
  });
});

describe('the three tables sit where the foreign keys and the boot order allow', () => {
  it('the run now owns ten tables', () => {
    expect(tablesCreated()).toHaveLength(10);
    expect(tablesCreated()).toEqual(
      expect.arrayContaining([
        'growth_journey_decisions',
        'growth_journey_profiles',
        'growth_journey_score_snapshots',
      ]),
    );
  });

  it('all three are created BEFORE the brands ALTER, which stays last', () => {
    const alterAt = GROWTH_JOURNEY_STATEMENTS.findIndex((s) => /ALTER\s+TABLE\s+brands/i.test(s));
    expect(alterAt).toBe(GROWTH_JOURNEY_STATEMENTS.length - 1);
    for (const table of [
      'growth_journey_decisions',
      'growth_journey_profiles',
      'growth_journey_score_snapshots',
    ]) {
      const at = GROWTH_JOURNEY_STATEMENTS.findIndex((s) =>
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i').test(s),
      );
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(alterAt);
    }
  });

  it('each one references journey_programs or the tenancy tables it needs, and nothing it does not', () => {
    // journey_programs is created at the top of the list, so a FK naming it is
    // safe. `classification_id` is deliberately NOT a foreign key: a decision
    // must survive a classification being superseded, and classifications are
    // append-only so the row it names never disappears anyway.
    expect(statementCreating('growth_journey_decisions')).toMatch(
      /program_id UUID REFERENCES journey_programs\(id\) ON DELETE SET NULL/i,
    );
    expect(statementCreating('growth_journey_decisions')).toMatch(/classification_id UUID,/);
    expect(statementCreating('growth_journey_decisions')).not.toMatch(
      /classification_id UUID REFERENCES/i,
    );
    expect(statementCreating('growth_journey_score_snapshots')).not.toMatch(
      /REFERENCES journey_programs/i,
    );
  });

  it('every statement is IF NOT EXISTS and none is destructive', () => {
    const mine = GROWTH_JOURNEY_STATEMENTS.filter((s) =>
      /growth_journey_(decisions|profiles|score_snapshots|snapshots)/i.test(s),
    );
    expect(mine.length).toBeGreaterThanOrEqual(8);
    for (const s of mine) {
      expect(s).toMatch(/IF NOT EXISTS/i);
      expect(s).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM|ALTER COLUMN|\bRENAME\b/i);
    }
  });
});
