import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { ProposalBlueprint } from '../services/factory/proposal/proposalBlueprintTypes';

/**
 * A versioned proposal BLUEPRINT for one contract (Proposal Studio P2): the quoted, cited rulebook derived from the
 * stored solicitation ZIP — Section M scoring, Section L submission mechanics, required forms (incl. the Texas forms
 * rules engine) and addenda. `blueprint_json` holds the full ProposalBlueprint shape; every rule in it was verified
 * to literally quote the source before storage (never fabricate).
 *
 * Versioned, never overwritten: `reanalyze` inserts the next `version` so the reading history is kept and two
 * versions can be diffed. `source_sha256` records which exact bundle bytes produced the reading.
 * Schema: db/ensureGovProposalBlueprintSchema.ts.
 */
export interface GovProposalBlueprintAttributes {
  id?: string;
  delivery_project_id: string;
  version: number;
  source_sha256: string | null;
  blueprint_json: ProposalBlueprint;
  created_at?: Date;
  created_by_identity_id?: string | null;
}

class GovProposalBlueprint extends Model<GovProposalBlueprintAttributes> implements GovProposalBlueprintAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare version: number;
  declare source_sha256: string | null;
  declare blueprint_json: ProposalBlueprint;
  declare created_at: Date;
  declare created_by_identity_id: string | null;
}

GovProposalBlueprint.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    source_sha256: { type: DataTypes.TEXT, allowNull: true },
    blueprint_json: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_by_identity_id: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'GovProposalBlueprint',
    tableName: 'gov_proposal_blueprints',
    timestamps: false,
    indexes: [{ unique: true, fields: ['delivery_project_id', 'version'] }],
  },
);

export default GovProposalBlueprint;
