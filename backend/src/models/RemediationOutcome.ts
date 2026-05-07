/**
 * RemediationOutcome — observed outcome of a remediation attempt.
 *
 * One row per attempt. The learning engine reads these to compute success
 * rates per pattern signature, per remediation kind, per route prefix.
 *
 * Phase 10 §2.
 */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface Attrs {
  id?: string;
  project_id: string;
  /** The CognitiveIncident this remediation targets. */
  incident_id: string;
  /** The federated pattern signature this incident matched (if any). */
  pattern_signature: string | null;
  /** Remediation action description (matches CognitivePattern.successful_actions). */
  remediation_action: string;
  /** Was the remediation accepted by the user / orchestrator? */
  accepted: boolean;
  /** Did it actually get implemented (build manifest received)? */
  implemented: boolean;
  /** Did the underlying problem resolve? Drives the learning loop. */
  resolved: boolean;
  /** Pressure delta after the remediation (negative = pressure reduced). */
  pressure_delta: number | null;
  /** Cognition delta after the remediation. */
  cognition_delta: number | null;
  /** Whether the same pattern recurred within 7d (regression failure). */
  recurred_within_7d: boolean;
  /** Free-form context about why it succeeded or failed. */
  notes: string | null;
  observed_at: Date;
  created_at?: Date;
}

class RemediationOutcome extends Model<Attrs> implements Attrs {
  declare id: string;
  declare project_id: string;
  declare incident_id: string;
  declare pattern_signature: string | null;
  declare remediation_action: string;
  declare accepted: boolean;
  declare implemented: boolean;
  declare resolved: boolean;
  declare pressure_delta: number | null;
  declare cognition_delta: number | null;
  declare recurred_within_7d: boolean;
  declare notes: string | null;
  declare observed_at: Date;
  declare created_at: Date;
}

RemediationOutcome.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    project_id: { type: DataTypes.UUID, allowNull: false },
    incident_id: { type: DataTypes.UUID, allowNull: false },
    pattern_signature: { type: DataTypes.STRING(128), allowNull: true },
    remediation_action: { type: DataTypes.STRING(512), allowNull: false },
    accepted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    implemented: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    resolved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    pressure_delta: { type: DataTypes.FLOAT, allowNull: true },
    cognition_delta: { type: DataTypes.FLOAT, allowNull: true },
    recurred_within_7d: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    observed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'remediation_outcomes',
    timestamps: false,
    indexes: [
      { fields: ['project_id'] },
      { fields: ['incident_id'] },
      { fields: ['pattern_signature'] },
      { fields: ['observed_at'] },
    ],
  }
);

export default RemediationOutcome;
