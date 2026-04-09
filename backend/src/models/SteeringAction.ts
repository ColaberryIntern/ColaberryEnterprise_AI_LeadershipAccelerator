import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class SteeringAction extends Model {
  declare id: string;
  declare project_id: string;
  declare user_input: string;
  declare classified_intent: Record<string, any>;
  declare changes: any[];
  declare status: string;
  declare applied_at: Date;
  declare reverted_at: Date;
}

SteeringAction.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    user_input: { type: DataTypes.TEXT, allowNull: true },
    classified_intent: { type: DataTypes.JSONB, allowNull: true },
    changes: { type: DataTypes.JSONB, defaultValue: [] },
    status: { type: DataTypes.STRING(20), defaultValue: 'preview' },
    applied_at: { type: DataTypes.DATE, allowNull: true },
    reverted_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'steering_actions',
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
    ],
  }
);

export default SteeringAction;
