import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface LeadAttributes {
  id?: number;
  name: string;
  email: string;
  company?: string;
  role?: string;
  phone?: string;
  title?: string;
  company_size?: string;
  evaluating_90_days?: boolean;
  lead_score?: number;
  last_contacted_at?: Date;
  utm_source?: string;
  utm_campaign?: string;
  page_url?: string;
  interest_area?: string;
  message?: string;
  source?: string;
  form_type?: string;
  status?: string;
  interest_level?: string;
  notes?: string;
  assigned_admin?: string;
  pipeline_stage?: string;
  consent_contact?: boolean;
  lead_source_type?: string;
  industry?: string;
  annual_revenue?: string;
  employee_count?: number;
  technology_stack?: string[];
  linkedin_url?: string;
  apollo_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

class Lead extends Model<LeadAttributes> implements LeadAttributes {
  declare id: number;
  declare name: string;
  declare email: string;
  declare company: string;
  declare role: string;
  declare phone: string;
  declare title: string;
  declare company_size: string;
  declare evaluating_90_days: boolean;
  declare lead_score: number;
  declare last_contacted_at: Date;
  declare utm_source: string;
  declare utm_campaign: string;
  declare page_url: string;
  declare interest_area: string;
  declare message: string;
  declare source: string;
  declare form_type: string;
  declare status: string;
  declare interest_level: string;
  declare notes: string;
  declare assigned_admin: string;
  declare pipeline_stage: string;
  declare consent_contact: boolean;
  declare lead_source_type: string;
  declare industry: string;
  declare annual_revenue: string;
  declare employee_count: number;
  declare technology_stack: string[];
  declare linkedin_url: string;
  declare apollo_id: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Lead.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    company_size: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    evaluating_90_days: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    lead_score: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    last_contacted_at: {
      type: DataTypes.DATE,
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
    page_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    interest_area: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'website',
    },
    form_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'contact',
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'new',
    },
    interest_level: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    assigned_admin: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    pipeline_stage: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'new_lead',
    },
    consent_contact: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    lead_source_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'warm',
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    annual_revenue: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    employee_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    technology_stack: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    linkedin_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    apollo_id: {
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
    tableName: 'leads',
    timestamps: false,
  }
);

export default Lead;
