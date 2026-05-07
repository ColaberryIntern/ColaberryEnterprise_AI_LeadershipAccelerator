/**
 * VisualCritiqueItem — one user-supplied annotation on a UI surface.
 *
 * Created during a VisualReviewSession. May trigger AI suggestions which
 * are stored in VisualAISuggestion (linked back via critique_id).
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CritiqueKind =
  | 'spacing' | 'alignment' | 'color' | 'typography' | 'interaction'
  | 'accessibility' | 'hierarchy' | 'responsiveness' | 'workflow' | 'copy';

export type CritiqueSeverity = 'low' | 'medium' | 'high';

interface Attrs {
  id?: string;
  session_id: string;
  project_id: string;

  kind: CritiqueKind;
  severity: CritiqueSeverity;
  description: string;

  /** Bounding box as { x, y, width, height } in viewport CSS pixels. */
  region: { x: number; y: number; width: number; height: number } | null;
  /** CSS selector targeted by the critique (when known). */
  target_selector: string | null;

  workflow_id: string | null;
  expected_outcome: string | null;

  created_by: string;
  created_at?: Date;
}

class VisualCritiqueItem extends Model<Attrs> implements Attrs {
  declare id: string;
  declare session_id: string;
  declare project_id: string;
  declare kind: CritiqueKind;
  declare severity: CritiqueSeverity;
  declare description: string;
  declare region: any;
  declare target_selector: string | null;
  declare workflow_id: string | null;
  declare expected_outcome: string | null;
  declare created_by: string;
  declare created_at: Date;
}

VisualCritiqueItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    session_id: { type: DataTypes.UUID, allowNull: false },
    project_id: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(32), allowNull: false },
    severity: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'medium' },
    description: { type: DataTypes.TEXT, allowNull: false },
    region: { type: DataTypes.JSONB, allowNull: true },
    target_selector: { type: DataTypes.STRING(512), allowNull: true },
    workflow_id: { type: DataTypes.STRING(255), allowNull: true },
    expected_outcome: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.STRING(255), allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'visual_critique_items',
    timestamps: false,
    indexes: [
      { fields: ['session_id'] },
      { fields: ['project_id'] },
      { fields: ['kind'] },
      { fields: ['severity'] },
    ],
  }
);

export default VisualCritiqueItem;
