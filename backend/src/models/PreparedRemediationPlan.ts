/**
 * PreparedRemediationPlan — Phase 12 staged remediation. The
 * autonomousRemediationPreparer emits these (status='draft'); operators
 * approve (status='approved'); the existing ui_fix_adaptive prompt flow
 * then issues the prompt and stamps applied_at. Phase 12 NEVER auto-
 * executes — that's Phase 13+.
 *
 * Status enum is deliberately small: 'draft' | 'approved' | 'rejected' |
 * 'rolled_back'. There is no 'applied' status because the lifecycle
 * jumps from 'approved' → applied_at-stamped via the existing flow,
 * and rolled_back replaces approved when the operator clicks Rollback.
 *
 * Phase 12 §B.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type PreparedRemediationPlanStatus = 'draft' | 'approved' | 'rejected' | 'rolled_back';

interface Attrs {
  id?: string;
  project_id: string;
  capability_id: string;
  cluster_signature: string;
  /** Full plan body — prompt target, adaptive context, sequencing, rollback. */
  plan_payload: any;
  projected_outcome: any;
  confidence: number;
  status: PreparedRemediationPlanStatus;
  operator_id: string | null;
  decided_at: Date | null;
  /** Stamped by the prompt-issuance flow, NOT by operator approval. */
  applied_at: Date | null;
  // Phase 13 — supervised autonomous decision approval. auto_executed_at is
  // stamped by autonomyDecisionExecutor when all gates clear and the plan is
  // auto-approved (status flips to 'approved' without operator click). The
  // existing ui_fix_adaptive flow is what mutates user-facing state — Phase 13
  // just opens that gate. provenance is the lineage marker so audit always
  // knows which lane (auto_approved | operator_approved | pinned) green-lit
  // the plan.
  auto_executed_at: Date | null;
  execution_confidence: number | null;
  rollback_ready: boolean | null;
  provenance: 'auto_approved' | 'operator_approved' | 'pinned' | null;
  // Phase 14 — autonomous handoff + closed-loop verification.
  // direct_executed_at is stamped by autonomousHandoffEngine (NOT the
  // existing prompt-issuance flow) when the handoff fires. The actual
  // mutation lane stays unchanged: human runs Claude Code, pastes
  // validation report, recordPhase10_5Outcomes fires, the verification
  // listener flips this status. 'verification_timeout' is distinct from
  // 'failed' — we don't have evidence of regression, just no validation
  // report within the 6h window.
  direct_executed_at: Date | null;
  execution_verification_status: 'pending' | 'verified' | 'failed' | 'verification_timeout' | null;
  created_at?: Date;
}

class PreparedRemediationPlan extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare capability_id: string;
  declare cluster_signature: string;
  declare plan_payload: any;
  declare projected_outcome: any;
  declare confidence: number;
  declare status: PreparedRemediationPlanStatus;
  declare operator_id: string | null;
  declare decided_at: Date | null;
  declare applied_at: Date | null;
  declare auto_executed_at: Date | null;
  declare execution_confidence: number | null;
  declare rollback_ready: boolean | null;
  declare provenance: 'auto_approved' | 'operator_approved' | 'pinned' | null;
  declare direct_executed_at: Date | null;
  declare execution_verification_status: 'pending' | 'verified' | 'failed' | 'verification_timeout' | null;
  declare created_at: Date;
}

PreparedRemediationPlan.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    capability_id: { type: DataTypes.UUID, allowNull: false },
    cluster_signature: { type: DataTypes.STRING(120), allowNull: false },
    plan_payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    projected_outcome: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    confidence: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'draft' },
    operator_id: { type: DataTypes.STRING(64), allowNull: true },
    decided_at: { type: DataTypes.DATE, allowNull: true },
    applied_at: { type: DataTypes.DATE, allowNull: true },
    // Phase 13 additive nullable columns — see Attrs comment.
    auto_executed_at: { type: DataTypes.DATE, allowNull: true },
    execution_confidence: { type: DataTypes.INTEGER, allowNull: true },
    rollback_ready: { type: DataTypes.BOOLEAN, allowNull: true },
    provenance: { type: DataTypes.STRING(20), allowNull: true },
    // Phase 14 additive nullable columns — see Attrs comment.
    direct_executed_at: { type: DataTypes.DATE, allowNull: true },
    execution_verification_status: { type: DataTypes.STRING(25), allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'prepared_remediation_plans',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'status'] },
      // Explicit name: the auto-generated name exceeds Postgres's 63-char limit
      // and gets truncated on disk, so sync({ alter: true }) never finds it and
      // re-CREATE fails every boot. Pinned to the existing 63-char index name.
      {
        name: 'prepared_remediation_plans_project_id_capability_id_cluster_sig',
        fields: ['project_id', 'capability_id', 'cluster_signature', 'status'],
      },
    ],
  }
);

export default PreparedRemediationPlan;
