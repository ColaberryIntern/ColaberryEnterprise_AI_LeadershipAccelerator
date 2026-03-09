import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface DatasetRegistryAttributes {
  id?: string;
  table_name: string;
  schema_name?: string;
  column_count?: number;
  row_count?: number;
  semantic_types?: Record<string, string>;
  relationships?: Record<string, any>[];
  profile_summary?: Record<string, any>;
  status?: string;
  last_scanned?: Date;
  created_at?: Date;
  updated_at?: Date;
}

class DatasetRegistry extends Model<DatasetRegistryAttributes> implements DatasetRegistryAttributes {
  declare id: string;
  declare table_name: string;
  declare schema_name: string;
  declare column_count: number;
  declare row_count: number;
  declare semantic_types: Record<string, string>;
  declare relationships: Record<string, any>[];
  declare profile_summary: Record<string, any>;
  declare status: string;
  declare last_scanned: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

DatasetRegistry.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    table_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
    },
    schema_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'public',
    },
    column_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    row_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    semantic_types: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    relationships: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    profile_summary: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'discovered',
    },
    last_scanned: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: 'dataset_registry',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['last_scanned'] },
    ],
  }
);

export default DatasetRegistry;
