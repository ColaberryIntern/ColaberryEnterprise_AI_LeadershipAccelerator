import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface InboxVipAttributes {
  id?: string;
  email_address: string;
  name?: string | null;
  relationship?: string;
  priority?: number;
  added_by?: string;
  created_at?: Date;
}

class InboxVip extends Model<InboxVipAttributes> implements InboxVipAttributes {
  declare id: string;
  declare email_address: string;
  declare name: string | null;
  declare relationship: string;
  declare priority: number;
  declare added_by: string;
  declare created_at: Date;
}

InboxVip.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email_address: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    relationship: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'business',
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
    },
    added_by: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'user',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'inbox_vips',
    timestamps: false,
  }
);

export default InboxVip;
