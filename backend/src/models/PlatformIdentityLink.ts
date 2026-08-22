import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * PlatformIdentityLink — the bridge from one PlatformIdentity to the identities that
 * already exist: Lead, Enrollment, AdminUser.
 *
 * A join table rather than nullable columns on `platform_identities` because a person
 * can hold several of the same kind: two enrollments across two cohorts is normal, and
 * a person may appear as more than one lead before dedup catches it. Columns would cap
 * that at one each and force a rewrite the first time it happened.
 *
 * `linked_entity_id` is a STRING rather than a UUID because the three targets do not
 * share a key type: `leads.id` is an INTEGER autoincrement while `enrollments.id` and
 * `admin_users.id` are UUIDs. Storing the natural key as text keeps one table honest
 * instead of forcing a fake UUID onto leads.
 *
 * UNIQUE(link_type, linked_entity_id) is the safety property that matters: one lead
 * row can belong to exactly one platform identity. Without it, two identities could
 * both claim the same lead and the journey would fork.
 */
export type PlatformIdentityLinkType = 'lead' | 'enrollment' | 'admin_user';

export const PLATFORM_IDENTITY_LINK_TYPES: readonly PlatformIdentityLinkType[] = [
  'lead',
  'enrollment',
  'admin_user',
];

export interface PlatformIdentityLinkAttributes {
  id?: string;
  platform_identity_id: string;
  link_type: PlatformIdentityLinkType;
  linked_entity_id: string;
  /** The link the platform prefers when it must pick one of a kind. */
  is_primary?: boolean;
  /**
   * How the link was established — 'email_match', 'authenticated', 'manual', 'backfill'.
   * Recorded because a link created by weak matching must be distinguishable from one
   * a human confirmed; merging two people is not reversible in any useful sense.
   */
  link_source?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class PlatformIdentityLink
  extends Model<PlatformIdentityLinkAttributes>
  implements PlatformIdentityLinkAttributes
{
  declare id: string;
  declare platform_identity_id: string;
  declare link_type: PlatformIdentityLinkType;
  declare linked_entity_id: string;
  declare is_primary: boolean;
  declare link_source: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PlatformIdentityLink.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    platform_identity_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'platform_identities', key: 'id' },
    },
    link_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    // Text, not UUID: leads.id is INTEGER while enrollments.id / admin_users.id are
    // UUID. No foreign key for the same reason — one column cannot reference three
    // tables. Referential integrity is the service layer's job here.
    linked_entity_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    link_source: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'platform_identity_links',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['link_type', 'linked_entity_id'],
        name: 'platform_identity_links_type_entity_unique',
      },
      { fields: ['platform_identity_id'], name: 'idx_platform_identity_links_identity' },
    ],
  }
);

export default PlatformIdentityLink;
