import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface GitHubConnectionAttributes {
  id?: string;
  enrollment_id: string;
  repo_url?: string;
  repo_owner?: string;
  repo_name?: string;
  access_token_encrypted?: string;
  last_checked_at?: Date;
  status_json?: any;
  file_tree_json?: any;
  last_sync_at?: Date;
  commit_summary_json?: any;
  repo_language?: string;
  file_count?: number;
  created_at?: Date;
}

class GitHubConnection extends Model<GitHubConnectionAttributes> implements GitHubConnectionAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare repo_url: string;
  declare repo_owner: string;
  declare repo_name: string;
  declare access_token_encrypted: string;
  declare last_checked_at: Date;
  declare status_json: any;
  declare file_tree_json: any;
  declare last_sync_at: Date;
  declare commit_summary_json: any;
  declare repo_language: string;
  declare file_count: number;
  declare created_at: Date;
}

GitHubConnection.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'enrollments', key: 'id' },
    },
    repo_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    repo_owner: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    repo_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    access_token_encrypted: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    file_tree_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    last_sync_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    commit_summary_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    repo_language: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    file_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'github_connections',
    timestamps: false,
  }
);

export default GitHubConnection;
