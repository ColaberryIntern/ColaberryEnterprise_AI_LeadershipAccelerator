import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type PreviewStackStatus =
  | 'provisioning'
  | 'running'
  | 'stopped'
  | 'failed'
  | 'tearing_down'
  | 'archived';

class PreviewStack extends Model {
  declare id: string;
  declare project_id: string;
  declare slug: string;
  declare status: PreviewStackStatus;
  declare stack_path: string | null;
  declare frontend_port: number | null;
  declare backend_port: number | null;
  declare db_volume: string | null;
  declare repo_url: string | null;
  declare repo_commit_sha: string | null;
  declare last_accessed_at: Date | null;
  declare last_started_at: Date | null;
  declare last_stopped_at: Date | null;
  declare failure_reason: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PreviewStack.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('provisioning', 'running', 'stopped', 'failed', 'tearing_down', 'archived'),
      allowNull: false,
      defaultValue: 'provisioning',
    },
    stack_path: { type: DataTypes.STRING(500), allowNull: true },
    frontend_port: { type: DataTypes.INTEGER, allowNull: true },
    backend_port: { type: DataTypes.INTEGER, allowNull: true },
    db_volume: { type: DataTypes.STRING(200), allowNull: true },
    repo_url: { type: DataTypes.STRING(500), allowNull: true },
    repo_commit_sha: { type: DataTypes.STRING(64), allowNull: true },
    last_accessed_at: { type: DataTypes.DATE, allowNull: true },
    last_started_at: { type: DataTypes.DATE, allowNull: true },
    last_stopped_at: { type: DataTypes.DATE, allowNull: true },
    failure_reason: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'preview_stacks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['project_id'], unique: true },
      { fields: ['status'] },
      { fields: ['last_accessed_at'] },
    ],
  }
);

export default PreviewStack;
