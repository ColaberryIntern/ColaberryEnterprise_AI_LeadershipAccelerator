import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * The tool-readiness record — and the place the contract's three-state rule lives.
 *
 * "Implement three separate states: `acknowledged_requirement`,
 * `self_attested_ready`, `setup_verified_without_secret_collection`."
 *
 * They are genuinely different facts and collapsing them would lose the one that
 * matters. "I understand I need a key" is not "I have one", and neither is "we
 * watched a connectivity check succeed". Only the third is evidence, and it is the
 * only one that should ever unblock anything.
 *
 * ── THE NAME OF THE THIRD STATE IS THE WHOLE POINT ─────────────────────────
 *
 * `setup_verified_without_secret_collection`. Verification confirms the student
 * completed a safe setup exercise; it never captures the key. There is deliberately
 * NO column on this table that could hold one — not encrypted, not hashed, not
 * "last four". `verification_method` records HOW we checked ('connectivity_probe',
 * 'screenshare'), never WHAT we saw.
 */
export type AcknowledgementState =
  | 'acknowledged_requirement'
  | 'self_attested_ready'
  | 'setup_verified_without_secret_collection';

export const ACKNOWLEDGEMENT_STATES: readonly AcknowledgementState[] = [
  'acknowledged_requirement',
  'self_attested_ready',
  'setup_verified_without_secret_collection',
];

/** The requirements we track. A closed set — a typo cannot invent one. */
export type RequirementKey =
  | 'claude_code_account'
  | 'own_api_key_with_billing'
  | 'never_share_credentials';

export const REQUIREMENT_KEYS: readonly RequirementKey[] = [
  'claude_code_account',
  'own_api_key_with_billing',
  'never_share_credentials',
];

class InternshipRequirementAcknowledgement extends Model {
  declare id: string;
  declare application_id: string;
  declare requirement_key: RequirementKey;
  declare state: AcknowledgementState;
  declare acknowledged_at: Date;
  /** Set only when a human or a probe actually confirmed it. */
  declare verified_at: Date | null;
  /** How it was checked — never what was seen. */
  declare verification_method: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

InternshipRequirementAcknowledgement.init(
  {
    id:                  { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    application_id:      { type: DataTypes.UUID, allowNull: false },
    requirement_key:     { type: DataTypes.STRING(60), allowNull: false },
    state:               { type: DataTypes.STRING(50), allowNull: false },
    acknowledged_at:     { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    verified_at:         { type: DataTypes.DATE, allowNull: true },
    verification_method: { type: DataTypes.STRING(80), allowNull: true },
    created_at:          { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at:          { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'internship_requirement_acknowledgements',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

export default InternshipRequirementAcknowledgement;
