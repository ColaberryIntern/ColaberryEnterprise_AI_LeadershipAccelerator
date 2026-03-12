import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OpenclawSessionStatus = 'active' | 'idle' | 'captcha_blocked' | 'rate_limited' | 'crashed' | 'closed';

interface OpenclawSessionAttributes {
  id?: string;
  platform: string;
  session_status?: OpenclawSessionStatus;
  browser_context_id?: string;
  cookies_snapshot?: Record<string, any>;
  last_activity_at?: Date;
  pages_visited?: number;
  actions_performed?: number;
  errors?: any;
  health_score?: number;
  screenshot_path?: string;
  created_at?: Date;
  updated_at?: Date;
}

class OpenclawSession extends Model<OpenclawSessionAttributes> implements OpenclawSessionAttributes {
  declare id: string;
  declare platform: string;
  declare session_status: OpenclawSessionStatus;
  declare browser_context_id: string;
  declare cookies_snapshot: Record<string, any>;
  declare last_activity_at: Date;
  declare pages_visited: number;
  declare actions_performed: number;
  declare errors: any;
  declare health_score: number;
  declare screenshot_path: string;
  declare created_at: Date;
  declare updated_at: Date;
}

OpenclawSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    session_status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'idle',
    },
    browser_context_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    cookies_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    last_activity_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pages_visited: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    actions_performed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    errors: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    health_score: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      defaultValue: 1.0,
    },
    screenshot_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
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
    tableName: 'openclaw_sessions',
    timestamps: false,
    indexes: [
      { fields: ['platform'] },
      { fields: ['session_status'] },
      { fields: ['last_activity_at'] },
    ],
  }
);

export default OpenclawSession;
