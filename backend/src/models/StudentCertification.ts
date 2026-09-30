import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * StudentCertification — an external certification a student claims to have
 * passed, with the file they uploaded as proof and staff's decision on it.
 *
 * Decision D4 (2026-09-16): the student uploads the certificate in the Cert
 * section of the portal; a staff member approves or rejects it in the admin
 * section. ONLY an approved row counts toward AI Architect — "we are the
 * approvers". Cert Prep readiness (practice exams) is a different thing and
 * never substitutes for this row.
 *
 * Lifecycle: pending → approved | rejected. A rejected claim can be re-submitted
 * as a NEW row (the partial unique index below excludes rejected rows), so the
 * history of a bad upload is kept rather than overwritten.
 */
export type StudentCertificationStatus = 'pending' | 'approved' | 'rejected';

export interface StudentCertificationAttributes {
  id?: string;
  enrollment_id: string;
  /** Which certification. 'cca_f' = Claude Certified Architect – Foundations. */
  track: string;
  status: StudentCertificationStatus;
  /** Multer-assigned filename inside CERT_DIR (never a path the client chose). */
  file_name: string;
  file_mime: string;
  original_name?: string | null;
  /** The credential id / verification code printed on the certificate, if any. */
  credential_id?: string | null;
  /** The date the student says they passed. */
  passed_on?: string | null;
  note?: string | null;
  submitted_at: Date;
  reviewed_at?: Date | null;
  reviewed_by?: string | null;
  review_note?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

class StudentCertification extends Model<StudentCertificationAttributes> implements StudentCertificationAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare track: string;
  declare status: StudentCertificationStatus;
  declare file_name: string;
  declare file_mime: string;
  declare original_name: string | null;
  declare credential_id: string | null;
  declare passed_on: string | null;
  declare note: string | null;
  declare submitted_at: Date;
  declare reviewed_at: Date | null;
  declare reviewed_by: string | null;
  declare review_note: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

StudentCertification.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    track: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'cca_f' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    file_name: { type: DataTypes.STRING(255), allowNull: false },
    file_mime: { type: DataTypes.STRING(100), allowNull: false },
    original_name: { type: DataTypes.STRING(255), allowNull: true },
    credential_id: { type: DataTypes.STRING(120), allowNull: true },
    passed_on: { type: DataTypes.DATEONLY, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    reviewed_by: { type: DataTypes.STRING(255), allowNull: true },
    review_note: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'student_certifications',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['enrollment_id'], name: 'idx_student_certifications_enrollment' },
      { fields: ['status'], name: 'idx_student_certifications_status' },
    ],
  }
);

export default StudentCertification;
