/** OpsRecommendation — a Director's recommendation, persisted as trackable work
 *  in the Operations Center Work Queue. Upserted by `rec_key` on each home load
 *  (content refreshes; status is preserved). Created by ensureOpsCenterSchema. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class OpsRecommendation extends Model {
  declare id: string;
  declare rec_key: string;
  declare domain: string;
  declare title: string;
  declare why: string | null;
  declare evidence: any;
  declare impact: string | null;
  declare confidence: number;
  declare action_type: string;
  declare severity: string;
  declare status: string;       // open | approved | rejected | assigned | done
  declare assigned_to: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

OpsRecommendation.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  rec_key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  domain: { type: DataTypes.STRING(40), allowNull: false },
  title: { type: DataTypes.STRING(400), allowNull: false },
  why: { type: DataTypes.TEXT, allowNull: true },
  evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  impact: { type: DataTypes.STRING(400), allowNull: true },
  confidence: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0.5 },
  action_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
  severity: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'medium' },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
  assigned_to: { type: DataTypes.STRING(255), allowNull: true },
}, { sequelize, modelName: 'OpsRecommendation', tableName: 'ops_recommendations', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export default OpsRecommendation;
