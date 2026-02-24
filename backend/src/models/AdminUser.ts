import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface AdminUserAttributes {
  id?: string;
  email: string;
  password_hash: string;
  role: string;
  created_at?: Date;
}

class AdminUser extends Model<AdminUserAttributes> implements AdminUserAttributes {
  public id!: string;
  public email!: string;
  public password_hash!: string;
  public role!: string;
  public created_at!: Date;
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
  },
  {
    sequelize,
    tableName: 'admin_users',
    timestamps: false,
  }
);

export default AdminUser;
