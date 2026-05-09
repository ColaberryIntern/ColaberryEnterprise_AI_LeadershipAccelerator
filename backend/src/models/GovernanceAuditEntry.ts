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
  | 'causality_lineage_updated'
  // Phase 17 — adaptive validator intelligence + causal governance evolution.
  | 'validator_reliability_shifted'
  | 'validator_specialization_detected'
  | 'validator_drift_detected'
  | 'causal_forecast_generated'
  | 'ancestry_rollback_recommended'
  | 'recovery_chain_generated'
  | 'governance_calibration_updated'
  // Phase 18 — operator-calibrated governance evolution.
  | 'governance_calibration_proposed'
  | 'governance_calibration_approved'
  | 'governance_calibration_rejected'
  | 'specialization_routing_updated'
  | 'forecast_calibration_updated'
  | 'recovery_step_executed'
  | 'governance_topology_changed'
  // Phase 19 — federated organizational governance intelligence.
  | 'federation_consent_updated'
  | 'archetype_federated'
  | 'calibration_impact_replayed'
  | 'governance_drift_detected'
  | 'federation_visibility_updated'
  // Phase 20 — bounded federated learning refinement.
  | 'federated_effectiveness_updated'
  | 'archetype_reliability_evolved'
  | 'federation_drift_detected'
  | 'federation_visibility_replayed'
  | 'federation_diffusion_replayed'
  | 'federation_policy_proposed'
  | 'federation_policy_approved'
  | 'federation_policy_rejected'
  // Phase 21 — distributed organizational cognition runtime.
  | 'distributed_broker_connected'
  | 'distributed_broker_disconnected'
  | 'distributed_broker_isolation_triggered'
  | 'distributed_partition_recovered'
  | 'distributed_replay_restored'
  | 'distributed_synchronization_degraded'
  | 'distributed_topology_changed'
  | 'distributed_recovery_step_executed'
  // Phase 22 — within-partition cognition topology orchestration.
  | 'topology_fragmented'
  | 'topology_stabilized'
  | 'topology_propagation_detected'
  | 'topology_dependency_degraded'
  | 'topology_recovery_orchestrated'
  | 'topology_continuity_amplified'
  | 'topology_forecast_updated'
  | 'topology_dependency_edge_recorded'
  // Phase 23 — bounded operational execution substrate (instrumentation + governance).
  | 'execution_worker_started'
  | 'execution_worker_completed'
  | 'execution_worker_failed'
  | 'execution_worker_interrupted'
  | 'execution_rollback_orchestrated'
  | 'execution_isolated'
  | 'execution_degraded'
  | 'execution_governance_decision'
  // Phase 24 — deterministic operational cognition compression.
  | 'cognitive_narrative_generated'
  | 'cognitive_replay_compressed'
  | 'cognitive_rollback_explained'
  | 'cognitive_continuity_explained'
  | 'cognitive_topology_explained'
  | 'cognitive_guidance_generated'
  | 'cognitive_load_observed'
  // Phase 25 — deterministic counterfactual operational projection.
  | 'experimentation_sandbox_started'
  | 'experimentation_sandbox_completed'
  | 'experimentation_rollback_simulated'
  | 'experimentation_propagation_previewed'
  | 'experimentation_rehearsal_executed'
  | 'experimentation_isolated'
  | 'experimentation_replayed'
  | 'experimentation_governance_decision'
  // Phase 26 — bounded live operational rehearsal substrate.
  | 'live_sandbox_runtime_started'
  | 'live_sandbox_runtime_completed'
  | 'live_sandbox_runtime_expired'
  | 'live_sandbox_rollback_rehearsed'
  | 'live_sandbox_preview_generated'
  | 'live_sandbox_isolation_verified'
  | 'live_sandbox_replay_generated'
  // Phase 27 — bounded delegated operational execution substrate.
  | 'delegation_issued'
  | 'delegation_executed'
  | 'delegation_expired'
  | 'delegation_rejected'
  | 'delegation_rollback_protected'
  | 'delegation_containment_verified'
  | 'delegation_replayed'
  // Phase 28 — execution resource governance + operational economics.
  | 'quota_exhausted'
  | 'quota_governance_changed'
  | 'pressure_classified'
  | 'rollback_forecast_generated'
  | 'topology_load_classified'
  | 'economics_replay_built'
  // Phase 29 — stabilization playbook intelligence + recovery governance.
  | 'recovery_archetype_set'
  | 'rollback_sequence_generated'
  | 'recovery_pressure_classified'
  | 'continuity_forecast_generated'
  | 'stabilization_replay_built'
  | 'recovery_archetype_finality_recorded'
  // Phase 30 — recovery foresight UX + stabilization decision cognition.
  | 'stabilization_decision_compared'
  | 'rollback_survivability_compared'
  | 'continuity_tradeoff_analyzed'
  | 'recovery_archaeology_replayed'
  | 'stabilization_guidance_built'
  // Phase 31 — operator cognition continuity + governance memory.
  | 'governance_memory_persisted'
  | 'stabilization_timeline_updated'
  | 'reasoning_continuity_replayed'
  | 'governance_archaeology_built'
  | 'continuity_narrative_built'
  // Phase 32 — multi-operator governance continuity + handoff cognition.
  | 'governance_handoff_persisted'
  | 'continuity_transfer_generated'
  | 'handoff_archaeology_built'
  | 'collaborative_continuity_replayed'
  | 'continuity_transfer_narrated';

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
