/**
 * BehavioralEvent — append-only log of behavioral signals from real users.
 *
 * Ingested via POST /api/portal/project/behavioral/event. Each row records
 * one observed behavioral signal: a click, hesitation, rage-click cluster,
 * navigation hop, form retry, abandonment, etc.
 *
 * Phase 6 §6.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type BehavioralEventKind =
  | 'click' | 'rage_click' | 'click_hesitation' | 'repeated_click'
  | 'nav_enter' | 'nav_exit' | 'nav_loop'
  | 'form_submit' | 'form_retry' | 'form_abandon'
  | 'scroll_abandon' | 'dead_end_exit' | 'action_confusion';

interface Attrs {
  id?: string;
  project_id: string;
  bp_id: string | null;
  /** Route the event happened on. */
  route: string;
  /** Anonymous session id supplied by the client. */
  session_id: string;
  kind: BehavioralEventKind;
  /** Optional CSS selector or coords identifying the targeted element. */
  target_selector: string | null;
  target_x: number | null;
  target_y: number | null;
  /** Optional duration in ms (e.g. hesitation length). */
  duration_ms: number | null;
  /** Free-form metadata bag. */
  metadata: any;
  observed_at: Date;
  created_at?: Date;
}

class BehavioralEvent extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare bp_id: string | null;
  declare route: string;
  declare session_id: string;
  declare kind: BehavioralEventKind;
  declare target_selector: string | null;
  declare target_x: number | null;
  declare target_y: number | null;
  declare duration_ms: number | null;
  declare metadata: any;
  declare observed_at: Date;
  declare created_at: Date;
}

BehavioralEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    bp_id: { type: DataTypes.UUID, allowNull: true },
    route: { type: DataTypes.STRING(255), allowNull: false },
    session_id: { type: DataTypes.STRING(64), allowNull: false },
    kind: { type: DataTypes.STRING(32), allowNull: false },
    target_selector: { type: DataTypes.STRING(512), allowNull: true },
    target_x: { type: DataTypes.INTEGER, allowNull: true },
    target_y: { type: DataTypes.INTEGER, allowNull: true },
    duration_ms: { type: DataTypes.INTEGER, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    observed_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'behavioral_events',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'observed_at'] },
      { fields: ['route'] },
      { fields: ['session_id'] },
      { fields: ['kind'] },
    ],
  }
);

export default BehavioralEvent;
