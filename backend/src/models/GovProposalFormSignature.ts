import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** Per-form, per-signer signature tracking for the proposal package (Proposal Studio P6). An unsigned REQUIRED form
 *  is fatal to export. Schema: db/ensureGovProposalPackageSchema.ts. */
export type SignatureStatus = 'unsigned' | 'signed';

export interface GovProposalFormSignatureAttributes {
  id?: string;
  delivery_project_id: string;
  form_key: string;
  signer_role: string;
  status: SignatureStatus;
  signed_file_path: string | null;
  required: boolean;
  updated_by_identity_id?: string | null;
  updated_at?: Date;
  created_at?: Date;
}

class GovProposalFormSignature extends Model<GovProposalFormSignatureAttributes> implements GovProposalFormSignatureAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare form_key: string;
  declare signer_role: string;
  declare status: SignatureStatus;
  declare signed_file_path: string | null;
  declare required: boolean;
  declare updated_by_identity_id: string | null;
  declare updated_at: Date;
  declare created_at: Date;
}

GovProposalFormSignature.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    form_key: { type: DataTypes.STRING(80), allowNull: false },
    signer_role: { type: DataTypes.STRING(120), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'unsigned' },
    signed_file_path: { type: DataTypes.TEXT, allowNull: true },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    updated_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'GovProposalFormSignature', tableName: 'gov_proposal_form_signatures', timestamps: false, indexes: [{ unique: true, fields: ['delivery_project_id', 'form_key', 'signer_role'] }] },
);

export default GovProposalFormSignature;
