import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * CertDomain — one blueprint domain for a (track, blueprint_version), with its
 * objectives.
 *
 * `weight_pct` IS NULLABLE AND HAS NO DEFAULT. This is the single most important
 * thing about this model. The weights we currently believe (agentic 27, Claude
 * Code 20, prompting 20, tools 18, context 15) come from third-party community
 * guides, not from Anthropic — the official exam guide is behind the Partner
 * Academy login and has not been read. A NULL weight means "not yet known" and
 * scoring must say so; it must never be coerced to an equal share or to a
 * community figure. `weight_source` records provenance and defaults to
 * 'unverified'.
 *
 * `objectives` is a JSONB array of { objective_id, label } — the unit an evidence
 * mapping and a question both point at.
 *
 * Columns must match backend/src/db/ensureCertPrepSchema.ts EXACTLY.
 */

export type WeightSource = 'official' | 'community' | 'unverified';

export interface CertDomainObjective {
  objective_id: string;
  label: string;
}

export interface CertDomainAttributes {
  id?: string;
  track_id: string;
  blueprint_version: string;
  domain_id: string;
  label: string;
  description?: string | null;
  weight_pct?: number | null;
  weight_source?: WeightSource;
  display_order?: number;
  objectives?: CertDomainObjective[];
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

class CertDomain extends Model<CertDomainAttributes> implements CertDomainAttributes {
  declare id: string;
  declare track_id: string;
  declare blueprint_version: string;
  declare domain_id: string;
  declare label: string;
  declare description: string | null;
  declare weight_pct: number | null;
  declare weight_source: WeightSource;
  declare display_order: number;
  declare objectives: CertDomainObjective[];
  declare is_active: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

CertDomain.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    track_id: { type: DataTypes.STRING(40), allowNull: false },
    blueprint_version: { type: DataTypes.STRING(40), allowNull: false },
    domain_id: { type: DataTypes.STRING(40), allowNull: false },
    label: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    // NULL = weight not yet verified against the official guide. No default.
    weight_pct: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    weight_source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unverified' },
    display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    objectives: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    tableName: 'cert_domains',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default CertDomain;
