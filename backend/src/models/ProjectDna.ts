import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class ProjectDna extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare business_problem: string;
  declare target_user: string;
  declare industry: string;
  declare orientation: 'internal' | 'external';
  declare focus: 'revenue' | 'operational';
  declare project_types: string[];
  declare data_sources: string[];
  declare ai_components: string[];
  declare industry_track: string;
  declare created_at: Date;
  declare updated_at: Date;
}

ProjectDna.init(
  {
    id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id:    { type: DataTypes.UUID, allowNull: false, unique: true },
    business_problem: { type: DataTypes.TEXT, allowNull: false },
    target_user:      { type: DataTypes.TEXT, allowNull: false },
    industry:         { type: DataTypes.STRING(50), allowNull: false },
    orientation:      { type: DataTypes.STRING(20), allowNull: false },
    focus:            { type: DataTypes.STRING(20), allowNull: false },
    project_types:    { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    data_sources:     { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    ai_components:    { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    industry_track:   { type: DataTypes.TEXT, allowNull: false },
    created_at:       { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at:       { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'project_dna',
    timestamps: false,
  }
);

export default ProjectDna;
