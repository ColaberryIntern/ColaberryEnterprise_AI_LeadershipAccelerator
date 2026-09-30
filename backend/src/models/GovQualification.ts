import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The Enterprise-owned government qualification record. Versioned + content-hashed and immutable per
 * (canonical_opportunity_id, version) — a new decision is a new version (fork-on-edit), never an overwrite.
 * Carries the IMMUTABLE OP source snapshot + version the decision was bound to. JSONB fields are `any` by the
 * repo convention (shape validated in the service, not the ORM). Schema: db/ensureGovQualificationSchema.ts.
 */
export interface GovQualificationAttributes {
  id?: string;
  tenant_id: string;
  organization_id?: string | null;
  bidding_entity: string;
  canonical_opportunity_id: string;
  delivery_project_id?: string | null;
  reviewer_identity_id?: string | null;
  decision?: string;
  rationale?: string | null;
  evidence_json?: any;
  effort_cap?: string | null;
  reassessment_conditions?: string | null;
  requirements_json?: any;
  source_snapshot?: any;
  source_snapshot_version?: number | null;
  source_available?: boolean | null;
  status?: string;
  version?: number;
  content_sha256?: string | null;
  superseded_by_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class GovQualification extends Model<GovQualificationAttributes> implements GovQualificationAttributes {
  declare id: string;
  declare tenant_id: string;
  declare organization_id: string | null;
  declare bidding_entity: string;
  declare canonical_opportunity_id: string;
  declare delivery_project_id: string | null;
  declare reviewer_identity_id: string | null;
  declare decision: string;
  declare rationale: string | null;
  declare evidence_json: any;
  declare effort_cap: string | null;
  declare reassessment_conditions: string | null;
  declare requirements_json: any;
  declare source_snapshot: any;
  declare source_snapshot_version: number | null;
  declare source_available: boolean | null;
  declare status: string;
  declare version: number;
  declare content_sha256: string | null;
  declare superseded_by_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

GovQualification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tenant_id: { type: DataTypes.UUID, allowNull: false },
    organization_id: { type: DataTypes.UUID, allowNull: true },
    bidding_entity: { type: DataTypes.TEXT, allowNull: false },
    canonical_opportunity_id: { type: DataTypes.TEXT, allowNull: false },
    delivery_project_id: { type: DataTypes.UUID, allowNull: true },
    reviewer_identity_id: { type: DataTypes.TEXT, allowNull: true },
    decision: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending_review' },
    rationale: { type: DataTypes.TEXT, allowNull: true },
    evidence_json: { type: DataTypes.JSONB, allowNull: true },
    effort_cap: { type: DataTypes.TEXT, allowNull: true },
    reassessment_conditions: { type: DataTypes.TEXT, allowNull: true },
    requirements_json: { type: DataTypes.JSONB, allowNull: true },
    source_snapshot: { type: DataTypes.JSONB, allowNull: true },
    source_snapshot_version: { type: DataTypes.INTEGER, allowNull: true },
    source_available: { type: DataTypes.BOOLEAN, allowNull: true },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    content_sha256: { type: DataTypes.STRING(64), allowNull: true },
    superseded_by_id: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, tableName: 'gov_qualifications', timestamps: true, underscored: true },
);

export default GovQualification;
