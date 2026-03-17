import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface DepartmentReportAttributes {
  id?: string;
  department: string;
  report_type?: string;
  summary: string;
  metrics?: Record<string, any> | null;
  anomalies?: Record<string, any> | null;
  recommendations?: Record<string, any> | null;
  source_agent?: string | null;
  created_at?: Date;
}

class DepartmentReport extends Model<DepartmentReportAttributes> implements DepartmentReportAttributes {
  declare id: string;
  declare department: string;
  declare report_type: string;
  declare summary: string;
  declare metrics: Record<string, any> | null;
  declare anomalies: Record<string, any> | null;
  declare recommendations: Record<string, any> | null;
  declare source_agent: string | null;
  declare created_at: Date;
}

DepartmentReport.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    report_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'periodic',
      comment: 'periodic | alert | summary',
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metrics: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    anomalies: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    recommendations: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    source_agent: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'department_reports',
    timestamps: false,
    indexes: [
      { fields: ['department'] },
      { fields: ['report_type'] },
      { fields: ['created_at'] },
      { fields: ['source_agent'] },
    ],
  }
);

export default DepartmentReport;
