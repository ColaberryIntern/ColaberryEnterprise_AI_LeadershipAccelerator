import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The versioned decomposition document: the processes / roles / assignments / transitions /
 * allocation / role_map of a track, as a JSONB blob, content-hashed and versioned exactly like
 * build_plans stores plan_json + plan_sha256. Immutable per (delivery_project_id, track_type,
 * version) — a regeneration is a new version, never an overwrite. The approval columns make the
 * whole document approvable as a transaction (see services/factory/factoryApproval).
 * Schema: db/ensureContractTrackSchema.ts.
 *
 * `any` on doc_json is deliberate (repo JSONB convention): it holds the whole decomposition
 * document (processes/roles/assignments/edges/allocation/role_map), whose shape is the typed
 * factoryContract and whose integrity is checked by factoryValidate(), not by the ORM type.
 */
export interface ContractProcessDocumentAttributes {
  id?: string;
  delivery_project_id: string;
  track_type: string;
  version?: number;
  doc_json: any;
  content_sha256?: string | null;
  status?: string;
  approval_level?: string | null;
  enrichment_status?: string | null;
  superseded_by_id?: string | null;
  approved_at?: Date | null;
  approved_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class ContractProcessDocument extends Model<ContractProcessDocumentAttributes> implements ContractProcessDocumentAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare track_type: string;
  declare version: number;
  declare doc_json: any;
  declare content_sha256: string | null;
  declare status: string;
  declare approval_level: string | null;
  declare enrichment_status: string | null;
  declare superseded_by_id: string | null;
  declare approved_at: Date | null;
  declare approved_by: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ContractProcessDocument.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    track_type: { type: DataTypes.TEXT, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    doc_json: { type: DataTypes.JSONB, allowNull: false },
    content_sha256: { type: DataTypes.STRING(64), allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'draft' },
    approval_level: { type: DataTypes.TEXT, allowNull: true },
    enrichment_status: { type: DataTypes.TEXT, allowNull: true },
    superseded_by_id: { type: DataTypes.UUID, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
    approved_by: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, tableName: 'contract_process_documents', timestamps: true, underscored: true },
);

export default ContractProcessDocument;
