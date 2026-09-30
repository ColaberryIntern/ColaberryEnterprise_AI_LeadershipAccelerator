import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * consent_records — append-only consent / lawful-basis ledger for AI-driven outbound
 * (TBI audit P0-3, design in docs/ai-governance/consent-capture-design.md §3).
 *
 * Event-sourced: one row per consent EVENT (grant, revoke, pending). "Current" consent for a
 * (subject, channel) is the latest non-expired row (see consentService.getCurrentConsent). A
 * `revoked` row is written whenever suppression/unsubscribe fires, so this stays the single
 * source of truth for "are we allowed to contact X on channel Y". Never mutate rows — append.
 *
 * Created explicitly via consentService.ensureConsentSchema() (prod does not run sequelize.sync).
 */
export type ConsentSubjectType = 'lead' | 'contact' | 'email' | 'phone';
export type ConsentChannel = 'voice' | 'sms' | 'email';
export type ConsentStatus = 'granted' | 'revoked' | 'pending';
export type ConsentBasis =
  | 'express_written'
  | 'double_opt_in'
  | 'opt_in_form'
  | 'prior_relationship'
  | 'legitimate_interest'
  | 'cold_b2b_opt_out';
export type ConsentJurisdiction = 'US' | 'EU' | 'UK' | 'CA' | 'unknown';

interface ConsentRecordAttributes {
  id?: string;
  subject_type: ConsentSubjectType;
  subject_id: string;
  channel: ConsentChannel;
  status: ConsentStatus;
  basis?: ConsentBasis | null;
  jurisdiction?: ConsentJurisdiction | null;
  source?: string | null;
  evidence?: Record<string, any> | null;
  captured_at?: Date;
  revoked_at?: Date | null;
  expires_at?: Date | null;
  created_at?: Date;
}

class ConsentRecord extends Model<ConsentRecordAttributes> implements ConsentRecordAttributes {
  declare id: string;
  declare subject_type: ConsentSubjectType;
  declare subject_id: string;
  declare channel: ConsentChannel;
  declare status: ConsentStatus;
  declare basis: ConsentBasis | null;
  declare jurisdiction: ConsentJurisdiction | null;
  declare source: string | null;
  declare evidence: Record<string, any> | null;
  declare captured_at: Date;
  declare revoked_at: Date | null;
  declare expires_at: Date | null;
  declare created_at: Date;
}

ConsentRecord.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    subject_type: { type: DataTypes.STRING(16), allowNull: false },
    subject_id: { type: DataTypes.STRING(255), allowNull: false },
    channel: { type: DataTypes.STRING(8), allowNull: false },
    status: { type: DataTypes.STRING(10), allowNull: false },
    basis: { type: DataTypes.STRING(32), allowNull: true },
    jurisdiction: { type: DataTypes.STRING(10), allowNull: true },
    source: { type: DataTypes.STRING(120), allowNull: true },
    evidence: { type: DataTypes.JSONB, allowNull: true },
    captured_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'consent_records',
    timestamps: false,
    indexes: [
      { fields: ['subject_type', 'subject_id', 'channel'] },
      { fields: ['channel'] },
      { fields: ['status'] },
      { fields: ['captured_at'] },
    ],
  }
);

export default ConsentRecord;
