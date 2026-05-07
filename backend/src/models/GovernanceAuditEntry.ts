/**
 * GovernanceAuditEntry — append-only audit log for every governance-
 * relevant action. Mirrors LearningPolicySnapshot + RemediationTier-
 * Transition templates: nullable subject_id (FK-by-convention to a
 * recommendation / plan / policy snapshot), JSONB payload, operator
 * attribution, recorded_at.
 *
 * Retention: 365d (high-value durable signal — stays available longer
 * than recommendations themselves).
 *
 * Phase 12 §B.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type GovernanceAuditKind =
  | 'recommendation_created'
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'recommendation_expired'
  | 'automation_blocked'
  | 'automation_ready'
  | 'operator_override'
  | 'plan_prepared'
  | 'plan_approved'
  | 'plan_rejected'
  | 'plan_applied'
  | 'plan_rolled_back'
  | 'policy_changed'
  | 'escalation_dispatched'
  | 'override_storm_detected'
  // Phase 13 — supervised autonomous decision approval.
  | 'autonomy_execution_prepared'
  | 'autonomy_execution_approved'
  | 'autonomy_execution_blocked'
  | 'autonomy_execution_applied'
  | 'autonomy_execution_rolled_back'
  | 'autonomy_trust_changed'
  | 'autonomy_supervision_required'
  // Phase 14 — autonomous handoff + closed-loop verification.
  | 'autonomy_execution_started'
  | 'autonomy_execution_verified'
  | 'autonomy_execution_failed'
  | 'autonomy_rollback_started'
  | 'autonomy_rollback_completed'
  | 'autonomy_isolation_activated'
  | 'autonomy_self_heal_triggered'
  // Phase 15 — governed direct autonomous mutation.
  | 'mutation_envelope_created'
  | 'mutation_executed'
  | 'mutation_verified'
  | 'mutation_failed'
  | 'mutation_rolled_back'
  | 'mutation_contained'
  | 'mutation_trust_changed'
  // Phase 16 — causality replay + distributed validation.
  | 'causal_root_cause_detected'
  | 'validator_disagreement'
  | 'arbitration_completed'
  | 'stabilization_branch_isolated'
  | 'causality_lineage_updated';

interface Attrs {
  id?: string;
  project_id: string;
  kind: GovernanceAuditKind;
  /** Nullable FK by convention — recommendation_id, plan_id, or policy_snapshot_id. */
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: Date;
  created_at?: Date;
}

class GovernanceAuditEntry extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare kind: GovernanceAuditKind;
  declare subject_id: string | null;
  declare payload: any;
  declare operator_id: string | null;
  declare recorded_at: Date;
  declare created_at: Date;
}

GovernanceAuditEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    subject_id: { type: DataTypes.UUID, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    operator_id: { type: DataTypes.STRING(64), allowNull: true },
    recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'governance_audit_entries',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'kind', 'recorded_at'] },
      { fields: ['subject_id'] },
    ],
  }
);

export default GovernanceAuditEntry;
