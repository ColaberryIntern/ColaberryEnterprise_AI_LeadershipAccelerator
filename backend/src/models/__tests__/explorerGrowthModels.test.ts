import ExplorerJourneyProfile from '../ExplorerJourneyProfile';
import ExplorerJourneyDecision from '../ExplorerJourneyDecision';
import ExplorerScoreSnapshot from '../ExplorerScoreSnapshot';
import ExplorerExperimentAssignment from '../ExplorerExperimentAssignment';
import ExplorerContentAsset from '../ExplorerContentAsset';

/**
 * These are ANTI-DRIFT tests, not "does Sequelize work" tests.
 *
 * ensureExplorerGrowthSchema.ts (T003) creates these tables with hand-written
 * raw SQL, because production does not run sequelize.sync. That means the model
 * and the DDL are two independent descriptions of the same table, and nothing
 * in the type system keeps them together. The exact attribute sets pinned below
 * are the contract T003's own test diffs its CREATE TABLE statements against —
 * so a column added to one side and not the other fails here or there, rather
 * than at 3am as a "column does not exist" on a live query.
 *
 * Every expected list is written out literally, never derived from
 * `Model.getAttributes()`, or the test would assert only that the code equals
 * itself.
 */

const PROFILE_ATTRS = [
  'enrollment_id',
  'lead_id',
  'email_normalized',
  'primary_state',
  'overlays',
  'e_score',
  'i_score',
  'f_score',
  'contactability',
  'affinities',
  'signal_summary',
  'days_since_last_activity',
  'state_entered_at',
  'last_decision_at',
  'last_contacted_at',
  'scores_computed_at',
  'created_at',
  'updated_at',
];

const DECISION_ATTRS = [
  'id',
  'enrollment_id',
  'lead_id',
  'decision_date',
  'mode',
  'primary_state',
  'overlays',
  'e_score',
  'i_score',
  'f_score',
  'triggering_signals',
  'candidate_actions',
  'suppressed_actions',
  'selected_action',
  'selected_campaign_id',
  'selected_sequence_step',
  'selected_content_assets',
  'channel',
  'reason',
  'deferred_actions',
  'ai_involved',
  'ai_rationale',
  'ruleset_version',
  'holdout_group',
  'experiment_key',
  'executed',
  'scheduled_email_id',
  'outcome',
  'outcome_at',
  'created_at',
];

const SNAPSHOT_ATTRS = [
  'id',
  'enrollment_id',
  'as_of_date',
  'e_score',
  'i_score',
  'f_score',
  'primary_state',
  'overlays',
  'created_at',
];

const ASSIGNMENT_ATTRS = [
  'id',
  'experiment_key',
  'enrollment_id',
  'variant',
  'assignment_hash',
  'assigned_at',
];

const ASSET_ATTRS = [
  'id',
  'asset_type',
  'source_system',
  'source_id',
  'title',
  'summary',
  'url',
  'topic_tags',
  'affinity_tags',
  'journey_stage_tags',
  'audience_tags',
  'cta_type',
  'priority',
  'proof_type',
  'allowed_channels',
  'published_at',
  'starts_at',
  'expires_at',
  'active',
  'metadata',
  'synced_at',
  'created_at',
  'updated_at',
];

const CASES: Array<{
  name: string;
  model: typeof ExplorerJourneyProfile | any;
  table: string;
  attrs: string[];
  pk: string;
}> = [
  {
    name: 'ExplorerJourneyProfile',
    model: ExplorerJourneyProfile,
    table: 'explorer_journey_profiles',
    attrs: PROFILE_ATTRS,
    pk: 'enrollment_id',
  },
  {
    name: 'ExplorerJourneyDecision',
    model: ExplorerJourneyDecision,
    table: 'explorer_journey_decisions',
    attrs: DECISION_ATTRS,
    pk: 'id',
  },
  {
    name: 'ExplorerScoreSnapshot',
    model: ExplorerScoreSnapshot,
    table: 'explorer_score_snapshots',
    attrs: SNAPSHOT_ATTRS,
    pk: 'id',
  },
  {
    name: 'ExplorerExperimentAssignment',
    model: ExplorerExperimentAssignment,
    table: 'explorer_experiment_assignments',
    attrs: ASSIGNMENT_ATTRS,
    pk: 'id',
  },
  {
    name: 'ExplorerContentAsset',
    model: ExplorerContentAsset,
    table: 'explorer_content_assets',
    attrs: ASSET_ATTRS,
    pk: 'id',
  },
];

describe('Explorer Growth models — table + attribute contract', () => {
  it.each(CASES)('$name maps to $table', ({ model, table }) => {
    expect(model.getTableName()).toBe(table);
  });

  it.each(CASES)('$name exposes exactly its documented attributes', ({ model, attrs }) => {
    expect(Object.keys(model.getAttributes()).sort()).toEqual([...attrs].sort());
  });

  it.each(CASES)('$name has primary key $pk', ({ model, pk }) => {
    const pks = Object.entries(model.getAttributes())
      .filter(([, def]) => (def as { primaryKey?: boolean }).primaryKey)
      .map(([name]) => name);
    expect(pks).toEqual([pk]);
  });

  it.each(CASES)('$name uses timestamps:false (repo convention)', ({ model }) => {
    expect(model.options.timestamps).toBe(false);
  });
});

describe('ExplorerJourneyProfile — one profile per learner', () => {
  // The PK being enrollment_id rather than a synthetic id is the structural
  // guarantee against duplicate profiles. If someone "helpfully" adds an `id`
  // PK later, duplicates become possible and this fails.
  it('is keyed on enrollment_id, not a synthetic id', () => {
    const attrs = ExplorerJourneyProfile.getAttributes();
    expect(attrs).not.toHaveProperty('id');
    expect((attrs.enrollment_id as { primaryKey?: boolean }).primaryKey).toBe(true);
  });

  it('allows a null lead_id — an unresolved bridge is reportable, not fatal', () => {
    expect((ExplorerJourneyProfile.getAttributes().lead_id as { allowNull?: boolean }).allowNull)
      .toBe(true);
  });

  it('defaults to NEW_EXPLORER with no overlays and zeroed scores', () => {
    const a = ExplorerJourneyProfile.getAttributes() as Record<string, { defaultValue?: unknown }>;
    expect(a.primary_state.defaultValue).toBe('NEW_EXPLORER');
    expect(a.overlays.defaultValue).toEqual([]);
    expect(a.e_score.defaultValue).toBe(0);
    expect(a.i_score.defaultValue).toBe(0);
    expect(a.f_score.defaultValue).toBe(0);
  });
});

describe('ExplorerJourneyDecision — audit invariants', () => {
  it('defaults executed to false so observe/shadow cannot record a send by omission', () => {
    const a = ExplorerJourneyDecision.getAttributes() as Record<string, { defaultValue?: unknown }>;
    expect(a.executed.defaultValue).toBe(false);
    expect(a.ai_involved.defaultValue).toBe(false);
  });

  it('requires a reason and a ruleset_version on every row', () => {
    const a = ExplorerJourneyDecision.getAttributes() as Record<string, { allowNull?: boolean }>;
    expect(a.reason.allowNull).toBe(false);
    expect(a.ruleset_version.allowNull).toBe(false);
  });

  it('allows a null selected_action — WAIT is a decision, not a missing row', () => {
    const a = ExplorerJourneyDecision.getAttributes() as Record<string, { allowNull?: boolean }>;
    expect(a.selected_action.allowNull).toBe(true);
  });

  it('stores decision_date as a date, not a timestamp', () => {
    // The uniqueness guarantee is per CALENDAR DAY. A timestamptz would make
    // (enrollment_id, decision_date) unique-per-instant, i.e. no guarantee at all.
    const def = ExplorerJourneyDecision.getAttributes().decision_date as { type: unknown };
    expect(String(def.type)).toMatch(/DATEONLY|DATE$/);
  });
});

describe('ExplorerContentAsset — registry defaults', () => {
  it('defaults to active, email-only, priority 50', () => {
    const a = ExplorerContentAsset.getAttributes() as Record<string, { defaultValue?: unknown }>;
    expect(a.active.defaultValue).toBe(true);
    expect(a.allowed_channels.defaultValue).toEqual(['email']);
    expect(a.priority.defaultValue).toBe(50);
  });

  it('allows a null source_id so human-seeded rows are representable', () => {
    expect((ExplorerContentAsset.getAttributes().source_id as { allowNull?: boolean }).allowNull)
      .toBe(true);
  });
});

describe('models barrel', () => {
  it('exports all five Explorer Growth models', async () => {
    const models = await import('../index');
    for (const { name } of CASES) {
      expect(models).toHaveProperty(name);
    }
  });

  it('wires the profile associations, including the lead bridge', async () => {
    await import('../index');
    expect(ExplorerJourneyProfile.associations).toHaveProperty('enrollment');
    expect(ExplorerJourneyProfile.associations).toHaveProperty('lead');
  });
});
