import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CareerPublication — one per learner. The public identity of their portfolio.
 *
 * `current_snapshot_id` is what the public page renders and stays NULL until a human
 * approves something, so there is no state in which a publication exists and quietly
 * serves unreviewed content. See ensureCareerPublicationSchema.ts.
 */
export type CareerPublicationStatus =
  | 'draft'              // never submitted, or changes were requested
  | 'in_review'          // a snapshot is waiting on a reviewer
  | 'published'          // an approved snapshot is live
  | 'suspended';         // was published, then withdrawn by staff

class CareerPublication extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare slug: string;
  declare status: CareerPublicationStatus;
  declare current_snapshot_id: string | null;
  declare talent_network_opt_in: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CareerPublication.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'draft' },
    current_snapshot_id: { type: DataTypes.UUID, allowNull: true },
    talent_network_opt_in: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, tableName: 'career_publications', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' },
);

export default CareerPublication;
