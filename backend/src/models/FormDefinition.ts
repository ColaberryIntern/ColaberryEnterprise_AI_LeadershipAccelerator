import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface FormDefinitionAttributes {
  id: string;
  entry_point_id: string;
  field_map: Record<string, string>;
  required_fields: string[];
  version: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class FormDefinition extends Model<FormDefinitionAttributes> implements FormDefinitionAttributes {
  declare id: string;
  declare entry_point_id: string;
  declare field_map: Record<string, string>;
  declare required_fields: string[];
  declare version: number;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

FormDefinition.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entry_point_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    field_map: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    required_fields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['email'],
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'form_definitions',
    timestamps: false,
    indexes: [
      { fields: ['entry_point_id', 'is_active'], name: 'idx_form_defs_entry_active' },
    ],
  }
);

export default FormDefinition;
