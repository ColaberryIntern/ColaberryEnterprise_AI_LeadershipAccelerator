import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class ArchitectSession extends Model {
  declare id: string;
  declare project_id: string;
  declare conversation_state: Record<string, any>;
  declare status: string;
  declare created_bp_id: string | null;
  declare generated_prompt: Record<string, any> | null;
}

ArchitectSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    conversation_state: { type: DataTypes.JSONB, defaultValue: {} },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    created_bp_id: { type: DataTypes.UUID, allowNull: true },
    generated_prompt: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'architect_sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['status'] },
    ],
  }
);

export default ArchitectSession;
