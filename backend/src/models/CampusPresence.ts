import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// "Which campus building is this learner in right now" (Colaberry Campus C4). One row per
// enrollment, upserted every ~30 s by the campus client while the campus is active; a row older
// than the 90 s freshness window means the learner has left (see campusPresenceService). Separate
// from community_members so the hot write never touches the community row. No websockets.
export interface CampusPresenceAttributes {
  enrollment_id: string;
  area: string;
  /** Campus HQ: the admin sidebar page an employee has open (Management Portal heartbeat); null everywhere else. */
  hq_path?: string | null;
  updated_at?: Date;
}

class CampusPresence extends Model<CampusPresenceAttributes> implements CampusPresenceAttributes {
  declare enrollment_id: string;
  declare area: string;
  declare hq_path: string | null;
  declare updated_at: Date;
}

CampusPresence.init(
  {
    enrollment_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    area: { type: DataTypes.STRING(32), allowNull: false },
    hq_path: { type: DataTypes.STRING(128), allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'campus_presence',
    timestamps: false,
    underscored: true,
    indexes: [{ fields: ['updated_at'], name: 'idx_campus_presence_updated' }],
  },
);

export default CampusPresence;
