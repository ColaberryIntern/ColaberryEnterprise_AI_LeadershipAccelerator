import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface VariableStoreAttributes {
  id?: string;
  enrollment_id: string;
  section_id?: string;
  session_id?: string;
  artifact_id?: string;
  variable_key: string;
  variable_value?: string;
  scope: 'section' | 'session' | 'program' | 'artifact';
  created_at?: Date;
  updated_at?: Date;
}

class VariableStore extends Model<VariableStoreAttributes> implements VariableStoreAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare section_id: string;
  declare session_id: string;
  declare artifact_id: string;
  declare variable_key: string;
  declare variable_value: string;
  declare scope: 'section' | 'session' | 'program' | 'artifact';
  declare created_at: Date;
  declare updated_at: Date;
}

VariableStore.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'enrollments', key: 'id' },
    },
    section_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'section_configs', key: 'id' },
    },
    session_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'live_sessions', key: 'id' },
    },
    artifact_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'artifact_definitions', key: 'id' },
    },
    variable_key: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    variable_value: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scope: {
      type: DataTypes.ENUM('section', 'session', 'program', 'artifact'),
      allowNull: false,
      defaultValue: 'program',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'variable_store',
    timestamps: false,
    indexes: [
      {
        fields: ['enrollment_id', 'variable_key'],
      },
      {
        fields: ['enrollment_id', 'scope'],
      },
    ],
  }
);

export default VariableStore;
