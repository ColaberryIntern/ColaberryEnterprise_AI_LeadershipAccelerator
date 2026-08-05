import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DiagnosticAttempt — append-only record of one completed adaptive-diagnostic
 * or "test out" attempt (design doc §5 "Adaptive confirmation", §11 "Test
 * out", §13). Insert-only: `capeDiagnosticService.submitDiagnosticAttempt` is
 * the ONLY write path, via `findOrCreate` keyed on `idempotency_key` — a
 * retried submit with the same `attempt_id` returns the existing row's
 * outcome rather than re-scoring or duplicating.
 *
 * `trigger` distinguishes a system-prompted diagnostic from a learner-
 * initiated "test out" action for analytics/explainability only — both flow
 * through the identical scoring/outcome code path (never a separate ad hoc
 * mechanism).
 *
 * `outcome` is one of 'confirmed' | 'partial' | 'not_confirmed'. Diagnostic
 * outcomes feed ONLY `capePlacementService.computePlacementScore()` (the
 * placement/dotted-polygon path) in this phase — never
 * `student_skill_evidence`'s verified claim/knowledge/application/judgment
 * bands (see capePlacementService.ts doc comment for the full rationale).
 *
 * idempotency_key format (design doc §13): diagnostic:<attempt_id>:<skill_id>
 */
export type DiagnosticOutcome = 'confirmed' | 'partial' | 'not_confirmed';
export type DiagnosticTrigger = 'diagnostic_prompt' | 'test_out';

export interface DiagnosticAttemptAttributes {
  id?: string;
  enrollment_id: string;
  skill_id: string;
  trigger: DiagnosticTrigger;
  items: unknown[];
  outcome: DiagnosticOutcome;
  idempotency_key: string;
  created_at?: Date;
}

class DiagnosticAttempt extends Model<DiagnosticAttemptAttributes>
  implements DiagnosticAttemptAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare skill_id: string;
  declare trigger: DiagnosticTrigger;
  declare items: unknown[];
  declare outcome: DiagnosticOutcome;
  declare idempotency_key: string;
  declare created_at: Date;
}

DiagnosticAttempt.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    skill_id: { type: DataTypes.STRING(40), allowNull: false },
    trigger: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'diagnostic_prompt' },
    items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    outcome: { type: DataTypes.STRING(20), allowNull: false },
    idempotency_key: { type: DataTypes.STRING(300), allowNull: false, unique: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'diagnostic_attempts',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['idempotency_key'] },
      { fields: ['enrollment_id', 'skill_id'] },
    ],
  }
);

export default DiagnosticAttempt;
