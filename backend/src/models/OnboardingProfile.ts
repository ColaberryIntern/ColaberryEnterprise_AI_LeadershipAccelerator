import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface OnboardingProfileAttributes {
  id?: string;
  enrollment_id: string;
  resume_text?: string | null;
  linkedin_url?: string | null;
  prefill?: any;    // mapped Partial<ProjectDnaInput> that seeds the wizard
  extracted?: any;  // raw structured extraction from the resume/LinkedIn
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Background onboarding profile. Holds the resume/LinkedIn a student loaded
 * during onboarding and the structured `prefill` derived from it, which seeds
 * the ProjectDnaWizard so it runs progressively in the background instead of as
 * a blocking form. Decoupled from the committed ProjectDna (which is written
 * only when the student confirms the wizard).
 */
class OnboardingProfile extends Model<OnboardingProfileAttributes> implements OnboardingProfileAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare resume_text: string | null;
  declare linkedin_url: string | null;
  declare prefill: any;
  declare extracted: any;
  declare created_at: Date;
  declare updated_at: Date;
}

OnboardingProfile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'enrollments', key: 'id' } },
    resume_text: { type: DataTypes.TEXT, allowNull: true },
    linkedin_url: { type: DataTypes.STRING(500), allowNull: true },
    prefill: { type: DataTypes.JSONB, allowNull: true },
    extracted: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'onboarding_profiles',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['enrollment_id'], name: 'onboarding_profiles_unique_enrollment' },
    ],
  }
);

export default OnboardingProfile;
