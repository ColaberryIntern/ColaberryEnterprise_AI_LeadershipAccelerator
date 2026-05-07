/**
 * CognitivePattern — federation registry of recurring failure / success
 * signatures across projects.
 *
 * Each pattern records:
 *   - signature: a stable hash of the structural shape (incident type +
 *     route prefix + cognition delta bucket)
 *   - occurrence count + last-seen
 *   - across how many distinct projects
 *   - successful remediations vs total attempts
 *
 * Reads from this table answer "have we seen this kind of regression
 * before, and what worked?"
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  signature: string;
  pattern_kind: string;
  description: string;
  occurrence_count: number;
  project_count: number;
  successful_remediations: number;
  attempted_remediations: number;
  last_seen_at: Date;
  /** Routes / contexts this pattern has appeared on. */
  example_routes: string[];
  /** Successful remediation summaries (what worked). */
  successful_actions: string[];
  metadata: any;
  created_at?: Date;
  updated_at?: Date;
}

class CognitivePattern extends Model<Attrs> implements Attrs {
  declare id: string;
  declare signature: string;
  declare pattern_kind: string;
  declare description: string;
  declare occurrence_count: number;
  declare project_count: number;
  declare successful_remediations: number;
  declare attempted_remediations: number;
  declare last_seen_at: Date;
  declare example_routes: string[];
  declare successful_actions: string[];
  declare metadata: any;
  declare created_at: Date;
  declare updated_at: Date;
}

CognitivePattern.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    signature: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    pattern_kind: { type: DataTypes.STRING(64), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    occurrence_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    project_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    successful_remediations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    attempted_remediations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    example_routes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    successful_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cognitive_patterns',
    timestamps: false,
    indexes: [
      { fields: ['signature'], unique: true },
      { fields: ['pattern_kind'] },
      { fields: ['last_seen_at'] },
    ],
  }
);

export default CognitivePattern;
