import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * PlatformIdentity — one human, once, across the whole ecosystem.
 *
 * This repository currently has three unrelated notions of a person: `Enrollment` (a
 * learner with portal access and payment state), `AdminUser` (an operator), and `Lead`
 * (a contact). The same human routinely exists as all three with no row tying them
 * together.
 *
 * This model is deliberately thin and deliberately NOT wired into any existing
 * authentication path by this project. Introducing it additively means the identity
 * graph can be populated and verified while every current login continues to work
 * unchanged; making it a required participant in auth is a separate change with its own
 * blast radius.
 *
 * Critically, a PlatformIdentity does not require an Enrollment. `organizations`
 * anchors on `owner_enrollment_id NOT NULL`, which is why a CPN community partner —
 * who will never enroll in a course — cannot be modelled through the existing tables at
 * all. That gap is the whole reason this table exists.
 */
export type PlatformIdentityStatus = 'active' | 'suspended';

export const PLATFORM_IDENTITY_STATUSES: readonly PlatformIdentityStatus[] = ['active', 'suspended'];

export interface PlatformIdentityAttributes {
  id?: string;
  /** Lower-cased and trimmed by the service layer before write. Unique. */
  primary_email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  status?: PlatformIdentityStatus;
  metadata?: Record<string, any> | null;
  created_at?: Date;
  updated_at?: Date;
}

class PlatformIdentity extends Model<PlatformIdentityAttributes> implements PlatformIdentityAttributes {
  declare id: string;
  declare primary_email: string;
  declare display_name: string | null;
  declare avatar_url: string | null;
  declare status: PlatformIdentityStatus;
  declare metadata: Record<string, any> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

PlatformIdentity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    primary_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    avatar_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'platform_identities',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['primary_email'], name: 'platform_identities_email_unique' },
      { fields: ['status'], name: 'idx_platform_identities_status' },
    ],
  }
);

export default PlatformIdentity;
