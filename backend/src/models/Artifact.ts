import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type ArtifactType = 'build' | 'showcase';
export type ArtifactStatus = 'not_started' | 'in_progress' | 'submitted' | 'reviewed';

export interface ArtifactAttributes {
  id?: string;
  project_id: string;
  type: ArtifactType;
  week_number?: number | null;
  url?: string | null;
  status?: ArtifactStatus;
  portfolio_slot?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class Artifact extends Model<ArtifactAttributes> implements ArtifactAttributes {
  declare id: string;
  declare project_id: string;
  declare type: ArtifactType;
  declare week_number: number | null;
  declare url: string | null;
  declare status: ArtifactStatus;
  declare portfolio_slot: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Artifact.init(
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
    type: {
      type: DataTypes.ENUM('build', 'showcase'),
      allowNull: false,
    },
    week_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    url: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('not_started', 'in_progress', 'submitted', 'reviewed'),
      allowNull: false,
      defaultValue: 'not_started',
    },
    portfolio_slot: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'artifacts',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { unique: true, fields: ['project_id', 'week_number'], name: 'uq_artifacts_project_week_build', where: { type: 'build' } },
      { fields: ['project_id'], name: 'idx_artifacts_project_id' },
    ],
  }
);

export default Artifact;
