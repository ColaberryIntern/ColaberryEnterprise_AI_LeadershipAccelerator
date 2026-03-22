import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface VerificationLogAttributes {
  id?: string;
  project_id: string;
  requirement_id: string;
  status: string;
  confidence: number;
  notes?: string;
  evidence?: Record<string, any>;
  created_at?: Date;
}

class VerificationLog extends Model<VerificationLogAttributes> implements VerificationLogAttributes {
  declare id: string;
  declare project_id: string;
  declare requirement_id: string;
  declare status: string;
  declare confidence: number;
  declare notes: string;
  declare evidence: Record<string, any>;
  declare created_at: Date;
}

VerificationLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    project_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    },
    requirement_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'requirements_maps', key: 'id' },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    evidence: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'verification_logs',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['requirement_id'] },
    ],
  }
);

export default VerificationLog;
