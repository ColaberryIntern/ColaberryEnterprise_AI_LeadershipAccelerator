import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The ADMIN's assignment of one Build-track story to a student builder (P3-T2). A gov operator reviews the derived
 * build plan and assigns a story to a delivery-project member who can build it. Assignment is the ONLY persisted
 * transition the plan adds: a story is derived `unassigned`, and an assignment row overlays it to `assigned` with
 * its assignee — it NEVER fabricates a built/verified state (evidence + reviewer verification are separate, gated).
 *
 * Keyed to the delivery project + the story id (STORY-<canonical_req_id>), with a UNIQUE (delivery_project_id,
 * story_id) so there is exactly one assignment per story and re-assigning is an idempotent upsert, never a
 * duplicate. `canonical_req_id` is stored alongside (the stable traceability anchor) so a revision that re-derives
 * stories can reconcile a persisted assignment back to its requirement. Mirrors the additive, idempotent pattern of
 * gov_build_story_evidence.
 */
export interface GovBuildStoryAssignmentAttributes {
  id?: string;
  delivery_project_id: string;
  /** The Build story assigned (STORY-<canonical_req_id>). */
  story_id: string;
  /** The requirement the story builds — the stable traceability anchor across revisions. */
  canonical_req_id: string;
  /** The delivery-project member the story is assigned to. Validated to hold story.execute at assign time. */
  assignee_identity_id: string;
  /** The operator who made the assignment (audit) — null only when the operator has no platform identity to record. */
  assigned_by_identity_id: string | null;
  assigned_at?: Date;
  updated_at?: Date;
}

class GovBuildStoryAssignment extends Model<GovBuildStoryAssignmentAttributes> implements GovBuildStoryAssignmentAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare story_id: string;
  declare canonical_req_id: string;
  declare assignee_identity_id: string;
  declare assigned_by_identity_id: string | null;
  declare assigned_at: Date;
  declare updated_at: Date;
}

GovBuildStoryAssignment.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    story_id: { type: DataTypes.STRING(120), allowNull: false },
    canonical_req_id: { type: DataTypes.STRING(120), allowNull: false },
    assignee_identity_id: { type: DataTypes.UUID, allowNull: false },
    assigned_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovBuildStoryAssignment',
    tableName: 'gov_build_story_assignment',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id', 'story_id'] }],
  },
);

export default GovBuildStoryAssignment;
