import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface VisitorAttributes {
  id?: string;
  fingerprint: string;
  lead_id?: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
  total_sessions: number;
  total_pageviews: number;
  ip_address?: string | null;
  user_agent?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  country?: string | null;
  city?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  referrer_domain?: string | null;
  campaign_id?: string | null;
  campaign_type?: string | null;
  platform?: string | null;
  creative?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: Date;
}

class Visitor extends Model<VisitorAttributes> implements VisitorAttributes {
  declare id: string;
  declare fingerprint: string;
  declare lead_id: number | null;
  declare first_seen_at: Date;
  declare last_seen_at: Date;
  declare total_sessions: number;
  declare total_pageviews: number;
  declare ip_address: string | null;
  declare user_agent: string | null;
  declare device_type: string | null;
  declare browser: string | null;
  declare os: string | null;
  declare country: string | null;
  declare city: string | null;
  declare utm_source: string | null;
  declare utm_campaign: string | null;
  declare utm_medium: string | null;
  declare referrer_domain: string | null;
  declare campaign_id: string | null;
  declare campaign_type: string | null;
  declare platform: string | null;
  declare creative: string | null;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
}

Visitor.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fingerprint: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    first_seen_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    total_sessions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_pageviews: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    device_type: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    browser: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    os: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING(2),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    utm_source: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    utm_campaign: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    utm_medium: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    referrer_domain: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    campaign_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    campaign_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    platform: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    creative: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'visitors',
    timestamps: false,
  }
);

export default Visitor;
