import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface EntryPointAttributes {
  id: string;
  source_id: string;
  slug: string;
  name?: string | null;
  page?: string | null;
  form_name?: string | null;
  description?: string | null;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class EntryPoint extends Model<EntryPointAttributes> implements EntryPointAttributes {
  declare id: string;
  declare source_id: string;
  declare slug: string;
  declare name: string | null;
  declare page: string | null;
  declare form_name: string | null;
  declare description: string | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

EntryPoint.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    source_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    page: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    form_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: 'entry_points',
    timestamps: false,
    indexes: [
      { fields: ['source_id', 'slug'], unique: true, name: 'entry_points_source_slug_unique' },
      { fields: ['is_active'], name: 'idx_entry_points_active' },
    ],
  }
);

export default EntryPoint;
