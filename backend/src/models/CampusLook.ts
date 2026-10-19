import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// The avatar gear a learner has chosen (Colaberry Campus C9): one row per enrollment, upserted when they save "My look".
// Only the choice is stored; what is unlocked is computed from real points (services/campus/campusUnlocks.ts).
// Created lazily by db/ensureCampusLooksSchema.ts, like CampusPresence; not registered in models/index.ts.
export interface CampusLookAttributes {
  enrollment_id: string;
  equipped: Record<string, string>;
  updated_at?: Date;
}

class CampusLook extends Model<CampusLookAttributes> implements CampusLookAttributes {
  declare enrollment_id: string;
  declare equipped: Record<string, string>;
  declare updated_at: Date;
}

CampusLook.init(
  {
    enrollment_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    equipped: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'campus_looks', timestamps: false, underscored: true },
);

export default CampusLook;
