import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LandingPageAttributes {
  id?: string;
  name: string;
  path: string;
  is_marketing_enabled?: boolean;
  conversion_event?: string;
  created_at?: Date;
  updated_at?: Date;
}

class LandingPage extends Model<LandingPageAttributes> implements LandingPageAttributes {
  declare id: string;
  declare name: string;
  declare path: string;
  declare is_marketing_enabled: boolean;
  declare conversion_event: string;
  declare created_at: Date;
  declare updated_at: Date;
}

LandingPage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    path: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    is_marketing_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    conversion_event: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'landing_pages',
    timestamps: true,
    underscored: true,
  },
);

export default LandingPage;
