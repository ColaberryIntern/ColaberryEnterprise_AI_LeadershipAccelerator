/** Decision — the Decision Engine record. Every recommendation can become a
 *  Decision with a lifecycle (proposed → reviewed → approved/rejected →
 *  implemented → measured) and full traceability: reason, evidence, alternatives,
 *  expected vs actual outcome, lessons. This is organizational intelligence. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class Decision extends Model {
  declare id: string;
  declare title: string;
  declare domain: string;
  declare reason: string | null;
  declare evidence: any;          // node/edge references + rationale
  declare alternatives: any;      // string[]
  declare expected_outcome: string | null;
  declare actual_outcome: string | null;
  declare lessons: string | null;
  declare status: string;         // proposed | reviewed | approved | rejected | implemented | measured
  declare source_rec_key: string | null;
  declare decided_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Decision.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  title: { type: DataTypes.STRING(400), allowNull: false },
  domain: { type: DataTypes.STRING(40), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  alternatives: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  expected_outcome: { type: DataTypes.STRING(500), allowNull: true },
  actual_outcome: { type: DataTypes.STRING(500), allowNull: true },
  lessons: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'proposed' },
  source_rec_key: { type: DataTypes.STRING(120), allowNull: true },
  decided_by: { type: DataTypes.STRING(120), allowNull: true },
}, { sequelize, modelName: 'Decision', tableName: 'decisions', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export default Decision;
