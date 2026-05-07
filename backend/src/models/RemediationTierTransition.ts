/**
 * RemediationTierTransition — append-only log of confidence tier shifts
 * per (project_id, cluster_signature). Used by confidenceEvolutionTracker
 * to surface durable signals like "low → moderate" that the UI can
 * celebrate or warn on.
 *
 * Why a separate small model: tier transitions are durable events worth
 * persisting forever (retention sweeps them at 180d). Value drift is
 * volatile and computed on the fly from UXRemediationOutcome — no need
 * to persist that.
 *
 * Phase 11 §I.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  project_id: string;
  cluster_signature: string;
  /** 'low' | 'moderate' | 'high' — the tier BEFORE this transition. */
  from_tier: string;
  /** 'low' | 'moderate' | 'high' — the tier AFTER this transition. */
  to_tier: string;
  /** Confidence value at the moment of transition (0-100). */
  confidence_value: number;
  /** What triggered this recompute — e.g. 'outcome_recorded', 'regression_detected'. */
  trigger: string;
  recorded_at: Date;
  created_at?: Date;
}

class RemediationTierTransition extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare cluster_signature: string;
  declare from_tier: string;
  declare to_tier: string;
  declare confidence_value: number;
  declare trigger: string;
  declare recorded_at: Date;
  declare created_at: Date;
}

RemediationTierTransition.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    cluster_signature: { type: DataTypes.STRING(120), allowNull: false },
    from_tier: { type: DataTypes.STRING(10), allowNull: false },
    to_tier: { type: DataTypes.STRING(10), allowNull: false },
    confidence_value: { type: DataTypes.INTEGER, allowNull: false },
    trigger: { type: DataTypes.STRING(40), allowNull: false },
    recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'remediation_tier_transitions',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['cluster_signature'] },
      { fields: ['project_id', 'cluster_signature', 'recorded_at'] },
    ],
  }
);

export default RemediationTierTransition;
