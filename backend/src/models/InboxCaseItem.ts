import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import {
  CASE_SOURCE_TYPES,
  CASE_PROVIDERS,
  ITEM_INCLUSION_STATUSES,
  ITEM_DISPOSITIONS,
  CaseSourceType,
  CaseProvider,
  ItemInclusionStatus,
  ItemDisposition,
  MatchReason,
} from '../types/inboxCase';

// One row per evidence item (email, sent email, Basecamp record) pulled into
// a case's orbit during Discover/Connect. `source_hash` is the dedup key
// that prevents the same source item being pulled into a case twice across
// repeated discovery runs.

interface InboxCaseItemAttributes {
  id?: string;
  case_id: string;
  source_type: CaseSourceType;
  source_id: string;
  provider: CaseProvider;
  source_url: string | null;
  title: string;
  occurred_at: Date;
  match_score: number;
  match_reasons: MatchReason[];
  inclusion_status: ItemInclusionStatus;
  disposition: ItemDisposition | null;
  disposition_reason: string | null;
  snapshot: Record<string, unknown>;
  source_hash: string;
  created_at?: Date;
  updated_at?: Date;
}

class InboxCaseItem extends Model<InboxCaseItemAttributes> implements InboxCaseItemAttributes {
  declare id: string;
  declare case_id: string;
  declare source_type: CaseSourceType;
  declare source_id: string;
  declare provider: CaseProvider;
  declare source_url: string | null;
  declare title: string;
  declare occurred_at: Date;
  declare match_score: number;
  declare match_reasons: MatchReason[];
  declare inclusion_status: ItemInclusionStatus;
  declare disposition: ItemDisposition | null;
  declare disposition_reason: string | null;
  declare snapshot: Record<string, unknown>;
  declare source_hash: string;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxCaseItem.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    case_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'inbox_cases', key: 'id' } },
    source_type: { type: DataTypes.ENUM(...CASE_SOURCE_TYPES), allowNull: false },
    source_id: { type: DataTypes.STRING(255), allowNull: false },
    provider: { type: DataTypes.ENUM(...CASE_PROVIDERS), allowNull: false },
    source_url: { type: DataTypes.STRING(1000), allowNull: true },
    title: { type: DataTypes.STRING(500), allowNull: false },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    match_score: { type: DataTypes.DECIMAL(4, 3), allowNull: false, defaultValue: 0 },
    match_reasons: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    inclusion_status: { type: DataTypes.ENUM(...ITEM_INCLUSION_STATUSES), allowNull: false, defaultValue: 'CANDIDATE' },
    disposition: { type: DataTypes.ENUM(...ITEM_DISPOSITIONS), allowNull: true },
    disposition_reason: { type: DataTypes.TEXT, allowNull: true },
    snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    source_hash: { type: DataTypes.STRING(64), allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_case_items',
    timestamps: false,
    indexes: [
      { fields: ['case_id'], name: 'idx_inbox_case_items_case_id' },
      { fields: ['inclusion_status'], name: 'idx_inbox_case_items_inclusion_status' },
      { fields: ['disposition'], name: 'idx_inbox_case_items_disposition' },
      // Prevents the same source item from being duplicated within one case
      // across repeated discovery runs (root directive section 13).
      { unique: true, fields: ['case_id', 'source_hash'], name: 'uq_inbox_case_items_case_source_hash' },
    ],
  }
);

export default InboxCaseItem;
