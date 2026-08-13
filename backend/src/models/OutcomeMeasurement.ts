import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Milestone 5 (Outcomes & Learning). One row = one scheduled-then-observed
// follow-up measurement for a ticket that reached `done`, per spec section 20.4
// ("completion proves implementation, outcome monitoring proves value") and the
// `outcome_measurements` table named in spec 14.2 ("baseline, target, observed
// result, observation window").
//
// v1 measures exactly one honest signal: whether a new ticket sharing the closed
// ticket's `(entity_type, entity_id)` or naming it as `parent_ticket_id` appears
// within the observation window (a proxy for "did this hold" — the ticket state
// machine has no literal reopen path, confirmed in DISCOVER: `done`/`cancelled` are
// terminal in `VALID_TRANSITIONS`). `outcome_status` is `insufficient_data`, never a
// fabricated `stable`, when the closed ticket has neither signal available to check.
//
// `UNIQUE (ticket_id, measurement_type)` is the idempotency key: scheduling twice for
// the same ticket (retry, race, or a future second measurement type) never creates a
// duplicate scheduled row — see outcomeMeasurementService.ts's `findOrCreate`.

export type OutcomeMeasurementType = 'ticket_recurrence_check';
export type OutcomeMeasurementStatus = 'scheduled' | 'observed' | 'skipped';
export type OutcomeStatus = 'pending' | 'stable' | 'recurrence_detected' | 'insufficient_data';

interface OutcomeMeasurementAttributes {
  id?: string;
  ticket_id: string;
  measurement_type: OutcomeMeasurementType;
  baseline: Record<string, any>;
  target: Record<string, any>;
  observation_window_days?: number;
  scheduled_for: Date;
  status?: OutcomeMeasurementStatus;
  observed_at?: Date | null;
  observed_result?: Record<string, any> | null;
  outcome_status?: OutcomeStatus;
  created_at?: Date;
  updated_at?: Date;
}

class OutcomeMeasurement extends Model<OutcomeMeasurementAttributes> implements OutcomeMeasurementAttributes {
  declare id: string;
  declare ticket_id: string;
  declare measurement_type: OutcomeMeasurementType;
  declare baseline: Record<string, any>;
  declare target: Record<string, any>;
  declare observation_window_days: number;
  declare scheduled_for: Date;
  declare status: OutcomeMeasurementStatus;
  declare observed_at: Date | null;
  declare observed_result: Record<string, any> | null;
  declare outcome_status: OutcomeStatus;
  declare created_at: Date;
  declare updated_at: Date;
}

OutcomeMeasurement.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'tickets', key: 'id' } },
    measurement_type: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'ticket_recurrence_check' },
    baseline: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    target: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    observation_window_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
    scheduled_for: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'scheduled' },
    observed_at: { type: DataTypes.DATE, allowNull: true },
    observed_result: { type: DataTypes.JSONB, allowNull: true },
    outcome_status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'outcome_measurements',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'] },
      { fields: ['scheduled_for'] },
      { fields: ['ticket_id', 'measurement_type'], unique: true },
    ],
  }
);

export default OutcomeMeasurement;
