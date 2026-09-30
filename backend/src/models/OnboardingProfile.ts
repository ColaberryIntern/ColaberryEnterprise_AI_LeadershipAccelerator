import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface OnboardingProfileAttributes {
  id?: string;
  enrollment_id: string;
  resume_text?: string | null;
  linkedin_url?: string | null;
  prefill?: any;    // mapped Partial<ProjectDnaInput> that seeds the wizard
  extracted?: any;  // raw structured extraction from the resume/LinkedIn
  // Uploaded resume FILE (kept for the student to view/download/replace from
  // Settings). Stored as base64 in the DB — redeploy-safe, no static serving.
  resume_file_name?: string | null;
  resume_mime?: string | null;
  resume_data?: string | null;        // base64-encoded file bytes
  resume_uploaded_at?: Date | null;
  // CAPE Phase 2 (design doc §13 "Extensions to existing structures"): which
  // resume upload + which extractor version produced the learner's current
  // resume_skill_claims / placement state. Bumped by
  // capeResumeClaimService.persistResumeSkillClaims on every successful
  // extraction; 0 means "no resume ever ingested" (Foundation mode, design
  // doc §5). See ensureCapePlacementSchema.ts for the column definitions.
  resume_version?: number;
  extractor_version?: string | null;
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
  declare resume_file_name: string | null;
  declare resume_mime: string | null;
  declare resume_data: string | null;
  declare resume_uploaded_at: Date | null;
  declare resume_version: number;
  declare extractor_version: string | null;
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
    resume_file_name: { type: DataTypes.STRING(255), allowNull: true },
    resume_mime: { type: DataTypes.STRING(120), allowNull: true },
    resume_data: { type: DataTypes.TEXT, allowNull: true },
    resume_uploaded_at: { type: DataTypes.DATE, allowNull: true },
    resume_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    extractor_version: { type: DataTypes.STRING(60), allowNull: true },
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
