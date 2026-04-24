import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type SkoolEngagementType = 'like' | 'reply' | 'dm';

interface SkoolEngagementAttributes {
  id?: string;
  response_id: string;
  engagement_type?: SkoolEngagementType;
  count?: number;
  checked_at?: Date;
  created_at?: Date;
}

class SkoolEngagement extends Model<SkoolEngagementAttributes> implements SkoolEngagementAttributes {
  declare id: string;
  declare response_id: string;
  declare engagement_type: SkoolEngagementType;
  declare count: number;
  declare checked_at: Date;
  declare created_at: Date;
}

SkoolEngagement.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    response_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'skool_responses', key: 'id' },
    },
    engagement_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    checked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'skool_engagements',
    timestamps: false,
  }
);

export default SkoolEngagement;
