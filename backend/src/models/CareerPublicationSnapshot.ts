import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CareerPublicationSnapshot — an immutable, frozen copy of a learner's portfolio as it
 * stood when they asked for review.
 *
 * APPEND-ONLY: there is no update or delete path to this table anywhere in the
 * codebase, the same contract StudentSkillEvidence holds for CAPE. This is what makes
 * build plan §23 true as a data property rather than as an intention — new class work
 * grows the private portfolio and CANNOT retroactively change what an employer saw.
 *
 * Review decisions deliberately live in CareerPublicationApproval, not here. "Immutable
 * except for the columns we mutate" is not immutable.
 */
class CareerPublicationSnapshot extends Model {
  declare id: string;
  declare publication_id: string;
  declare version: number;
  /** The frozen public representation. Written once, never updated. */
  declare payload: any;
  /** sha256 of payload — detects an unchanged resubmission (plan §61 idempotency). */
  declare content_hash: string;
  declare requested_at: Date;
  declare created_at: Date;
}

CareerPublicationSnapshot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    publication_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false },
    content_hash: { type: DataTypes.STRING(64), allowNull: false },
    requested_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'career_publication_snapshots', underscored: true, timestamps: false },
);

export default CareerPublicationSnapshot;
