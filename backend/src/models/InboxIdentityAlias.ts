import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import { ALIAS_TYPES, AliasType } from '../types/inboxCase';

// Reusable, persisted identity resolution: "Kes" -> known email addresses,
// display-name variations, Basecamp person IDs, company domains. Discovered
// once (by a human confirming a match, or by the resolver at high
// confidence) and reused on every future case, per root directive section 5
// ("Do not hardcode Kes's identifiers. Discover and persist reusable
// identity aliases.").

interface InboxIdentityAliasAttributes {
  id?: string;
  canonical_name: string;
  alias_type: AliasType;
  alias_value: string;
  provider: string | null;
  external_person_id: string | null;
  confidence: number;
  verified_by: string | null;
  verified_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class InboxIdentityAlias extends Model<InboxIdentityAliasAttributes> implements InboxIdentityAliasAttributes {
  declare id: string;
  declare canonical_name: string;
  declare alias_type: AliasType;
  declare alias_value: string;
  declare provider: string | null;
  declare external_person_id: string | null;
  declare confidence: number;
  declare verified_by: string | null;
  declare verified_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InboxIdentityAlias.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    canonical_name: { type: DataTypes.STRING(200), allowNull: false },
    alias_type: { type: DataTypes.ENUM(...ALIAS_TYPES), allowNull: false },
    alias_value: { type: DataTypes.STRING(500), allowNull: false },
    provider: { type: DataTypes.STRING(30), allowNull: true },
    external_person_id: { type: DataTypes.STRING(100), allowNull: true },
    confidence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    verified_by: { type: DataTypes.STRING(100), allowNull: true },
    verified_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'inbox_identity_aliases',
    timestamps: false,
    indexes: [
      { fields: ['canonical_name'], name: 'idx_inbox_identity_aliases_canonical_name' },
      { fields: ['alias_type', 'alias_value'], name: 'idx_inbox_identity_aliases_type_value' },
      // A given alias value (e.g. one email address) maps to exactly one
      // canonical identity of a given type.
      { unique: true, fields: ['alias_type', 'alias_value'], name: 'uq_inbox_identity_aliases_type_value' },
    ],
  }
);

export default InboxIdentityAlias;
