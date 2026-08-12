import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type OrgMemberRole = 'manager' | 'member';
export type OrgMemberInviteStatus = 'active' | 'invited';

/**
 * OrgMember — a person on an organization's roster. `enrollment_id` links to the
 * teammate's free student enrollment (nullable until the free account exists).
 * `email` is stored lower-cased and is unique per org (see the unique index on
 * (org_id, email)) so re-inviting the same person is idempotent. `team` is the
 * optional department label. The manager themself is a member with role
 * 'manager' / invite_status 'active'.
 */
export interface OrgMemberAttributes {
  id?: string;
  org_id: string;
  enrollment_id?: string | null;
  email: string;
  team?: string | null;
  role: OrgMemberRole;
  invite_status: OrgMemberInviteStatus;
  invited_by?: string | null;
  joined_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

class OrgMember extends Model<OrgMemberAttributes> implements OrgMemberAttributes {
  declare id: string;
  declare org_id: string;
  declare enrollment_id: string | null;
  declare email: string;
  declare team: string | null;
  declare role: OrgMemberRole;
  declare invite_status: OrgMemberInviteStatus;
  declare invited_by: string | null;
  declare joined_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

OrgMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    org_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'enrollments', key: 'id' },
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    team: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'member',
    },
    invite_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'invited',
    },
    invited_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'org_members',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['org_id', 'email'], name: 'org_members_org_email_unique' },
      { fields: ['org_id'], name: 'idx_org_members_org_id' },
      { fields: ['enrollment_id'], name: 'idx_org_members_enrollment_id' },
    ],
  }
);

export default OrgMember;
