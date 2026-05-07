/**
 * DOMSnapshot — captured DOM tree (sanitized JSON) for a route, used by
 * the vision analyzers.
 *
 * Stored separately from screenshots so the binary path concern is owned
 * elsewhere. Each snapshot is point-in-time; older ones are kept for
 * regression detection.
 *
 * Phase 6 §5.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  project_id: string;
  bp_id: string | null;
  route: string;
  /** Sanitized DOM tree (DOMNode shape). No content text. */
  dom_tree: any;
  /** Optional screenshot reference path. */
  screenshot_path: string | null;
  viewport_width: number | null;
  viewport_height: number | null;
  /** Cached vision analysis for fast read-back. */
  cached_vision_report: any | null;
  captured_at: Date;
  created_at?: Date;
}

class DOMSnapshot extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare bp_id: string | null;
  declare route: string;
  declare dom_tree: any;
  declare screenshot_path: string | null;
  declare viewport_width: number | null;
  declare viewport_height: number | null;
  declare cached_vision_report: any | null;
  declare captured_at: Date;
  declare created_at: Date;
}

DOMSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    bp_id: { type: DataTypes.UUID, allowNull: true },
    route: { type: DataTypes.STRING(255), allowNull: false },
    dom_tree: { type: DataTypes.JSONB, allowNull: false },
    screenshot_path: { type: DataTypes.STRING(512), allowNull: true },
    viewport_width: { type: DataTypes.INTEGER, allowNull: true },
    viewport_height: { type: DataTypes.INTEGER, allowNull: true },
    cached_vision_report: { type: DataTypes.JSONB, allowNull: true },
    captured_at: { type: DataTypes.DATE, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'dom_snapshots',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'route'] },
      { fields: ['project_id', 'captured_at'] },
      { fields: ['bp_id'] },
    ],
  }
);

export default DOMSnapshot;
