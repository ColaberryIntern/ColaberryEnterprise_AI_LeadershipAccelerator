import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryContract — the versioned agreement about what a project is for.
 *
 * `approved_snapshot` is the point of this table. The working row keeps changing as a
 * project evolves, but what was *agreed* has to stay readable exactly as it was agreed —
 * otherwise "the client accepted this" degrades into "the client accepted something, and
 * here is what the row says now". Approval freezes a copy; the copy is what a dispute,
 * an audit, or a case study reads.
 *
 * Versioned rather than mutated: `(delivery_project_id, version)` is unique, and a change
 * to an approved contract creates version N+1 rather than editing N.
 *
 * `data_sensitivity` is load-bearing rather than descriptive. It gates whether a Case
 * Study candidate can be generated at all (Gate 15), whether client facts may appear in
 * analytics payloads (master plan §11), and — for `regulated` — which delivery profile
 * and execution provider are permissible.
 */
export type ContractStatus = 'draft' | 'proposed' | 'approved' | 'superseded';

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  'draft',
  'proposed',
  'approved',
  'superseded',
];

export type DataSensitivity = 'public' | 'internal' | 'client_confidential' | 'regulated';

export const DATA_SENSITIVITIES: readonly DataSensitivity[] = [
  'public',
  'internal',
  'client_confidential',
  'regulated',
];

export interface DeliveryContractAttributes {
  id?: string;
  delivery_project_id: string;
  version?: number;
  status?: ContractStatus;
  business_outcome?: string | null;
  primary_users?: string | null;
  success_measures?: Record<string, any> | null;
  scope_in?: Record<string, any> | null;
  scope_out?: Record<string, any> | null;
  constraints?: Record<string, any> | null;
  data_sensitivity?: DataSensitivity;
  delivery_class?: string | null;
  acceptance_owner_identity_id?: string | null;
  technical_owner_identity_id?: string | null;
  client_responsibilities?: Record<string, any> | null;
  required_approvals?: Record<string, any> | null;
  required_delivery_profile?: string | null;
  definition_of_done?: Record<string, any> | null;
  operational_expectations?: Record<string, any> | null;
  change_policy?: string | null;
  /** Frozen at approval. Never written again for that version. */
  approved_snapshot?: Record<string, any> | null;
  approved_by_identity_id?: string | null;
  approved_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class DeliveryContract
  extends Model<DeliveryContractAttributes>
  implements DeliveryContractAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare version: number;
  declare status: ContractStatus;
  declare business_outcome: string | null;
  declare primary_users: string | null;
  declare success_measures: Record<string, any> | null;
  declare scope_in: Record<string, any> | null;
  declare scope_out: Record<string, any> | null;
  declare constraints: Record<string, any> | null;
  declare data_sensitivity: DataSensitivity;
  declare delivery_class: string | null;
  declare acceptance_owner_identity_id: string | null;
  declare technical_owner_identity_id: string | null;
  declare client_responsibilities: Record<string, any> | null;
  declare required_approvals: Record<string, any> | null;
  declare required_delivery_profile: string | null;
  declare definition_of_done: Record<string, any> | null;
  declare operational_expectations: Record<string, any> | null;
  declare change_policy: string | null;
  declare approved_snapshot: Record<string, any> | null;
  declare approved_by_identity_id: string | null;
  declare approved_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryContract.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    business_outcome: { type: DataTypes.TEXT, allowNull: true },
    primary_users: { type: DataTypes.TEXT, allowNull: true },
    success_measures: { type: DataTypes.JSONB, allowNull: true },
    scope_in: { type: DataTypes.JSONB, allowNull: true },
    scope_out: { type: DataTypes.JSONB, allowNull: true },
    constraints: { type: DataTypes.JSONB, allowNull: true },
    data_sensitivity: {
      type: DataTypes.STRING(30),
      allowNull: false,
      // Defaults to `internal`, not `public`. A contract nobody has classified must not
      // be publishable by omission.
      defaultValue: 'internal',
    },
    delivery_class: { type: DataTypes.STRING(40), allowNull: true },
    acceptance_owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    technical_owner_identity_id: { type: DataTypes.UUID, allowNull: true },
    client_responsibilities: { type: DataTypes.JSONB, allowNull: true },
    required_approvals: { type: DataTypes.JSONB, allowNull: true },
    required_delivery_profile: { type: DataTypes.STRING(60), allowNull: true },
    definition_of_done: { type: DataTypes.JSONB, allowNull: true },
    operational_expectations: { type: DataTypes.JSONB, allowNull: true },
    change_policy: { type: DataTypes.TEXT, allowNull: true },
    approved_snapshot: { type: DataTypes.JSONB, allowNull: true },
    approved_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_contracts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['delivery_project_id', 'version'],
        name: 'delivery_contracts_project_version_unique',
      },
    ],
  },
);

export default DeliveryContract;
