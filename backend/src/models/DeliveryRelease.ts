import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryRelease — a release candidate, its checks, and who approved it.
 *
 * `delivery_releases` did not exist. Gate 14 shipped `evaluateReleaseGate` as pure logic
 * with nothing to evaluate, and it had zero production callers for the same reason the
 * quality gate did: **there was no release to ask about.**
 *
 * ## A release is a record, not a deployment
 *
 * `releaseGate.ts` draws this line itself — `evaluateReleaseGate` answers *readiness*,
 * `assertDeploymentAuthorized` answers *may this be deployed*. They are separate
 * functions because they are separate questions, and conflating them would mean a row
 * appearing in this table could push code. It cannot.
 *
 * ## `approved_by_identity_id` is the point of the table
 *
 * The gate blocks with `approver_missing` when it is absent, and its own comment says **a
 * release is approved by a person, never by a pipeline**. Storing the approver alongside
 * the checks is what makes that auditable later rather than merely asserted at the moment
 * of approval — and `approved_at` next to it is what distinguishes "approved" from
 * "someone's id ended up in this column".
 */
export interface DeliveryReleaseAttributes {
  id: string;
  delivery_project_id: string;
  version: string;
  status: string;
  profile_key: string;
  candidate_sha: string | null;
  check_results: unknown[];
  waived_categories: string[];
  goals_scores: Record<string, unknown> | null;
  approved_by_identity_id: string | null;
  approved_at: Date | null;
  created_by_identity_id: string | null;
  created_at: Date;
  updated_at: Date;
}

class DeliveryRelease extends Model<DeliveryReleaseAttributes> implements DeliveryReleaseAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare version: string;
  declare status: string;
  declare profile_key: string;
  declare candidate_sha: string | null;
  declare check_results: unknown[];
  declare waived_categories: string[];
  declare goals_scores: Record<string, unknown> | null;
  declare approved_by_identity_id: string | null;
  declare approved_at: Date | null;
  declare created_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryRelease.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.STRING(60), allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'candidate' },
    // Promoted out of any blob because the gate derives its mandatory-check set from it:
    // a release cannot be interpreted without knowing which profile it was judged under.
    profile_key: { type: DataTypes.STRING(60), allowNull: false },
    candidate_sha: { type: DataTypes.STRING(64), allowNull: true },
    check_results: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    waived_categories: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    goals_scores: { type: DataTypes.JSONB, allowNull: true },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    created_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_releases',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // Two rows sharing a version would make "what shipped" unanswerable, which is the
      // one question a release record exists to answer.
      {
        unique: true,
        fields: ['delivery_project_id', 'version'],
        name: 'delivery_releases_project_version_unique',
      },
      { fields: ['delivery_project_id', 'status'], name: 'idx_delivery_releases_project_status' },
    ],
  },
);

export default DeliveryRelease;
