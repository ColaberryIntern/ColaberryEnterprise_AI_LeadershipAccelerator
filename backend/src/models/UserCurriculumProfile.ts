import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface UserCurriculumProfileAttributes {
  id?: string;
  enrollment_id: string;
  industry?: string;
  company_name?: string;
  company_size?: string;
  role?: string;
  goal?: string;
  ai_maturity_level?: number;
  strategy_call_notes?: string;
  internal_systems_json?: any;
  identified_use_case?: string;
  personalization_context_json?: any;
  created_at?: Date;
  updated_at?: Date;
}

class UserCurriculumProfile extends Model<UserCurriculumProfileAttributes> implements UserCurriculumProfileAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare industry: string;
  declare company_name: string;
  declare company_size: string;
  declare role: string;
  declare goal: string;
  declare ai_maturity_level: number;
  declare strategy_call_notes: string;
  declare internal_systems_json: any;
  declare identified_use_case: string;
  declare personalization_context_json: any;
  declare created_at: Date;
  declare updated_at: Date;
}

UserCurriculumProfile.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'enrollments', key: 'id' },
    },
    industry: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    company_size: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    goal: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ai_maturity_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    strategy_call_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    internal_systems_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    identified_use_case: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    personalization_context_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'user_curriculum_profiles',
    timestamps: false,
  }
);

export default UserCurriculumProfile;
