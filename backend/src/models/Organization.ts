import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Organization — a free-trial management account. One row per company that a
 * manager registers. The manager keeps their own free student enrollment (dual
 * account); `owner_enrollment_id` links the org back to that enrollment. The
 * roster of teammates lives in `org_members`.
 */
export interface OrganizationAttributes {
  id?: string;
  name: string;
  owner_enrollment_id: string;
  created_at?: Date;
  updated_at?: Date;
}

class Organization extends Model<OrganizationAttributes> implements OrganizationAttributes {
  declare id: string;
  declare name: string;
  declare owner_enrollment_id: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Organization.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    owner_enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // one management account per manager enrollment (idempotent register)
      references: { model: 'enrollments', key: 'id' },
    },
  },
  {
    sequelize,
    tableName: 'organizations',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['owner_enrollment_id'], name: 'organizations_owner_enrollment_unique' },
    ],
  }
);

export default Organization;
