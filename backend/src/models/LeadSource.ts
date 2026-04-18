import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LeadSourceAttributes {
  id: string;
  slug: string;
  name: string;
  domain: string;
  api_key_hash?: string | null;
  hmac_secret?: string | null;
  hmac_secret_prev?: string | null;
  rate_limit?: number | null;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class LeadSource extends Model<LeadSourceAttributes> implements LeadSourceAttributes {
  declare id: string;
  declare slug: string;
  declare name: string;
  declare domain: string;
  declare api_key_hash: string | null;
  declare hmac_secret: string | null;
  declare hmac_secret_prev: string | null;
  declare rate_limit: number | null;
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

LeadSource.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    domain: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    api_key_hash: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hmac_secret: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    hmac_secret_prev: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    rate_limit: {
      type: DataTypes.INTEGER,
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
    tableName: 'lead_sources',
    timestamps: false,
    indexes: [
      { fields: ['slug'], unique: true, name: 'lead_sources_slug_unique' },
      { fields: ['is_active'], name: 'idx_lead_sources_active' },
    ],
  }
);

export default LeadSource;
