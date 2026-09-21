import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * One workstream of an AI Project Factory contract. The parent is a delivery_projects row.
 * track_type is 'proposal' or 'solution_build'; a solution_build track points at the intern's
 * student build via solution_student_project_id (a projects.id reached through the
 * DeliveryProjectSourceLink bridge). Schema: db/ensureContractTrackSchema.ts.
 */
export interface ContractTrackAttributes {
  id?: string;
  delivery_project_id: string;
  track_type: 'proposal' | 'solution_build';
  status?: string | null;
  owner_identity_id?: string | null;
  solution_student_project_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ContractTrack extends Model<ContractTrackAttributes> implements ContractTrackAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare track_type: 'proposal' | 'solution_build';
  declare status: string | null;
  declare owner_identity_id: string | null;
  declare solution_student_project_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ContractTrack.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    track_type: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.TEXT, allowNull: true },
    owner_identity_id: { type: DataTypes.TEXT, allowNull: true },
    solution_student_project_id: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, tableName: 'contract_tracks', timestamps: true, underscored: true },
);

export default ContractTrack;
