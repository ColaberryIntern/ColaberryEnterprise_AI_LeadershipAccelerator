import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface AdminUserAttributes {
  id?: string;
  email: string;
  password_hash: string;
  role: string;
  created_at?: Date;
  // Reese Phase 1 — additive staff-identity columns (see
  // backend/src/db/ensureAdminUserIdentitySchema.ts). All optional/nullable so
  // existing AdminUser rows are unaffected.
  display_name?: string | null;
  is_ai_operated?: boolean;
  agent_id?: string | null;
}

class AdminUser extends Model<AdminUserAttributes> implements AdminUserAttributes {
  declare id: string;
  declare email: string;
  declare password_hash: string;
  declare role: string;
  declare created_at: Date;
  declare display_name: string | null;
  declare is_ai_operated: boolean;
  declare agent_id: string | null;
}

AdminUser.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'admin',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    display_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    is_ai_operated: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'admin_users',
    timestamps: false,
  }
);

export default AdminUser;
