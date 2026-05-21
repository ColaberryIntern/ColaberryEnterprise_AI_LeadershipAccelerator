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
  | 'accessibility' | 'hierarchy' | 'responsiveness' | 'workflow' | 'copy'
  // 2026-05-21 Visual Scan additions — broader categories for theme/design-system level findings.
  | 'theme' | 'data_density' | 'mobile';

export type CritiqueSeverity = 'low' | 'medium' | 'high';

// 2026-05-21: scope drives the GLOBAL vs PAGE-SPECIFIC sidebar split AND
// the compile-prompt template selection. 'page' = just this surface;
// 'global' = theme/design-system change that should apply across all pages;
// 'component' = a reusable component used in many places.
export type CritiqueScope = 'page' | 'global' | 'component';

// 2026-05-21: linear ticket lifecycle. Existing AcceptedDecisions table
// drives transitions but having a discrete column lets the sidebar render
// a progress strip without joining every render.
export type CritiqueLifecycle = 'suggested' | 'accepted' | 'built' | 'verified' | 'rejected';

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

  // 2026-05-21 Visual Scan + lifecycle additions.
  scope?: CritiqueScope;
  lifecycle_stage?: CritiqueLifecycle;
  title?: string | null;          // short headline; scan-generated, optional for manual annotations
  rationale?: string | null;      // why this matters; scan-generated, optional for manual
  related_routes?: string[];      // global-scope: routes that ALSO show this issue (Addition D)

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
  declare scope: CritiqueScope;
  declare lifecycle_stage: CritiqueLifecycle;
  declare title: string | null;
  declare rationale: string | null;
  declare related_routes: string[];
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
    // 2026-05-21 Visual Scan + lifecycle.
    scope: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'page' },
    lifecycle_stage: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'suggested' },
    title: { type: DataTypes.STRING(255), allowNull: true },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    related_routes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
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
