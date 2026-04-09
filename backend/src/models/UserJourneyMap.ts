import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface JourneyMapStage {
  id: string;
  name: string;
  description?: string;
  touchpoints?: string[];
  goals?: string[];
  pain_points?: string[];
  order: number;
}

export interface UserJourneyMapAttributes {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  stages: JourneyMapStage[];
  status?: string;
  created_by?: string;
  metadata?: Record<string, any>;
}

class UserJourneyMap extends Model<UserJourneyMapAttributes> implements UserJourneyMapAttributes {
  declare id: string;
  declare project_id: string;
  declare name: string;
  declare description: string;
  declare stages: JourneyMapStage[];
  declare status: string;
  declare created_by: string;
  declare metadata: Record<string, any>;
}

UserJourneyMap.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    stages: { type: DataTypes.JSONB, defaultValue: [] },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    created_by: { type: DataTypes.STRING(255), allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'user_journey_maps',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'name'], unique: true },
    ],
  }
);

export default UserJourneyMap;
