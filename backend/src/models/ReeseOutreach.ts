import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// Reese Phase 2 (Autonomous Outreach). One row = one autonomous-outreach thread
// Reese has opened with one student for one detected risk signal. This is the
// state Phase 2's decision logic (duplicate-prevention, cadence cap, follow-up
// loop) is checked against — see reeseAutonomousOutreachService.ts and
// reeseOutreachFollowUpService.ts.
//
// Dedup contract: at most one `status='active'` row per (enrollment_id,
// signal_type) — enforced in code (reeseAutonomousOutreachService.ts checks
// before insert), backstopped by a real unique partial index here (see
// ensureReeseOutreachSchema.ts) so a race can't create two active rows for the
// same student+signal.
//
// `attempt_count` starts at 1 (creating the row IS the first send — there is no
// separate "scheduled, not yet sent" state, unlike M5's OutcomeMeasurement,
// because an outreach thread always begins with a real send).
export type ReeseOutreachSignalType = 'inactivity' | 'behavior_anomaly';
export type ReeseOutreachStatus = 'active' | 'goal_met' | 'signal_cleared' | 'escalated';

export interface ReeseOutreachAttributes {
  id?: string;
  enrollment_id: string;
  ticket_id: string;
  signal_type: ReeseOutreachSignalType;
  signal_snapshot: Record<string, any>;
  goal: string;
  status?: ReeseOutreachStatus;
  attempt_count?: number;
  last_contacted_at: Date;
  next_follow_up_due_at?: Date | null;
  risk_tier?: string;
  created_at?: Date;
  updated_at?: Date;
}

class ReeseOutreach extends Model<ReeseOutreachAttributes> implements ReeseOutreachAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare ticket_id: string;
  declare signal_type: ReeseOutreachSignalType;
  declare signal_snapshot: Record<string, any>;
  declare goal: string;
  declare status: ReeseOutreachStatus;
  declare attempt_count: number;
  declare last_contacted_at: Date;
  declare next_follow_up_due_at: Date | null;
  declare risk_tier: string;
  declare created_at: Date;
  declare updated_at: Date;
}

ReeseOutreach.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    enrollment_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'enrollments', key: 'id' } },
    ticket_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'tickets', key: 'id' } },
    signal_type: { type: DataTypes.STRING(30), allowNull: false },
    signal_snapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    goal: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    attempt_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    last_contacted_at: { type: DataTypes.DATE, allowNull: false },
    next_follow_up_due_at: { type: DataTypes.DATE, allowNull: true },
    risk_tier: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'R3' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'reese_autonomous_outreach',
    timestamps: false,
    indexes: [
      { fields: ['enrollment_id'] },
      { fields: ['status', 'next_follow_up_due_at'] },
      // Mirrors ensureReeseOutreachSchema.ts's real partial unique index
      // (WHERE status = 'active') — declared here for documentation/dev-sync
      // parity even though this model never calls sequelize.sync() (schema is
      // owned by the raw-SQL ensure function, same convention as
      // OutcomeMeasurement.ts). Sequelize's declarative `where` on an index
      // option does support partial indexes, so this is accurate, not just a
      // comment-only approximation.
      { fields: ['enrollment_id', 'signal_type'], unique: true, where: { status: 'active' } },
    ],
  }
);

export default ReeseOutreach;
