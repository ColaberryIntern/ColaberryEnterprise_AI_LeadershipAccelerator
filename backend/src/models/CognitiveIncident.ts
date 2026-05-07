/**
 * CognitiveIncident — first-class incident record for autonomously detected
 * problems (regressions, sustained friction, contradiction explosions, etc.).
 *
 * Lifecycle: open → updated (severity / evidence accumulates) → resolved or
 * acknowledged. Foundation for autonomous alerting (§13).
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type IncidentType =
  | 'ux_regression' | 'cognition_collapse' | 'sustained_rage_clicks'
  | 'escalating_abandonment' | 'contradiction_explosion' | 'pressure_critical'
  | 'visual_decay' | 'accessibility_regression';

export type IncidentState = 'open' | 'acknowledged' | 'resolved' | 'expired';

interface Attrs {
  id?: string;
  project_id: string;
  type: IncidentType;
  severity: 'info' | 'warning' | 'error';
  state: IncidentState;

  affected_routes: string[];
  cognition_impact: number | null;
  behavioral_evidence: any;
  visual_evidence: any;
  recommended_actions: string[];

  opened_at: Date;
  last_seen_at: Date;
  resolved_at: Date | null;
  acknowledged_by: string | null;

  occurrence_count: number;
  metadata: any;

  created_at?: Date;
}

class CognitiveIncident extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare type: IncidentType;
  declare severity: 'info' | 'warning' | 'error';
  declare state: IncidentState;
  declare affected_routes: string[];
  declare cognition_impact: number | null;
  declare behavioral_evidence: any;
  declare visual_evidence: any;
  declare recommended_actions: string[];
  declare opened_at: Date;
  declare last_seen_at: Date;
  declare resolved_at: Date | null;
  declare acknowledged_by: string | null;
  declare occurrence_count: number;
  declare metadata: any;
  declare created_at: Date;
}

CognitiveIncident.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.STRING(64), allowNull: false },
    severity: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'warning' },
    state: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'open' },
    affected_routes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    cognition_impact: { type: DataTypes.INTEGER, allowNull: true },
    behavioral_evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    visual_evidence: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    recommended_actions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
    acknowledged_by: { type: DataTypes.STRING(255), allowNull: true },
    occurrence_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'cognitive_incidents',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'state'] },
      { fields: ['type'] },
      { fields: ['severity'] },
      { fields: ['opened_at'] },
    ],
  }
);

export default CognitiveIncident;
