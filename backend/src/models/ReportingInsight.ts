import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type InsightType = 'anomaly' | 'pattern' | 'trend' | 'opportunity' | 'risk';
export type InsightEntityType = 'campaign' | 'lead' | 'student' | 'agent' | 'department' | 'system' | 'cohort' | 'curriculum';
export type InsightStatus = 'new' | 'acknowledged' | 'actioned' | 'dismissed';
export type AlertSeverity = 'info' | 'insight' | 'opportunity' | 'warning' | 'critical';

interface ReportingInsightAttributes {
  id?: string;
  insight_type: InsightType;
  source_agent: string;
  entity_type: InsightEntityType;
  entity_id?: string;
  department?: string;
  title: string;
  narrative?: string;
  confidence: number;
  impact: number;
  urgency: number;
  data_strength: number;
  final_score: number;
  evidence?: Record<string, any>;
  recommendations?: Record<string, any>;
  visualization_spec?: Record<string, any>;
  status?: InsightStatus;
  alert_severity?: AlertSeverity;
  created_at?: Date;
}

class ReportingInsight extends Model<ReportingInsightAttributes> implements ReportingInsightAttributes {
  declare id: string;
  declare insight_type: InsightType;
  declare source_agent: string;
  declare entity_type: InsightEntityType;
  declare entity_id: string;
  declare department: string;
  declare title: string;
  declare narrative: string;
  declare confidence: number;
  declare impact: number;
  declare urgency: number;
  declare data_strength: number;
  declare final_score: number;
  declare evidence: Record<string, any>;
  declare recommendations: Record<string, any>;
  declare visualization_spec: Record<string, any>;
  declare status: InsightStatus;
  declare alert_severity: AlertSeverity;
  declare created_at: Date;
}

ReportingInsight.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    insight_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    source_agent: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    entity_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    entity_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },
    narrative: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    impact: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    urgency: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    data_strength: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    final_score: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    evidence: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    recommendations: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    visualization_spec: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'new',
    },
    alert_severity: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'info',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'reporting_insights',
    timestamps: false,
    indexes: [
      { fields: ['insight_type'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['department'] },
      { fields: ['final_score'], name: 'reporting_insights_score_desc' },
      { fields: ['status'] },
      { fields: ['alert_severity'] },
      { fields: ['created_at'] },
    ],
  }
);

export default ReportingInsight;
