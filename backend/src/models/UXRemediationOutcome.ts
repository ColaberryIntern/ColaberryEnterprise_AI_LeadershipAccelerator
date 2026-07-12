/**
 * UXRemediationOutcome — observed outcome of a UX remediation cycle.
 *
 * Distinct from RemediationOutcome (Phase 10) because RemediationOutcome.incident_id
 * is NOT NULL with FK semantics to CognitiveIncident. UX clusters do not map 1:1
 * to incidents — a "navigation cluster on /dashboard" is not an abstract
 * orchestration incident. So UX gets its own outcome table tuned to UX deltas.
 *
 * One row per validate-build that resolved at least one in_progress UI feedback
 * row. Powers regressionProneFixDetector + remediationEffectivenessAnalyzer.
 *
 * Phase 10.5 §C.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  project_id: string;
  capability_id: string;
  step_key: string | null;
  /** Readable identity, e.g. "hierarchy:capId:/dashboard". Indexed. */
  cluster_signature: string;
  cluster_type: string;
  issues_resolved_count: number;
  issues_regressed_count: number;
  cognition_delta: number | null;
  ux_debt_delta: number | null;
  behavioral_delta: number | null;
  friction_delta: number | null;
  before_screenshot_path: string | null;
  after_screenshot_path: string | null;
  validation_session_id: string | null;
  observed_at: Date;
  // Phase 11 — closed-loop additions. semantic_regions is persisted at write
  // time so replay is deterministic across re-renders (re-running analyzers
  // on the latest DOMSnapshot would shift bboxes after the user re-fixes
  // the page). prompt_target_used + pre_pressure_tier are strategy-axes
  // for remediationStrategyLearner; both nullable so legacy rows continue.
  semantic_regions: any | null;
  prompt_target_used: string | null;
  pre_pressure_tier: string | null;
  created_at?: Date;
}

class UXRemediationOutcome extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare capability_id: string;
  declare step_key: string | null;
  declare cluster_signature: string;
  declare cluster_type: string;
  declare issues_resolved_count: number;
  declare issues_regressed_count: number;
  declare cognition_delta: number | null;
  declare ux_debt_delta: number | null;
  declare behavioral_delta: number | null;
  declare friction_delta: number | null;
  declare before_screenshot_path: string | null;
  declare after_screenshot_path: string | null;
  declare validation_session_id: string | null;
  declare observed_at: Date;
  declare semantic_regions: any | null;
  declare prompt_target_used: string | null;
  declare pre_pressure_tier: string | null;
  declare created_at: Date;
}

UXRemediationOutcome.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    capability_id: { type: DataTypes.UUID, allowNull: false },
    step_key: { type: DataTypes.STRING(40), allowNull: true },
    cluster_signature: { type: DataTypes.STRING(120), allowNull: false },
    cluster_type: { type: DataTypes.STRING(40), allowNull: false },
    issues_resolved_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    issues_regressed_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    cognition_delta: { type: DataTypes.FLOAT, allowNull: true },
    ux_debt_delta: { type: DataTypes.FLOAT, allowNull: true },
    behavioral_delta: { type: DataTypes.FLOAT, allowNull: true },
    friction_delta: { type: DataTypes.FLOAT, allowNull: true },
    before_screenshot_path: { type: DataTypes.STRING(500), allowNull: true },
    after_screenshot_path: { type: DataTypes.STRING(500), allowNull: true },
    validation_session_id: { type: DataTypes.UUID, allowNull: true },
    observed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // Phase 11 additive columns. JSONB for the full SemanticRegionInput[]
    // shape; STRING for the two strategy axes.
    semantic_regions: { type: DataTypes.JSONB, allowNull: true },
    prompt_target_used: { type: DataTypes.STRING(40), allowNull: true },
    pre_pressure_tier: { type: DataTypes.STRING(10), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'ux_remediation_outcomes',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['capability_id'] },
      { fields: ['cluster_signature'] },
      { fields: ['cluster_type'] },
      // Hot path: regressionProneFixDetector queries by (project, signature, recent).
      // Explicit name: the auto-generated name
      // (ux_remediation_outcomes_project_id_cluster_signature_observed_at) is 64
      // chars, 1 over Postgres's 63-char identifier limit, so Postgres truncated it
      // on creation. Sequelize then looked for the full 64-char name on every
      // sync({ alter: true }), never found it, and tried to re-CREATE it — failing
      // with "already exists" and aborting auto-migration each boot. Pinning the
      // name to the existing (truncated) 63-char index makes sync find it. No DB
      // migration needed; the name already matches what is on disk in every env.
      {
        name: 'ux_remediation_outcomes_project_id_cluster_signature_observed_a',
        fields: ['project_id', 'cluster_signature', 'observed_at'],
      },
    ],
  }
);

export default UXRemediationOutcome;
