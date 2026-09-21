import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * A solicitation requirement — the compliance-matrix row. canonical_req_id is the id shared
 * across both tracks (the traceability spine); evidence_state carries "never present planned
 * as delivered". Schema: db/ensureContractTrackSchema.ts.
 *
 * `any` on the JSONB columns (tracks, source_evidence) is deliberate and follows the repo's
 * JSONB convention (Project.data_sources, StudentTask.acceptance): their real shape is the
 * typed factoryContract (ContractTrackType[] and block-id string[]), enforced by
 * factoryValidate() at the service boundary, not by the ORM attribute type.
 */
export interface ContractRequirementAttributes {
  id?: string;
  delivery_project_id: string;
  canonical_req_id: string;
  statement?: string | null;
  kind?: string | null;
  priority?: string | null;
  tracks?: any;
  source_document?: string | null;
  amendment_version?: string | null;
  section?: string | null;
  extracted_text?: string | null;
  interpretation?: string | null;
  human_confirmed?: boolean | null;
  evidence_state?: string | null;
  source_evidence?: any;
  created_at?: Date;
  updated_at?: Date;
}

class ContractRequirement extends Model<ContractRequirementAttributes> implements ContractRequirementAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare canonical_req_id: string;
  declare statement: string | null;
  declare kind: string | null;
  declare priority: string | null;
  declare tracks: any;
  declare source_document: string | null;
  declare amendment_version: string | null;
  declare section: string | null;
  declare extracted_text: string | null;
  declare interpretation: string | null;
  declare human_confirmed: boolean | null;
  declare evidence_state: string | null;
  declare source_evidence: any;
  declare created_at: Date;
  declare updated_at: Date;
}

ContractRequirement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    canonical_req_id: { type: DataTypes.TEXT, allowNull: false },
    statement: { type: DataTypes.TEXT, allowNull: true },
    kind: { type: DataTypes.TEXT, allowNull: true },
    priority: { type: DataTypes.TEXT, allowNull: true },
    tracks: { type: DataTypes.JSONB, allowNull: true },
    source_document: { type: DataTypes.TEXT, allowNull: true },
    amendment_version: { type: DataTypes.TEXT, allowNull: true },
    section: { type: DataTypes.TEXT, allowNull: true },
    extracted_text: { type: DataTypes.TEXT, allowNull: true },
    interpretation: { type: DataTypes.TEXT, allowNull: true },
    human_confirmed: { type: DataTypes.BOOLEAN, allowNull: true },
    evidence_state: { type: DataTypes.TEXT, allowNull: true },
    source_evidence: { type: DataTypes.JSONB, allowNull: true },
  },
  { sequelize, tableName: 'contract_requirements', timestamps: true, underscored: true },
);

export default ContractRequirement;
