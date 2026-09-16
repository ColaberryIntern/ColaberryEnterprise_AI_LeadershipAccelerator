import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import GrowthJourneyContentRule from '../../models/GrowthJourneyContentRule';
import GrowthJourneyDecision from '../../models/GrowthJourneyDecision';
import GrowthJourneyProfile from '../../models/GrowthJourneyProfile';
import GrowthJourneyScoreSnapshot from '../../models/GrowthJourneyScoreSnapshot';
import { SQL, columnsDeclaredIn, statementCreating, tablesCreated } from './helpers/growthJourneyDdl';

/**
 * The Phase 3 tables: model ↔ DDL parity, keys, append-only shape, and the two
 * deliberate exceptions to append-only.
 *
 * T301 brought decisions, profiles and score_snapshots; T305 brought
 * content_rules, the section 10 declaration.
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

const EXPECTED_CONTENT_RULE_COLUMNS = [
  'id',
  'tenant_id',
  'brand_id',
  'asset_id',
  'collection_key',
  'eligible_programs',
  'eligible_paths',
  'audience_personas',
  'lifecycle_states',
  'overlays',
  'offer_family',
  'channels',
  'content_purpose',
  'approved_claims',
  'source_evidence',
  'approved_urls',
  'approved_ctas',
  'effective_from',
  'expires_at',
  'access_tier',
  'sender_profile_id',
  'version',
  'owner',
  'approval_status',
  'approved_by',
  'approved_at',
  'created_at',
  'updated_at',
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
  it('the run now owns fifteen tables', () => {
    // Eleven when Phase 3 wrote this; Phase 4 (T401) added handoffs, outcomes
    // and policies; T402 added conversation ownership. Their columns are pinned
    // in order in the phase4 file.
    expect(tablesCreated()).toHaveLength(15);
    expect(tablesCreated()).toEqual(
      expect.arrayContaining([
        'growth_journey_content_rules',
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

describe('growth_journey_content_rules (T305)', () => {
  it('SQL declares exactly the expected columns', () => {
    expect(sorted(columnsDeclaredIn('growth_journey_content_rules'))).toEqual(
      sorted(EXPECTED_CONTENT_RULE_COLUMNS),
    );
  });

  it('GrowthJourneyContentRule maps exactly the same set', () => {
    expect(sorted(modelColumns(GrowthJourneyContentRule))).toEqual(
      sorted(EXPECTED_CONTENT_RULE_COLUMNS),
    );
  });

  it('actually maintains updated_at, which a mutable table must', () => {
    // It said MUTABLE on both sides and set `timestamps: false`, so the column
    // would never have advanced on an edit. T301's mutable sibling
    // `GrowthJourneyProfile` maps both timestamp columns; this now matches it.
    const options = (GrowthJourneyContentRule as unknown as {
      options: { timestamps?: boolean; createdAt?: string; updatedAt?: string };
    }).options;
    expect(options.timestamps).toBe(true);
    expect(options.updatedAt).toBe('updated_at');
    expect(options.createdAt).toBe('created_at');
  });

  it('is MUTABLE on purpose, unlike the other three, and says so on both sides', () => {
    // A declaration is edited as content is reviewed. `version` plus the unique
    // index below is how a superseded declaration stays readable, rather than
    // append-only rows plus a "latest" query.
    expect(modelColumns(GrowthJourneyContentRule)).toContain('updated_at');
    expect(columnsDeclaredIn('growth_journey_content_rules')).toContain('updated_at');
    expect(columnsDeclaredIn('growth_journey_content_rules')).toContain('version');
  });

  it('answers every section 10 declaration question, by column', () => {
    // The failure this catches is a table with most of the fields, missing the
    // ones nobody needs until a claim needs its evidence.
    const cols = columnsDeclaredIn('growth_journey_content_rules');
    const SECTION_10 = {
      'tenant and brand': ['tenant_id', 'brand_id'],
      'which asset or collection': ['asset_id', 'collection_key'],
      'eligible programmes and paths': ['eligible_programs', 'eligible_paths'],
      'audience and persona': ['audience_personas'],
      'lifecycle states and overlays': ['lifecycle_states', 'overlays'],
      'offer family': ['offer_family'],
      'channel and purpose': ['channels', 'content_purpose'],
      'approved claims and their evidence': ['approved_claims', 'source_evidence'],
      'approved URLs and CTAs': ['approved_urls', 'approved_ctas'],
      'effective and expiry dates': ['effective_from', 'expires_at'],
      'free versus restricted access': ['access_tier'],
      'sender profile': ['sender_profile_id'],
      'version, owner and approval state': ['version', 'owner', 'approval_status'],
    };
    const missing = Object.entries(SECTION_10)
      .flatMap(([question, columns]) => columns.filter((c) => !cols.includes(c)).map((c) => `${question}: ${c}`));
    expect(missing).toEqual([]);
  });

  it('is keyed so one asset has ONE live declaration per brand, and the key is really UNIQUE', () => {
    const idx = SQL.match(
      /CREATE\s+(UNIQUE\s+)?INDEX IF NOT EXISTS growth_journey_content_rules_asset_unique[^`]*/i,
    );
    expect(idx).not.toBeNull();
    // The keyword, not just the name: a non-unique index called `_unique` is the
    // lie the parity suite's bidirectional guard exists for.
    expect(idx?.[1]).toBeDefined();
    expect(idx?.[0]).toMatch(/\(brand_id, asset_id, version\)/);
    expect(idx?.[0]).toMatch(/WHERE asset_id IS NOT NULL/i);
  });

  it('carries the foreign keys the asset table deliberately does not', () => {
    // `explorer_content_assets` got its brand columns WITHOUT foreign keys - it
    // is an index over other tables and its DDL runs before the multi-tenant
    // modules are guaranteed to have. This table is this run's own, orders
    // itself, and therefore has no excuse.
    const create = statementCreating('growth_journey_content_rules') as string;
    expect(create).toMatch(/tenant_id UUID NOT NULL REFERENCES tenants\(id\)/i);
    expect(create).toMatch(/brand_id UUID NOT NULL REFERENCES brands\(id\)/i);
  });

  it('ships EMPTY: this module inserts nothing into it', () => {
    // Declaring the existing assets is a human review job (Phase 4). A seeded
    // row here would be a fabricated approval record, and `contentEligibility`
    // is written so that an empty table changes nobody's content.
    expect(SQL).not.toMatch(/INSERT\s+INTO\s+growth_journey_content_rules/i);
  });
});
