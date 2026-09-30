import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ComponentAnalytics — rolling usage/quality metrics per AI Component. One row
 * per component_slug, upserted by the analytics service. Seeded with demo data
 * until real runtime traffic (Phase 3) populates it — never left as a placeholder.
 */
export interface ComponentAnalyticsAttributes {
  id?: string;
  component_slug: string;
  creation_count?: number;
  runtime_count?: number;
  avg_runtime_ms?: number;
  avg_cost_usd?: number;
  completion_pct?: number;
  dropoff_pct?: number;
  avg_rating?: number;
  prompt_quality?: number;      // 0-100
  evaluation_quality?: number;  // 0-100
  github_success_pct?: number;
  portfolio_success_pct?: number;
  domain_coverage?: any;        // { domain: pct }
  seeded?: boolean;
  updated_at?: Date;
}

class ComponentAnalytics extends Model<ComponentAnalyticsAttributes> implements ComponentAnalyticsAttributes {
  declare id: string;
  declare component_slug: string;
  declare creation_count: number;
  declare runtime_count: number;
  declare avg_runtime_ms: number;
  declare avg_cost_usd: number;
  declare completion_pct: number;
  declare dropoff_pct: number;
  declare avg_rating: number;
  declare prompt_quality: number;
  declare evaluation_quality: number;
  declare github_success_pct: number;
  declare portfolio_success_pct: number;
  declare domain_coverage: any;
  declare seeded: boolean;
  declare updated_at: Date;
}

ComponentAnalytics.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    component_slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    creation_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    runtime_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    avg_runtime_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    avg_cost_usd: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    completion_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    dropoff_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    avg_rating: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    prompt_quality: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    evaluation_quality: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    github_success_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    portfolio_success_pct: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    domain_coverage: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    seeded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'component_analytics', timestamps: false, indexes: [{ unique: true, fields: ['component_slug'] }] }
);

export default ComponentAnalytics;
