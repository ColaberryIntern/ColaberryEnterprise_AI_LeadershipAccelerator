import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type WebsiteIssueType =
  | 'ui_visibility'
  | 'broken_link'
  | 'conversion_flow'
  | 'ux_heuristic'
  | 'behavior'
  | 'recommendation';

export type WebsiteIssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type WebsiteIssueStatus = 'open' | 'auto_repaired' | 'approved' | 'rejected' | 'resolved';

interface WebsiteIssueAttributes {
  id?: string;
  agent_name: string;
  issue_type: WebsiteIssueType;
  page_url: string;
  severity: WebsiteIssueSeverity;
  confidence: number;
  description: string;
  suggested_fix?: string;
  element_selector?: string;
  details?: Record<string, any>;
  status?: WebsiteIssueStatus;
  repaired_at?: Date;
  repaired_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

class WebsiteIssue extends Model<WebsiteIssueAttributes> implements WebsiteIssueAttributes {
  declare id: string;
  declare agent_name: string;
  declare issue_type: WebsiteIssueType;
  declare page_url: string;
  declare severity: WebsiteIssueSeverity;
  declare confidence: number;
  declare description: string;
  declare suggested_fix: string;
  declare element_selector: string;
  declare details: Record<string, any>;
  declare status: WebsiteIssueStatus;
  declare repaired_at: Date;
  declare repaired_by: string;
  declare created_at: Date;
  declare updated_at: Date;
}

WebsiteIssue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    agent_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    issue_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    page_url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'medium',
    },
    confidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      defaultValue: 0.5,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    suggested_fix: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    element_selector: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'open',
    },
    repaired_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    repaired_by: {
      type: DataTypes.STRING(100),
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
    tableName: 'website_issues',
    timestamps: false,
    indexes: [
      { fields: ['status'] },
      { fields: ['issue_type'] },
      { fields: ['page_url'] },
      { fields: ['severity'] },
      { fields: ['created_at'] },
    ],
  }
);

export default WebsiteIssue;
