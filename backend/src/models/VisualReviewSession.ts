/**
 * VisualReviewSession — one session = one user critiquing one route's UI.
 *
 * Lifecycle:
 *   open → user adds critique items → AI generates suggestions → user accepts/
 *   rejects → prompt package generated → linked manifest after build → closed.
 *
 * Phase 5 §2.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type VisualReviewSessionStatus = 'open' | 'critiquing' | 'reviewing_suggestions' | 'prompt_generated' | 'closed' | 'abandoned';

interface Attrs {
  id?: string;
  project_id: string;
  bp_id: string | null;
  page_route: string;
  participant_sub: string;

  status: VisualReviewSessionStatus;
  opened_at: Date;
  closed_at: Date | null;

  primary_screenshot_path: string | null;
  dom_snapshot: any | null;
  generated_prompt: string | null;
  resulting_manifest_id: string | null;
  ux_score_before: number | null;
  ux_score_after: number | null;

  notes: string | null;

  created_at?: Date;
}

class VisualReviewSession extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare bp_id: string | null;
  declare page_route: string;
  declare participant_sub: string;
  declare status: VisualReviewSessionStatus;
  declare opened_at: Date;
  declare closed_at: Date | null;
  declare primary_screenshot_path: string | null;
  declare dom_snapshot: any | null;
  declare generated_prompt: string | null;
  declare resulting_manifest_id: string | null;
  declare ux_score_before: number | null;
  declare ux_score_after: number | null;
  declare notes: string | null;
  declare created_at: Date;
}

VisualReviewSession.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    bp_id: { type: DataTypes.UUID, allowNull: true },
    page_route: { type: DataTypes.STRING(255), allowNull: false },
    participant_sub: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'open' },
    opened_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    closed_at: { type: DataTypes.DATE, allowNull: true },
    primary_screenshot_path: { type: DataTypes.STRING(512), allowNull: true },
    dom_snapshot: { type: DataTypes.JSONB, allowNull: true },
    generated_prompt: { type: DataTypes.TEXT, allowNull: true },
    resulting_manifest_id: { type: DataTypes.UUID, allowNull: true },
    ux_score_before: { type: DataTypes.INTEGER, allowNull: true },
    ux_score_after: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'visual_review_sessions',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['project_id', 'opened_at'] },
      { fields: ['bp_id'] },
      { fields: ['status'] },
    ],
  }
);

export default VisualReviewSession;
