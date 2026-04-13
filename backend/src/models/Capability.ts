import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface CapabilityAttributes {
  id?: string;
  project_id: string;
  name: string;
  description?: string;
  status?: string;
  priority?: string;
  sort_order?: number;
  source?: string;
  // BPOS fields
  process_type?: string;
  autonomy_level?: string;
  confidence_score?: number;
  success_rate?: number;
  failure_rate?: number;
  approval_dependency_pct?: number;
  linked_agents?: string[];
  linked_backend_services?: string[];
  linked_frontend_components?: string[];
  strength_scores?: Record<string, number>;
  hitl_config?: Record<string, any>;
  autonomy_history?: any[];
  last_evaluated_at?: Date;
  lifecycle_status?: string;
  last_execution?: Record<string, any>;
  execution_profile?: string;
  strategy_template?: string;
  mode_override?: string;
  applicability_status?: string;
  department_id?: string;
  modes?: string[];
  frontend_route?: string;
}

class Capability extends Model<CapabilityAttributes> implements CapabilityAttributes {
  declare id: string;
  declare project_id: string;
  declare name: string;
  declare description: string;
  declare status: string;
  declare priority: string;
  declare sort_order: number;
  declare source: string;
  declare process_type: string;
  declare autonomy_level: string;
  declare confidence_score: number;
  declare success_rate: number;
  declare failure_rate: number;
  declare approval_dependency_pct: number;
  declare linked_agents: string[];
  declare linked_backend_services: string[];
  declare linked_frontend_components: string[];
  declare strength_scores: Record<string, number>;
  declare hitl_config: Record<string, any>;
  declare autonomy_history: any[];
  declare last_evaluated_at: Date;
  declare lifecycle_status: string;
  declare frontend_route: string;
}

Capability.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: { type: DataTypes.STRING(30), defaultValue: 'active' },
    priority: { type: DataTypes.STRING(20), defaultValue: 'medium' },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
    source: { type: DataTypes.STRING(30), defaultValue: 'parsed' },
    // BPOS fields
    process_type: { type: DataTypes.STRING(30), defaultValue: 'student_project' },
    autonomy_level: { type: DataTypes.STRING(30), defaultValue: 'manual' },
    confidence_score: { type: DataTypes.FLOAT, allowNull: true },
    success_rate: { type: DataTypes.FLOAT, allowNull: true },
    failure_rate: { type: DataTypes.FLOAT, allowNull: true },
    approval_dependency_pct: { type: DataTypes.FLOAT, allowNull: true },
    linked_agents: { type: DataTypes.JSONB, defaultValue: [] },
    linked_backend_services: { type: DataTypes.JSONB, defaultValue: [] },
    linked_frontend_components: { type: DataTypes.JSONB, defaultValue: [] },
    strength_scores: { type: DataTypes.JSONB, allowNull: true },
    hitl_config: { type: DataTypes.JSONB, allowNull: true },
    lifecycle_status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    last_execution: { type: DataTypes.JSONB, allowNull: true },
    autonomy_history: { type: DataTypes.JSONB, defaultValue: [] },
    last_evaluated_at: { type: DataTypes.DATE, allowNull: true },
    execution_profile: { type: DataTypes.STRING(20), defaultValue: 'production' },
    strategy_template: { type: DataTypes.STRING(30), defaultValue: 'default' },
    mode_override: { type: DataTypes.STRING(20), allowNull: true },
    applicability_status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    department_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'departments', key: 'id' } },
    modes: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },  // null = all modes; ['mvp','production'] = only those
    frontend_route: { type: DataTypes.STRING(200), allowNull: true },  // e.g. "/admin/campaigns"
  },
  {
    sequelize, tableName: 'capabilities', timestamps: true, underscored: true,
    indexes: [{ fields: ['project_id'] }, { fields: ['project_id', 'name'], unique: true }],
  }
);

export default Capability;
