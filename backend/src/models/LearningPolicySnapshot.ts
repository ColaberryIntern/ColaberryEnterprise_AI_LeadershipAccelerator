/**
 * LearningPolicySnapshot — append-only timeline of orchestration policy
 * snapshots. One row per material policy change so the replay UI can
 * walk how the system adapted over time.
 *
 * Phase 10 §14.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  project_id: string;            // 'global' allowed for federation-wide snapshots
  /** Reason for this snapshot (e.g. "outcome.resolved", "policy.manual_override"). */
  trigger: string;
  /** Full policy bag (weights, thresholds, cooldowns) at this point in time. */
  policy: any;
  /** Adaptation deltas since the previous snapshot. */
  deltas: any;
  /** Confidence the learning engine has in this policy. */
  confidence: number;
  recorded_at: Date;
  created_at?: Date;
}

class LearningPolicySnapshot extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare trigger: string;
  declare policy: any;
  declare deltas: any;
  declare confidence: number;
  declare recorded_at: Date;
  declare created_at: Date;
}

LearningPolicySnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.STRING(64), allowNull: false },
    trigger: { type: DataTypes.STRING(64), allowNull: false },
    policy: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    deltas: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    confidence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 50 },
    recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'learning_policy_snapshots',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'recorded_at'] },
      { fields: ['trigger'] },
    ],
  }
);

export default LearningPolicySnapshot;
