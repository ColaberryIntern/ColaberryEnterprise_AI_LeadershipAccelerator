import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface StudentGithubActivityAttributes {
  id?: string;
  enrollment_id: string;
  synced_at?: Date;
  commits_last_7d?: number;
  open_prs?: number;
  total_stars?: number;
  contribution_graph_json?: Array<{ date: string; count: number }>;
  raw_repos_json?: any;
  created_at?: Date;
  updated_at?: Date;
}

class StudentGithubActivity extends Model<StudentGithubActivityAttributes> implements StudentGithubActivityAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare synced_at: Date;
  declare commits_last_7d: number;
  declare open_prs: number;
  declare total_stars: number;
  declare contribution_graph_json: Array<{ date: string; count: number }>;
  declare raw_repos_json: any;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentGithubActivity.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'enrollments', key: 'id' },
    },
    synced_at: { type: DataTypes.DATE, allowNull: true },
    commits_last_7d: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    open_prs: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    total_stars: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    contribution_graph_json: { type: DataTypes.JSONB, allowNull: true },
    raw_repos_json: { type: DataTypes.JSONB, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'student_github_activity', timestamps: false },
);

export default StudentGithubActivity;
