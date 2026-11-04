import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/** A character range in an immutable version that the admin marked to redact for the public (PIA) copy, which the
 *  redacted renderer replaces with [REDACTED] (Proposal Studio P6). Schema: db/ensureGovProposalPackageSchema.ts. */
export interface GovProposalRedactionSpanAttributes {
  id?: string;
  version_id: string;
  span_start: number;
  span_end: number;
  label: string | null;
  created_by_identity_id?: string | null;
  created_at?: Date;
}

class GovProposalRedactionSpan extends Model<GovProposalRedactionSpanAttributes> implements GovProposalRedactionSpanAttributes {
  declare id: string;
  declare version_id: string;
  declare span_start: number;
  declare span_end: number;
  declare label: string | null;
  declare created_by_identity_id: string | null;
  declare created_at: Date;
}

GovProposalRedactionSpan.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    version_id: { type: DataTypes.UUID, allowNull: false },
    span_start: { type: DataTypes.INTEGER, allowNull: false },
    span_end: { type: DataTypes.INTEGER, allowNull: false },
    label: { type: DataTypes.TEXT, allowNull: true },
    created_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: 'GovProposalRedactionSpan', tableName: 'gov_proposal_redaction_spans', timestamps: false },
);

export default GovProposalRedactionSpan;
