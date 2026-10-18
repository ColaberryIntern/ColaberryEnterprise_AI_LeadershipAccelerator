import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A per-(project, member) proposal SHARE grant (P5 Team & access): the level at which one delivery-project member
 * may see/work the proposal - 'none' | 'view' | 'comment' | 'edit'. It is a ROW, not a role change: sharing one
 * proposal with one intern never widens anyone else's access and never touches requireSection('program'). The
 * server projects the proposal to a safe shape per this level (govProposalShare.toSharedProposalView).
 *
 * Keyed (delivery_project_id, member_identity_id) UNIQUE; a re-share upserts in place. Additive, idempotent schema.
 */
export interface GovProposalShareGrantAttributes {
  id?: string;
  delivery_project_id: string;
  member_identity_id: string;
  level: string;
  created_at?: Date;
  updated_at?: Date;
}

class GovProposalShareGrant extends Model<GovProposalShareGrantAttributes> implements GovProposalShareGrantAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare member_identity_id: string;
  declare level: string;
  declare created_at: Date;
  declare updated_at: Date;
}

GovProposalShareGrant.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    member_identity_id: { type: DataTypes.UUID, allowNull: false },
    level: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'none' },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'GovProposalShareGrant',
    tableName: 'gov_proposal_share_grant',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id', 'member_identity_id'] }],
  },
);

export default GovProposalShareGrant;
